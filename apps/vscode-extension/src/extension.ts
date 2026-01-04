import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PromptSession } from '@promptvc/types';

/**
 * TreeItem representing a prompt session in the tree view
 */
class PromptSessionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly session: PromptSession,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    const label = `[${session.provider}] ${session.prompt.substring(0, 50)}${session.prompt.length > 50 ? '...' : ''}`;
    super(label, collapsibleState);

    this.tooltip = `${session.prompt}\n\nDate: ${new Date(session.createdAt).toLocaleString()}\nFiles: ${session.files.length}`;
    this.description = new Date(session.createdAt).toLocaleDateString();
    this.contextValue = 'promptSession';

    // Set icon based on mode
    this.iconPath = new vscode.ThemeIcon(
      session.mode === 'oneshot' ? 'terminal' : 'watch'
    );

    // Make it clickable
    this.command = {
      command: 'promptvc.showSessionDiff',
      title: 'Show Session Diff',
      arguments: [session],
    };
  }
}

/**
 * TreeDataProvider for prompt sessions
 */
class PromptSessionsProvider implements vscode.TreeDataProvider<PromptSessionTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<PromptSessionTreeItem | undefined | null | void> =
    new vscode.EventEmitter<PromptSessionTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<PromptSessionTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private sessionsFilePath: string | null = null;
  private repoRoot: string | null = null;

  private fileWatcher: vscode.FileSystemWatcher | null = null;

  constructor() {
    this.initializeStorage();
    this.setupFileWatcher();
  }

  /**
   * Setup file watcher for live updates
   */
  private setupFileWatcher(): void {
    if (!this.repoRoot) return;

    const sessionsPath = path.join(this.repoRoot, '.promptvc', 'sessions.json');
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(sessionsPath);

    this.fileWatcher.onDidChange(() => {
      console.log('PromptVC: Sessions file changed, refreshing...');
      this.refresh();
    });

    this.fileWatcher.onDidCreate(() => {
      console.log('PromptVC: Sessions file created, refreshing...');
      this.refresh();
    });
  }

  /**
   * Initialize JSON storage
   */
  private initializeStorage(): void {
    try {
      // Get workspace folder
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        console.log('PromptVC: No workspace folders found');
        return;
      }

      this.repoRoot = workspaceFolders[0].uri.fsPath;
      console.log('PromptVC: Repo root:', this.repoRoot);

      this.sessionsFilePath = path.join(this.repoRoot, '.promptvc', 'sessions.json');
      console.log('PromptVC: Looking for sessions at:', this.sessionsFilePath);

      if (!fs.existsSync(this.sessionsFilePath)) {
        console.log('PromptVC: Sessions file does not exist yet');
        return;
      }

      console.log('PromptVC: Sessions file found');
    } catch (error) {
      console.error('PromptVC: Failed to initialize storage:', error);
    }
  }

  /**
   * Read sessions from JSON file
   */
  private readSessions(): PromptSession[] {
    if (!this.sessionsFilePath || !fs.existsSync(this.sessionsFilePath)) {
      return [];
    }

    try {
      const data = fs.readFileSync(this.sessionsFilePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error('PromptVC: Failed to read sessions:', error);
      return [];
    }
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this.initializeStorage();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item for a session
   */
  getTreeItem(element: PromptSessionTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children (sessions) for the tree view
   */
  getChildren(element?: PromptSessionTreeItem): Thenable<PromptSessionTreeItem[]> {
    if (element) {
      // No nested elements
      return Promise.resolve([]);
    }

    try {
      const sessions = this.readSessions().slice(0, 50);
      console.log(`PromptVC: Found ${sessions.length} sessions to display`);

      if (sessions.length > 0) {
        console.log('PromptVC: First session:', {
          id: sessions[0].id,
          provider: sessions[0].provider,
          prompt: sessions[0].prompt.substring(0, 100),
          files: sessions[0].files.length
        });
      }

      return Promise.resolve(
        sessions.map(session => new PromptSessionTreeItem(session, vscode.TreeItemCollapsibleState.None))
      );
    } catch (error) {
      console.error('Error fetching sessions:', error);
      return Promise.resolve([]);
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = null;
    }
  }
}

/**
 * Open diff in VS Code's native diff editor
 */
async function openDiffInEditor(session: PromptSession): Promise<void> {
  try {
    // Create temporary files for the diff
    const tmpDir = path.join(require('os').tmpdir(), 'promptvc');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const beforePath = path.join(tmpDir, `${session.id}-before.diff`);
    const afterPath = path.join(tmpDir, `${session.id}-after.diff`);

    // Write diff to files (split by file if possible, or show full diff)
    fs.writeFileSync(beforePath, `# Session: ${session.prompt}\n\nNo changes yet`);
    fs.writeFileSync(afterPath, session.diff);

    // Open in diff editor
    const beforeUri = vscode.Uri.file(beforePath);
    const afterUri = vscode.Uri.file(afterPath);

    await vscode.commands.executeCommand(
      'vscode.diff',
      beforeUri,
      afterUri,
      `PromptVC: ${session.prompt.substring(0, 50)}${session.prompt.length > 50 ? '...' : ''}`
    );

    // Clean up temp files after a delay
    setTimeout(() => {
      try {
        if (fs.existsSync(beforePath)) fs.unlinkSync(beforePath);
        if (fs.existsSync(afterPath)) fs.unlinkSync(afterPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }, 5000);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open diff: ${error}`);
  }
}

/**
 * Show session diff in a webview panel
 */
function showSessionDiff(session: PromptSession): void {
  const panel = vscode.window.createWebviewPanel(
    'promptvcSessionDiff',
    `Session: ${session.prompt.substring(0, 30)}...`,
    vscode.ViewColumn.One,
    {
      enableScripts: true,
    }
  );

  const filesHtml = session.files
    .map(file => `<li><code>${escapeHtml(file)}</code></li>`)
    .join('');

  panel.webview.html = getWebviewContent(session, filesHtml);
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate HTML content for the webview
 */
function getWebviewContent(session: PromptSession, filesHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PromptVC Session</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        h1, h2, h3 {
            color: var(--vscode-foreground);
        }
        .section {
            margin-bottom: 30px;
        }
        .metadata {
            display: grid;
            grid-template-columns: 150px 1fr;
            gap: 10px;
            margin-bottom: 20px;
        }
        .metadata-label {
            font-weight: bold;
            color: var(--vscode-descriptionForeground);
        }
        .metadata-value {
            font-family: var(--vscode-editor-font-family);
        }
        pre {
            background-color: var(--vscode-textBlockQuote-background);
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            border-left: 3px solid var(--vscode-textBlockQuote-border);
        }
        code {
            font-family: var(--vscode-editor-font-family);
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 3px;
        }
        ul {
            list-style-type: none;
            padding-left: 0;
        }
        li {
            padding: 4px 0;
        }
        .diff {
            font-size: 13px;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <h1>Prompt Session</h1>

    <div class="section">
        <div class="metadata">
            <span class="metadata-label">ID:</span>
            <span class="metadata-value"><code>${escapeHtml(session.id)}</code></span>

            <span class="metadata-label">Provider:</span>
            <span class="metadata-value">${escapeHtml(session.provider)}</span>

            <span class="metadata-label">Date:</span>
            <span class="metadata-value">${new Date(session.createdAt).toLocaleString()}</span>

            <span class="metadata-label">Branch:</span>
            <span class="metadata-value"><code>${escapeHtml(session.branch)}</code></span>

            <span class="metadata-label">Mode:</span>
            <span class="metadata-value">${escapeHtml(session.mode)}</span>

            <span class="metadata-label">Commit:</span>
            <span class="metadata-value"><code>${escapeHtml(session.preHash.substring(0, 7))}</code></span>
        </div>
    </div>

    <div class="section">
        <h2>Prompt</h2>
        <pre>${escapeHtml(session.prompt)}</pre>
    </div>

    <div class="section">
        <h2>Response</h2>
        <pre>${escapeHtml(session.responseSnippet)}</pre>
    </div>

    <div class="section">
        <h2>Files Changed (${session.files.length})</h2>
        <ul>${filesHtml}</ul>
    </div>

    <div class="section">
        <h2>Diff</h2>
        <pre class="diff">${escapeHtml(session.diff)}</pre>
    </div>
</body>
</html>`;
}

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('PromptVC extension is now active!');

  try {
    // Create tree data provider
    const promptSessionsProvider = new PromptSessionsProvider();
    console.log('PromptVC: Created tree data provider');

    // Register tree view
    const treeView = vscode.window.createTreeView('promptvcSessions', {
      treeDataProvider: promptSessionsProvider,
    });
    console.log('PromptVC: Registered tree view');

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.showSessionDiff', (session: PromptSession) => {
        console.log('PromptVC: Showing session diff', session.id);
        showSessionDiff(session);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.openDiffInEditor', (session: PromptSession) => {
        console.log('PromptVC: Opening diff in editor', session.id);
        openDiffInEditor(session);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.refreshSessions', () => {
        console.log('PromptVC: Refreshing sessions');
        promptSessionsProvider.refresh();
      })
    );

    // Watch for workspace changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        console.log('PromptVC: Workspace folders changed');
        promptSessionsProvider.refresh();
      })
    );

    // Clean up
    context.subscriptions.push(treeView);
    context.subscriptions.push({
      dispose: () => promptSessionsProvider.dispose(),
    });

    console.log('PromptVC: Extension activation complete!');
  } catch (error) {
    console.error('PromptVC: Error during activation:', error);
    vscode.window.showErrorMessage(`PromptVC failed to activate: ${error}`);
  }
}

/**
 * Extension deactivation
 */
export function deactivate() {
  console.log('PromptVC extension is now deactivated');
}
