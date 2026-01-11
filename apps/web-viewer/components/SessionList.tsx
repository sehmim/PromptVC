'use client';

import { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useSessionStore } from '@/lib/store';
import { PromptSession } from '@/lib/types';
import { format } from 'date-fns';

export function SessionList() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sessions = useSessionStore((state) => state.sessions);
  const addSessions = useSessionStore((state) => state.addSessions);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  // Auto-expand session if viewing a prompt inside it
  useEffect(() => {
    const currentSessionId = pathname.startsWith('/session/') ? pathname.split('/')[2] : null;
    const hasPromptParam = searchParams.get('prompt') !== null;

    if (currentSessionId && hasPromptParam) {
      setExpandedSessions((prev) => {
        if (!prev.has(currentSessionId)) {
          const newSet = new Set(prev);
          newSet.add(currentSessionId);
          return newSet;
        }
        return prev;
      });
    }
  }, [pathname, searchParams]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();

      reader.onload = () => {
        try {
          const content = reader.result as string;
          const data = JSON.parse(content);

          // Handle both single session and array of sessions
          const sessionsToAdd: PromptSession[] = Array.isArray(data) ? data : [data];
          addSessions(sessionsToAdd);

          // Navigate to first session if only one was added
          if (sessionsToAdd.length === 1) {
            router.push(`/session/${sessionsToAdd[0].id}`);
          }
        } catch (error) {
          console.error('Error parsing sessions file:', error);
          alert('Error parsing sessions file. Please ensure it\'s a valid JSON file.');
        }
      };

      reader.readAsText(file);
    });
  }, [addSessions, router]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/json': ['.json'],
    },
    multiple: true,
  });

  const toggleSessionExpanded = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedSessions((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId);
      } else {
        newSet.add(sessionId);
      }
      return newSet;
    });
  };

  const handleSessionClick = (sessionId: string) => {
    router.push(`/session/${sessionId}`);
  };

  const handlePromptClick = (sessionId: string, promptIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    router.push(`/session/${sessionId}?prompt=${promptIndex}`);
  };

  const isSessionSelected = (sessionId: string) => {
    return pathname === `/session/${sessionId}` && !searchParams.get('prompt');
  };

  const isPromptSelected = (sessionId: string, promptIndex: number) => {
    return pathname === `/session/${sessionId}` && searchParams.get('prompt') === String(promptIndex);
  };

  const getProviderIcon = (provider: string) => {
    if (provider === 'codex') {
      return '/codex.svg';
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Upload zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-4 mb-4 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-300 dark:border-gray-700 hover:border-blue-400'
        }`}
      >
        <input {...getInputProps()} />
        <svg
          className="mx-auto h-8 w-8 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
          {isDragActive ? 'Drop here' : 'Upload sessions.json'}
        </p>
      </div>

      {/* Tree view */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            <p className="text-xs">No sessions</p>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => {
              const isExpanded = expandedSessions.has(session.id);
              const hasPrompts = session.perPromptChanges && session.perPromptChanges.length > 0;
              const sessionSelected = isSessionSelected(session.id);
              const providerIcon = getProviderIcon(session.provider);

              return (
                <div key={session.id} className="text-xs">
                  {/* Session row */}
                  <div
                    onClick={() => handleSessionClick(session.id)}
                    className={`flex items-center gap-1 p-1.5 rounded cursor-pointer transition-colors ${
                      sessionSelected
                        ? 'bg-blue-100 dark:bg-blue-900/30'
                        : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {hasPrompts && (
                      <button
                        onClick={(e) => toggleSessionExpanded(session.id, e)}
                        className="p-0.5 hover:bg-gray-300 dark:hover:bg-gray-600 rounded flex-shrink-0"
                      >
                        <svg
                          className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" />
                        </svg>
                      </button>
                    )}
                    {!hasPrompts && <div className="w-4" />}
                    {providerIcon && (
                      <img
                        src={providerIcon}
                        alt={`${session.provider} icon`}
                        className="w-3.5 h-3.5 p-0.5 flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 dark:text-gray-100 truncate">
                        {session.prompt.substring(0, 50)}...
                      </p>
                      <p className="text-gray-500 dark:text-gray-400 text-xs">
                        {session.files.length} files • {format(new Date(session.createdAt), 'MMM d')}
                      </p>
                    </div>
                  </div>

                  {/* Prompts (if expanded) */}
                  {hasPrompts && isExpanded && (
                    <div className="ml-4 mt-1 space-y-1 border-l border-gray-300 dark:border-gray-700 pl-2">
                      {session.perPromptChanges!.map((prompt, index) => {
                        const promptSelected = isPromptSelected(session.id, index);
                        return (
                          <div
                            key={index}
                            onClick={(e) => handlePromptClick(session.id, index, e)}
                            className={`p-1.5 rounded cursor-pointer transition-colors ${
                              promptSelected
                                ? 'bg-blue-100 dark:bg-blue-900/30'
                                : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                            }`}
                          >
                            <p className="text-gray-900 dark:text-gray-100 truncate">
                              {prompt.prompt.substring(0, 40)}...
                            </p>
                            <p className="text-gray-500 dark:text-gray-400 text-xs">
                              {prompt.files.length} files
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
