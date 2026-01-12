'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SessionStorage } from '@/lib/storage';
import { PromptSession } from '@/lib/types';
import { DiffViewer } from '@/components/DiffViewer';
import { format } from 'date-fns';

export function SessionContent({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [session, setSession] = useState<PromptSession | null>(null);

  const promptParam = searchParams.get('prompt');
  const selectedPromptIndex = promptParam !== null ? parseInt(promptParam, 10) : null;

  useEffect(() => {
    const loadedSession = SessionStorage.getSession(id);
    if (!loadedSession) {
      router.push('/session');
      return;
    }
    setSession(loadedSession);
  }, [id, router]);

  if (!session) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  const handlePromptClick = (index: number) => {
    router.push(`/session/${session.id}?prompt=${index}`);
  };

  // Session-level view: show all prompts summary
  if (selectedPromptIndex === null) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Session Summary
          </h1>

          {/* Main session info */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Initial Prompt
            </h2>
            <p className="text-sm text-gray-900 dark:text-gray-100 mb-3 max-h-[300px] overflow-y-auto whitespace-pre-wrap">
              {session.prompt}
            </p>
            <div className="flex gap-4 text-xs text-gray-600 dark:text-gray-400">
              <span>{session.files.length} files changed</span>
              <span>•</span>
              <span>{format(new Date(session.createdAt), 'MMM d, yyyy h:mm a')}</span>
            </div>
          </div>

          {/* Per-prompt changes */}
          {session.perPromptChanges && session.perPromptChanges.length > 0 ? (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Prompts in this Session ({session.perPromptChanges.length})
              </h2>
              <div className="space-y-2">
                {session.perPromptChanges.map((prompt, index) => (
                  <div
                    key={index}
                    onClick={() => handlePromptClick(index)}
                    className="p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Prompt {index + 1}
                      </h3>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {format(new Date(prompt.timestamp), 'h:mm a')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 mb-2">
                      {prompt.prompt}
                    </p>
                    <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span>{prompt.files.length} files</span>
                      <span>•</span>
                      <span className="font-mono text-xs">{prompt.hash.substring(0, 8)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Files Changed ({session.files.length})
              </h2>
              <div className="flex flex-wrap gap-2 mb-4">
                {session.files.map((file) => (
                  <span
                    key={file}
                    className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700"
                  >
                    {file}
                  </span>
                ))}
              </div>

              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Diff
              </h2>
              <DiffViewer diffText={session.diff} sessionKey={`session-${session.id}`} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Prompt-level view: show specific prompt
  const selectedPrompt = session.perPromptChanges?.[selectedPromptIndex];
  if (!selectedPrompt) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500 text-sm">Prompt not found</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center gap-2 mb-4 text-xs text-gray-600 dark:text-gray-400">
          <button
            onClick={() => router.push(`/session/${session.id}`)}
            className="hover:text-blue-600 dark:hover:text-blue-400"
          >
            ← Back to session
          </button>
          <span>•</span>
          <span>Prompt {selectedPromptIndex + 1}</span>
        </div>

        {/* Prompt */}
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Prompt
          </h2>
          <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">
            {selectedPrompt.prompt}
          </div>
        </div>

        {selectedPrompt.response ? (
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Response
            </h2>
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">
              {selectedPrompt.response}
            </div>
          </div>
        ) : null}

        {/* Files Changed */}
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Files Changed ({selectedPrompt.files.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {selectedPrompt.files.map((file) => (
              <span
                key={file}
                className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700"
              >
                {file}
              </span>
            ))}
          </div>
        </div>

        {/* Diff Viewer */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Diff
          </h2>
          {selectedPrompt.diff ? (
            <DiffViewer
              diffText={selectedPrompt.diff}
              sessionKey={`prompt-${selectedPrompt.hash}`}
            />
          ) : (
            <div className="text-center text-gray-500 py-8 text-sm">
              No changes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
