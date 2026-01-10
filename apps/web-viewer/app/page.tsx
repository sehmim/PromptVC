'use client';

import { useSessionStore } from '@/lib/store';

export default function Home() {
  const sessions = useSessionStore((state) => state.sessions);

  return (
    <div className="flex items-center justify-center h-full p-8">
      <div className="text-center max-w-2xl">
        {sessions.length === 0 ? (
          <>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              PromptVC Web Viewer
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-8">
              Upload your sessions to view prompt diffs
            </p>

            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 text-left">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
                How to get your sessions file:
              </h2>

              <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
                <div>
                  <p className="font-medium mb-1">From VS Code Extension:</p>
                  <p className="text-xs">Click the "Download Sessions" button (cloud icon) in the PromptVC sidebar</p>
                </div>

                <div>
                  <p className="font-medium mb-1">From File System:</p>
                  <p className="text-xs mb-2">Located at: <code className="bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">.promptvc/sessions.json</code></p>
                  <ul className="text-xs space-y-1 ml-4">
                    <li>• VS Code: Right-click sessions.json → "Reveal in Finder"</li>
                    <li>• macOS: Press ⌘+Shift+. to show hidden files</li>
                    <li>• Terminal: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">cp .promptvc/sessions.json ~/Desktop/</code></li>
                  </ul>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {sessions.length} Session{sessions.length !== 1 ? 's' : ''} Loaded
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Select a session from the sidebar to view details
            </p>
          </>
        )}
      </div>
    </div>
  );
}
