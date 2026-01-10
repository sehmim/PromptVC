'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileDiff } from '@/lib/types';
import { parseDiff, getLanguageFromFilename } from '@/lib/diffParser';
import { useSessionStore } from '@/lib/store';
import { SessionStorage } from '@/lib/storage';
import hljs from 'highlight.js';

interface DiffViewerProps {
  diffText: string;
  sessionKey: string; // For storing viewed state
}

export function DiffViewer({ diffText, sessionKey }: DiffViewerProps) {
  const files = useMemo(() => parseDiff(diffText), [diffText]);
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set());
  const [focusedFile, setFocusedFile] = useState<string | null>(null);
  const diffViewMode = useSessionStore((state) => state.diffViewMode);
  const fileRefs = useRef<Map<string, HTMLDetailsElement>>(new Map());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const totalLines = useMemo(() => {
    return files.reduce((sum, file) => {
      const fileLines = file.hunks.reduce((hunkSum, hunk) => hunkSum + hunk.lines.length, 0);
      return sum + fileLines;
    }, 0);
  }, [files]);
  const shouldHighlight = totalLines <= 2000;

  useEffect(() => {
    // Load viewed state from localStorage
    const viewed = SessionStorage.getViewedFiles(sessionKey);
    setViewedFiles(viewed);
  }, [diffText, sessionKey]);

  useEffect(() => {
    if (!shouldHighlight) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    // Apply syntax highlighting
    const blocks = Array.from(
      container.querySelectorAll('.line-content code')
    ) as HTMLElement[];
    const pending = blocks.filter((block) => block.dataset.highlighted !== 'yes');
    if (pending.length === 0) {
      return;
    }

    let cancelled = false;
    let index = 0;
    const schedule = (callback: () => void) => {
      const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback;
      if (idle) {
        idle(callback, { timeout: 200 });
      } else {
        requestAnimationFrame(callback);
      }
    };

    const highlightBatch = () => {
      if (cancelled) {
        return;
      }
      const start = performance.now();
      while (index < pending.length && performance.now() - start < 8) {
        hljs.highlightElement(pending[index]);
        index += 1;
      }
      if (index < pending.length) {
        schedule(highlightBatch);
      }
    };

    schedule(highlightBatch);
    return () => {
      cancelled = true;
    };
  }, [files, diffViewMode, shouldHighlight]);

  const handleFileViewed = (fileName: string, checked: boolean) => {
    const newViewed = new Set(viewedFiles);
    if (checked) {
      newViewed.add(fileName);
    } else {
      newViewed.delete(fileName);
    }
    setViewedFiles(newViewed);
    SessionStorage.setViewedFiles(sessionKey, newViewed);
  };

  const scrollToFile = (fileName: string) => {
    const element = fileRefs.current.get(fileName);
    if (element) {
      element.open = true;
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setFocusedFile(fileName);
      setTimeout(() => setFocusedFile(null), 2000);
    }
  };

  if (files.length === 0) {
    return (
      <div className="text-gray-500 text-center py-8 text-sm">
        No diff available
      </div>
    );
  }

  return (
    <div ref={containerRef} className="diff-viewer">
      {/* Header with file count and view toggle */}
      <div className="flex items-center justify-between mb-3 p-2 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          {files.length} {files.length === 1 ? 'File' : 'Files'} Changed
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => useSessionStore.setState({ diffViewMode: 'unified' })}
            className={`px-2 py-1 rounded text-xs ${
              diffViewMode === 'unified'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            Unified
          </button>
          <button
            onClick={() => useSessionStore.setState({ diffViewMode: 'split' })}
            className={`px-2 py-1 rounded text-xs ${
              diffViewMode === 'split'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            Split
          </button>
        </div>
      </div>

      {/* Files list for quick navigation */}
      <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
        <div className="space-y-1">
          {files.map((file) => (
            <button
              key={file.fileName}
              onClick={() => scrollToFile(file.fileName)}
              className="w-full flex items-center justify-between px-2 py-1 text-left hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            >
              <span className="text-xs font-mono text-gray-900 dark:text-gray-100 truncate">
                {file.fileName}
              </span>
              <div className="flex items-center gap-2 text-xs flex-shrink-0 ml-2">
                <span className="text-green-600 dark:text-green-400">+{file.additions}</span>
                <span className="text-red-600 dark:text-red-400">-{file.deletions}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* File diffs */}
      <div className="space-y-3">
        {files.map((file) => (
          <details
            key={file.fileName}
            ref={(el) => {
              if (el) fileRefs.current.set(file.fileName, el);
            }}
            open
            className={`file-diff border border-gray-300 dark:border-gray-700 rounded overflow-hidden ${
              viewedFiles.has(file.fileName) ? 'opacity-60' : ''
            } ${focusedFile === file.fileName ? 'ring-2 ring-blue-500' : ''}`}
          >
            <summary className="file-diff-header sticky top-0 z-10 bg-gray-100 dark:bg-gray-800 px-3 py-2 cursor-pointer flex items-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700">
              <span className="font-mono text-xs flex-1">{file.fileName}</span>
              <span className="text-green-600 dark:text-green-400 text-xs">+{file.additions}</span>
              <span className="text-red-600 dark:text-red-400 text-xs">-{file.deletions}</span>
            </summary>

            <div className="file-diff-content">
              {diffViewMode === 'unified' ? (
                <UnifiedDiff file={file} />
              ) : (
                <SplitDiff file={file} />
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function UnifiedDiff({ file }: { file: FileDiff }) {
  const language = getLanguageFromFilename(file.fileName);

  return (
    <div className="unified-diff">
      {file.hunks.map((hunk, hunkIndex) => (
        <div key={hunkIndex} className="hunk">
          <div className="hunk-header bg-gray-200 dark:bg-gray-700 px-4 py-1 text-xs font-mono text-gray-600 dark:text-gray-400">
            {hunk.header}
          </div>
          <table className="w-full border-collapse">
            <tbody>
              {hunk.lines.map((line, lineIndex) => (
                <tr
                  key={lineIndex}
                  className={`diff-line diff-line-${line.type}`}
                >
                  <td className="line-number text-right w-10 px-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 select-none">
                    {line.oldLineNumber ?? ''}
                  </td>
                  <td className="line-number text-right w-10 px-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 select-none">
                    {line.newLineNumber ?? ''}
                  </td>
                  <td className="line-indicator w-5 text-center text-xs font-bold select-none">
                    {line.type === 'addition' ? '+' : line.type === 'deletion' ? '-' : ' '}
                  </td>
                  <td className="line-content font-mono text-xs">
                    <code data-language={language} className="whitespace-pre-wrap break-all">
                      {line.content}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function SplitDiff({ file }: { file: FileDiff }) {
  const language = getLanguageFromFilename(file.fileName);

  return (
    <div className="split-diff">
      {file.hunks.map((hunk, hunkIndex) => (
        <div key={hunkIndex} className="hunk">
          <div className="hunk-header bg-gray-200 dark:bg-gray-700 px-4 py-1 text-xs font-mono text-gray-600 dark:text-gray-400">
            {hunk.header}
          </div>
          <table className="w-full border-collapse">
            <tbody>
              {hunk.lines.map((line, lineIndex) => {
                if (line.type === 'context') {
                  return (
                    <tr key={lineIndex} className="diff-line-context">
                      <td className="line-number text-right w-10 px-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 select-none">
                        {line.oldLineNumber}
                      </td>
                      <td className="line-content font-mono text-xs w-1/2 border-r border-gray-300 dark:border-gray-700 px-2">
                        <code data-language={language} className="whitespace-pre-wrap break-all">
                          {line.content}
                        </code>
                      </td>
                      <td className="line-number text-right w-10 px-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 select-none">
                        {line.newLineNumber}
                      </td>
                      <td className="line-content font-mono text-xs w-1/2 px-2">
                        <code data-language={language} className="whitespace-pre-wrap break-all">
                          {line.content}
                        </code>
                      </td>
                    </tr>
                  );
                } else if (line.type === 'deletion') {
                  return (
                    <tr key={lineIndex} className="diff-line-deletion">
                      <td className="line-number text-right w-10 px-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 select-none">
                        {line.oldLineNumber}
                      </td>
                      <td className="line-content font-mono text-xs w-1/2 border-r border-gray-300 dark:border-gray-700 px-2 bg-red-50 dark:bg-red-900/20">
                        <code data-language={language} className="whitespace-pre-wrap break-all">
                          {line.content}
                        </code>
                      </td>
                      <td className="line-number bg-gray-100 dark:bg-gray-800 w-10"></td>
                      <td className="line-content bg-gray-100 dark:bg-gray-800 w-1/2"></td>
                    </tr>
                  );
                } else {
                  return (
                    <tr key={lineIndex} className="diff-line-addition">
                      <td className="line-number bg-gray-100 dark:bg-gray-800 w-10"></td>
                      <td className="line-content bg-gray-100 dark:bg-gray-800 w-1/2 border-r border-gray-300 dark:border-gray-700"></td>
                      <td className="line-number text-right w-10 px-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 select-none">
                        {line.newLineNumber}
                      </td>
                      <td className="line-content font-mono text-xs w-1/2 px-2 bg-green-50 dark:bg-green-900/20">
                        <code data-language={language} className="whitespace-pre-wrap break-all">
                          {line.content}
                        </code>
                      </td>
                    </tr>
                  );
                }
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
