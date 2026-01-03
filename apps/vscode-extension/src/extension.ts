import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
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

  private db: Database.Database | null = null;
  private repoRoot: string | null = null;

  constructor() {
    this.initializeDatabase();
  }

  /**
   * Initialize database connection
   */
  private initializeDatabase(): void {
    try {
      // Get workspace folder
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders || workspaceFolders.length === 0) {
        return;
      }

      this.repoRoot = workspaceFolders[0].uri.fsPath;
      const dbPath = path.join(this.repoRoot, '.promptvc', 'promptvc.db');

      if (!fs.existsSync(dbPath)) {
        // Database doesn't exist yet
        return;
      }

      this.db = new Database(dbPath, { readonly: true });
    } catch (error) {
      console.error('Failed to initialize database:', error);
    }
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this.initializeDatabase();
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

    if (!this.db) {
      return Promise.resolve([]);
    }

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sessions
        ORDER BY created_at DESC
        LIMIT 50
      `);

      const rows = stmt.all() as any[];

      const sessions: PromptSession[] = rows.map(row => ({
        id: row.id,
        provider: row.provider,
        repoRoot: row.repo_root,
        branch: row.branch,
        preHash: row.pre_hash,
        postHash: row.post_hash,
        prompt: row.prompt,
        responseSnippet: row.response_snippet,
        files: JSON.parse(row.files),
        diff: row.diff,
        createdAt: row.created_at,
        mode: row.mode,
        autoTagged: row.auto_tagged === 1,
      }));

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
    if (this.db) {
      this.db.close();
      this.db = null;
    }
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
  console.log('PromptVC extension is now active');

  // Create tree data provider
  const promptSessionsProvider = new PromptSessionsProvider();

  // Register tree view
  const treeView = vscode.window.createTreeView('promptvcSessions', {
    treeDataProvider: promptSessionsProvider,
  });

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('promptvc.showSessionDiff', (session: PromptSession) => {
      showSessionDiff(session);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('promptvc.refreshSessions', () => {
      promptSessionsProvider.refresh();
    })
  );

  // Watch for workspace changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      promptSessionsProvider.refresh();
    })
  );

  // Clean up
  context.subscriptions.push(treeView);
  context.subscriptions.push({
    dispose: () => promptSessionsProvider.dispose(),
  });
}

/**
 * Extension deactivation
 */
export function deactivate() {
  console.log('PromptVC extension is now deactivated');
}
