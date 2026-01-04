import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PromptSession, PromptChange } from '@promptvc/types';

/**
 * TreeItem representing a file changed in a prompt
 */
class FileChangeTreeItem extends vscode.TreeItem {
  constructor(
    public readonly fileName: string,
    public readonly promptChange: PromptChange
  ) {
    super(fileName, vscode.TreeItemCollapsibleState.None);

    const filePath = fileName;
    const extension = filePath.split('.').pop()?.toLowerCase() || '';

    // Set file-specific icon
    this.iconPath = vscode.ThemeIcon.File;
    this.resourceUri = vscode.Uri.file(filePath);

    this.tooltip = `${fileName}\n\nChanged in: ${promptChange.prompt.substring(0, 100)}`;
    this.contextValue = 'fileChange';

    // Make it clickable to view the file diff
    this.command = {
      command: 'promptvc.showPromptDiff',
      title: 'Show File Diff',
      arguments: [promptChange],
    };
  }
}

/**
 * TreeItem representing a single prompt change
 */
class PromptChangeTreeItem extends vscode.TreeItem {
  constructor(
    public readonly promptChange: PromptChange,
    public readonly sessionId: string
  ) {
    const label = `${promptChange.prompt.substring(0, 60)}${promptChange.prompt.length > 60 ? '...' : ''}`;

    // Make it collapsible if there are files
    const collapsibleState = promptChange.files.length > 0
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;

    super(label, collapsibleState);

    // Calculate diff stats
    const diffLines = promptChange.diff.split('\n').length;
    const addedLines = promptChange.diff.split('\n').filter(l => l.startsWith('+')).length;
    const removedLines = promptChange.diff.split('\n').filter(l => l.startsWith('-')).length;

    this.tooltip = `${promptChange.prompt}\n\nFiles: ${promptChange.files.length}\nTime: ${new Date(promptChange.timestamp).toLocaleString()}\n+${addedLines} -${removedLines} lines`;
    this.description = `${promptChange.files.length} file${promptChange.files.length !== 1 ? 's' : ''} • +${addedLines} -${removedLines}`;
    this.contextValue = 'promptChange';
    this.iconPath = new vscode.ThemeIcon('git-commit', new vscode.ThemeColor('gitDecoration.modifiedResourceForeground'));

    // Make it clickable to view the full diff
    this.command = {
      command: 'promptvc.showPromptDiff',
      title: 'Show Prompt Diff',
      arguments: [promptChange],
    };
  }
}

/**
 * TreeItem representing a prompt session in the tree view
 */
class PromptSessionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly session: PromptSession,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly isInProgress: boolean = false
  ) {
    // Create a more descriptive label
    let label = session.prompt.substring(0, 70);
    if (session.prompt.length > 70) {
      label += '...';
    }

    // Add "In Progress" prefix for active sessions
    if (isInProgress) {
      label = `🔴 ${label}`;
    }

    super(label, collapsibleState);

    // Build rich tooltip
    const promptCount = session.perPromptChanges?.length || 1;
    const totalFiles = session.files.length;
    const modeLabel = session.mode === 'oneshot' ? 'One-shot' : 'Interactive';
    const statusLabel = isInProgress ? ' (IN PROGRESS)' : '';

    this.tooltip = `${session.prompt}${statusLabel}\n\nMode: ${modeLabel}\nPrompts: ${promptCount}\nFiles: ${totalFiles}\nDate: ${new Date(session.createdAt).toLocaleString()}`;

    // Show prompt count for interactive sessions
    if (isInProgress) {
      this.description = `IN PROGRESS • ${session.perPromptChanges?.length || 0} prompt${(session.perPromptChanges?.length || 0) !== 1 ? 's' : ''}`;
    } else if (session.perPromptChanges && session.perPromptChanges.length > 0) {
      this.description = `${session.perPromptChanges.length} prompt${session.perPromptChanges.length !== 1 ? 's' : ''} • ${totalFiles} file${totalFiles !== 1 ? 's' : ''}`;
    } else {
      this.description = `${totalFiles} file${totalFiles !== 1 ? 's' : ''} • ${new Date(session.createdAt).toLocaleDateString()}`;
    }

    this.contextValue = isInProgress ? 'promptSessionInProgress' : 'promptSession';

    // Set icon based on status and mode
    if (isInProgress) {
      this.iconPath = new vscode.ThemeIcon(
        'sync~spin',
        new vscode.ThemeColor('terminal.ansiYellow')
      );
    } else {
      this.iconPath = new vscode.ThemeIcon(
        session.mode === 'oneshot' ? 'terminal' : 'history',
        session.mode === 'oneshot'
          ? new vscode.ThemeColor('terminal.ansiGreen')
          : new vscode.ThemeColor('terminal.ansiBlue')
      );
    }

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
type TreeElement = PromptSessionTreeItem | PromptChangeTreeItem | FileChangeTreeItem;

class PromptSessionsProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeElement | undefined | null | void> =
    new vscode.EventEmitter<TreeElement | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<TreeElement | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private sessionsFilePath: string | null = null;
  private repoRoot: string | null = null;

  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private currentSessionWatcher: vscode.FileSystemWatcher | null = null;
  private currentSession: PromptSession | null = null;

  constructor() {
    this.initializeStorage();
    this.setupFileWatcher();
    this.setupCurrentSessionWatcher();
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
      // Clear current session when a new completed session is saved
      this.currentSession = null;
      this.refresh();
    });

    this.fileWatcher.onDidCreate(() => {
      console.log('PromptVC: Sessions file created, refreshing...');
      this.currentSession = null;
      this.refresh();
    });
  }

  /**
   * Setup watcher for current in-progress session
   */
  private setupCurrentSessionWatcher(): void {
    if (!this.repoRoot) return;

    const currentSessionPath = path.join(this.repoRoot, '.promptvc', 'current_session.json');
    this.currentSessionWatcher = vscode.workspace.createFileSystemWatcher(currentSessionPath);

    this.currentSessionWatcher.onDidChange(() => {
      console.log('PromptVC: Current session updated, refreshing...');
      this.loadCurrentSession();
      this.refresh();
    });

    this.currentSessionWatcher.onDidCreate(() => {
      console.log('PromptVC: Current session created, refreshing...');
      this.loadCurrentSession();
      this.refresh();
    });

    this.currentSessionWatcher.onDidDelete(() => {
      console.log('PromptVC: Current session deleted');
      this.currentSession = null;
      this.refresh();
    });

    // Load initial current session if it exists
    this.loadCurrentSession();
  }

  /**
   * Load the current in-progress session
   */
  private loadCurrentSession(): void {
    if (!this.repoRoot) return;

    const currentSessionPath = path.join(this.repoRoot, '.promptvc', 'current_session.json');

    if (!fs.existsSync(currentSessionPath)) {
      this.currentSession = null;
      return;
    }

    try {
      const data = fs.readFileSync(currentSessionPath, 'utf-8');
      const perPromptChanges = JSON.parse(data) as PromptChange[];

      if (perPromptChanges.length === 0) {
        this.currentSession = null;
        return;
      }

      // Create a temporary session from the current prompts
      const allPrompts = perPromptChanges.map(pc => pc.prompt).join(' → ');
      const allFiles = Array.from(new Set(perPromptChanges.flatMap(pc => pc.files)));
      const combinedDiff = perPromptChanges.map(pc => pc.diff).join('\n\n');

      this.currentSession = {
        id: 'current',
        provider: 'codex',
        repoRoot: this.repoRoot,
        branch: 'current',
        preHash: perPromptChanges[0].hash,
        postHash: null,
        prompt: allPrompts,
        responseSnippet: `In progress: ${perPromptChanges.length} prompt${perPromptChanges.length !== 1 ? 's' : ''}`,
        files: allFiles,
        diff: combinedDiff,
        createdAt: perPromptChanges[0].timestamp,
        mode: 'interactive',
        autoTagged: true,
        perPromptChanges: perPromptChanges,
      };

      console.log('PromptVC: Loaded current session with', perPromptChanges.length, 'prompts');
    } catch (error) {
      console.error('PromptVC: Failed to load current session:', error);
      this.currentSession = null;
    }
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
   * Get tree item for a session, prompt change, or file
   */
  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  /**
   * Get children (sessions, per-prompt changes, or files) for the tree view
   */
  getChildren(element?: TreeElement): Thenable<TreeElement[]> {
    // If element is a FileChangeTreeItem, it has no children
    if (element instanceof FileChangeTreeItem) {
      return Promise.resolve([]);
    }

    // If element is a PromptChangeTreeItem, return its files
    if (element instanceof PromptChangeTreeItem) {
      const promptChange = element.promptChange;
      if (promptChange.files.length > 0) {
        return Promise.resolve(
          promptChange.files.map(file => new FileChangeTreeItem(file, promptChange))
        );
      }
      return Promise.resolve([]);
    }

    // If element is a PromptSessionTreeItem, return its per-prompt changes
    if (element instanceof PromptSessionTreeItem) {
      const session = element.session;
      if (session.perPromptChanges && session.perPromptChanges.length > 0) {
        return Promise.resolve(
          session.perPromptChanges.map(pc => new PromptChangeTreeItem(pc, session.id))
        );
      }
      return Promise.resolve([]);
    }

    // No element provided - return root level sessions
    try {
      const sessions = this.readSessions().slice(0, 50);
      const items: PromptSessionTreeItem[] = [];

      // Add current in-progress session at the top if it exists
      if (this.currentSession) {
        console.log('PromptVC: Adding current in-progress session');
        const collapsibleState = this.currentSession.perPromptChanges && this.currentSession.perPromptChanges.length > 0
          ? vscode.TreeItemCollapsibleState.Expanded // Auto-expand current session
          : vscode.TreeItemCollapsibleState.None;
        items.push(new PromptSessionTreeItem(this.currentSession, collapsibleState, true));
      }

      console.log(`PromptVC: Found ${sessions.length} completed sessions to display`);

      if (sessions.length > 0) {
        console.log('PromptVC: First session:', {
          id: sessions[0].id,
          provider: sessions[0].provider,
          prompt: sessions[0].prompt.substring(0, 100),
          files: sessions[0].files.length,
          hasPerPromptChanges: !!sessions[0].perPromptChanges
        });
      }

      // Add completed sessions
      items.push(...sessions.map(session => {
        // Make session expandable if it has per-prompt changes
        const collapsibleState = session.perPromptChanges && session.perPromptChanges.length > 0
          ? vscode.TreeItemCollapsibleState.Collapsed
          : vscode.TreeItemCollapsibleState.None;
        return new PromptSessionTreeItem(session, collapsibleState, false);
      }));

      return Promise.resolve(items);
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
    if (this.currentSessionWatcher) {
      this.currentSessionWatcher.dispose();
      this.currentSessionWatcher = null;
    }
  }
}

/**
 * Show diff for a single prompt change
 */
async function showPromptDiff(promptChange: PromptChange): Promise<void> {
  try {
    // Create temporary files for the diff
    const tmpDir = path.join(require('os').tmpdir(), 'promptvc');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const timestamp = new Date(promptChange.timestamp).getTime();
    const beforePath = path.join(tmpDir, `prompt-${timestamp}-before.diff`);
    const afterPath = path.join(tmpDir, `prompt-${timestamp}-after.diff`);

    // Write diff to files
    fs.writeFileSync(beforePath, `# Prompt: ${promptChange.prompt}\n\nNo changes yet`);
    fs.writeFileSync(afterPath, promptChange.diff);

    // Open in diff editor
    const beforeUri = vscode.Uri.file(beforePath);
    const afterUri = vscode.Uri.file(afterPath);

    await vscode.commands.executeCommand(
      'vscode.diff',
      beforeUri,
      afterUri,
      `Prompt: ${promptChange.prompt.substring(0, 50)}${promptChange.prompt.length > 50 ? '...' : ''}`
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
    vscode.window.showErrorMessage(`Failed to open prompt diff: ${error}`);
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

  panel.webview.html = getWebviewContent(session);
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
 * Parse git diff into per-file changes
 */
interface FileDiff {
  fileName: string;
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

interface DiffLine {
  type: 'addition' | 'deletion' | 'context' | 'header';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

function parseDiff(diffText: string): FileDiff[] {
  if (!diffText || diffText.trim() === '') {
    return [];
  }

  const files: FileDiff[] = [];
  const lines = diffText.split('\n');
  let currentFile: FileDiff | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLineNumber = 0;
  let newLineNumber = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // File header: diff --git a/... b/...
    if (line.startsWith('diff --git ')) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      if (currentFile) {
        files.push(currentFile);
      }

      const match = line.match(/diff --git a\/(.*?) b\/(.*?)$/);
      if (match) {
        currentFile = {
          fileName: match[2],
          oldPath: match[1],
          newPath: match[2],
          hunks: [],
          additions: 0,
          deletions: 0,
        };
        currentHunk = null;
      }
    }
    // Hunk header: @@ -1,5 +1,6 @@
    else if (line.startsWith('@@')) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
      }

      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@(.*)/);
      if (match) {
        oldLineNumber = parseInt(match[1], 10);
        newLineNumber = parseInt(match[2], 10);
        currentHunk = {
          header: line,
          lines: [],
        };
      }
    }
    // Addition
    else if (line.startsWith('+') && !line.startsWith('+++')) {
      if (currentHunk && currentFile) {
        currentHunk.lines.push({
          type: 'addition',
          content: line.substring(1),
          newLineNumber: newLineNumber++,
        });
        currentFile.additions++;
      }
    }
    // Deletion
    else if (line.startsWith('-') && !line.startsWith('---')) {
      if (currentHunk && currentFile) {
        currentHunk.lines.push({
          type: 'deletion',
          content: line.substring(1),
          oldLineNumber: oldLineNumber++,
        });
        currentFile.deletions++;
      }
    }
    // Context line
    else if (line.startsWith(' ')) {
      if (currentHunk) {
        currentHunk.lines.push({
          type: 'context',
          content: line.substring(1),
          oldLineNumber: oldLineNumber++,
          newLineNumber: newLineNumber++,
        });
      }
    }
  }

  // Push last file and hunk
  if (currentFile && currentHunk) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile) {
    files.push(currentFile);
  }

  return files;
}

/**
 * Generate PR-style diff HTML for a file
 */
function generateFileDiffHtml(file: FileDiff): string {
  const statsHtml = `
    <span class="diff-stats-additions">+${file.additions}</span>
    <span class="diff-stats-deletions">-${file.deletions}</span>
  `;

  const hunksHtml = file.hunks.map(hunk => {
    const linesHtml = hunk.lines.map(line => {
      const lineClass = `diff-line diff-line-${line.type}`;
      const oldNum = line.oldLineNumber !== undefined ? line.oldLineNumber : '';
      const newNum = line.newLineNumber !== undefined ? line.newLineNumber : '';

      let indicator = '';
      if (line.type === 'addition') indicator = '+';
      else if (line.type === 'deletion') indicator = '-';
      else if (line.type === 'context') indicator = ' ';

      return `
        <tr class="${lineClass}">
          <td class="line-number">${oldNum}</td>
          <td class="line-number">${newNum}</td>
          <td class="line-indicator">${indicator}</td>
          <td class="line-content"><pre>${escapeHtml(line.content)}</pre></td>
        </tr>
      `;
    }).join('');

    return `
      <div class="hunk">
        <div class="hunk-header">${escapeHtml(hunk.header)}</div>
        <table class="diff-table">
          <tbody>
            ${linesHtml}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  return `
    <div class="file-diff">
      <div class="file-diff-header">
        <span class="file-name">${escapeHtml(file.fileName)}</span>
        ${statsHtml}
      </div>
      <div class="file-diff-content">
        ${hunksHtml}
      </div>
    </div>
  `;
}

/**
 * Generate HTML content for the webview
 */
function getWebviewContent(session: PromptSession): string {
  // Generate per-prompt breakdown if available
  let perPromptHtml = '';
  if (session.perPromptChanges && session.perPromptChanges.length > 0) {
    perPromptHtml = `
      <div class="section">
        ${session.perPromptChanges.map((pc, index) => {
          const filesHtml = pc.files.map(f => `<li><code>${escapeHtml(f)}</code></li>`).join('');
          const parsedPromptDiff = parseDiff(pc.diff);
          const totalAdditions = parsedPromptDiff.reduce((sum, file) => sum + file.additions, 0);
          const totalDeletions = parsedPromptDiff.reduce((sum, file) => sum + file.deletions, 0);
          const promptDiffHtml = parsedPromptDiff.length > 0
            ? parsedPromptDiff.map(file => generateFileDiffHtml(file)).join('')
            : `<div class="no-diff">No changes</div>`;

          return `
            <div class="prompt-change">
              <div class="prompt-header">
                <span class="prompt-number">#${index + 1}</span>
                <span class="prompt-time">${new Date(pc.timestamp).toLocaleString()}</span>
                <span class="diff-stats">
                  <span class="diff-stats-additions">+${totalAdditions}</span>
                  <span class="diff-stats-deletions">-${totalDeletions}</span>
                </span>
              </div>
              <div class="prompt-text">${escapeHtml(pc.prompt)}</div>
              <div class="files-list">
                <strong>Files (${pc.files.length}):</strong>
                <ul>${filesHtml}</ul>
              </div>
              <details open>
                <summary>View Changes</summary>
                <div class="pr-diff-viewer">
                  ${promptDiffHtml}
                </div>
              </details>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // Overall files list
  const filesHtml = session.files
    .map(file => `<li><code>${escapeHtml(file)}</code></li>`)
    .join('');

  // Parse and generate PR-style diff
  const parsedDiff = parseDiff(session.diff);
  const prDiffHtml = parsedDiff.length > 0
    ? parsedDiff.map(file => generateFileDiffHtml(file)).join('')
    : `<div class="no-diff">No changes to display</div>`;

  return getWebviewContentTemplate(session, filesHtml, perPromptHtml, prDiffHtml);
}

/**
 * Generate HTML template for the webview
 */
function getWebviewContentTemplate(session: PromptSession, filesHtml: string, perPromptHtml: string, prDiffHtml: string): string {
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
        .prompt-change {
            background-color: var(--vscode-editor-background);
            border-left: 3px solid var(--vscode-activityBarBadge-background);
            padding: 15px;
            margin-bottom: 20px;
            border-radius: 4px;
        }
        .prompt-header {
            display: flex;
            gap: 15px;
            align-items: center;
            margin-bottom: 10px;
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }
        .prompt-number {
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 12px;
            font-weight: bold;
            font-size: 0.85em;
        }
        .prompt-time {
            color: var(--vscode-descriptionForeground);
        }
        .diff-stats {
            font-family: var(--vscode-editor-font-family);
            font-weight: bold;
        }
        .diff-stats {
            color: var(--vscode-gitDecoration-modifiedResourceForeground);
        }
        .prompt-text {
            font-size: 1.1em;
            margin: 10px 0;
            padding: 10px;
            background-color: var(--vscode-textBlockQuote-background);
            border-radius: 4px;
        }
        .files-list {
            margin: 10px 0;
        }
        .files-list ul {
            margin-top: 5px;
        }
        details {
            margin-top: 10px;
            cursor: pointer;
        }
        details summary {
            padding: 8px;
            background-color: var(--vscode-button-secondaryBackground);
            border-radius: 4px;
            user-select: none;
        }
        details summary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        details[open] summary {
            margin-bottom: 10px;
        }
        /* PR-style diff viewer */
        .file-diff {
            margin: 20px 0;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            overflow: hidden;
        }
        .file-diff-header {
            background-color: var(--vscode-editor-background);
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 600;
        }
        .file-name {
            font-family: var(--vscode-editor-font-family);
            font-size: 14px;
        }
        .diff-stats-additions {
            color: #3fb950;
            font-weight: 600;
            margin-right: 8px;
        }
        .diff-stats-deletions {
            color: #f85149;
            font-weight: 600;
        }
        .file-diff-content {
            background-color: var(--vscode-editor-background);
        }
        .hunk {
            margin: 0;
        }
        .hunk-header {
            background-color: var(--vscode-diffEditor-unchangedRegionBackground);
            color: var(--vscode-descriptionForeground);
            padding: 6px 12px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .diff-table {
            width: 100%;
            border-collapse: collapse;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            line-height: 20px;
        }
        .diff-table tbody {
            background-color: var(--vscode-editor-background);
        }
        .diff-line {
            border: none;
        }
        .line-number {
            width: 40px;
            padding: 0 10px;
            text-align: right;
            color: var(--vscode-editorLineNumber-foreground);
            user-select: none;
            vertical-align: top;
            font-size: 11px;
        }
        .line-indicator {
            width: 20px;
            padding: 0 8px;
            text-align: center;
            user-select: none;
            vertical-align: top;
            font-weight: bold;
        }
        .line-content {
            padding: 0;
            vertical-align: top;
            width: 100%;
        }
        .line-content pre {
            margin: 0;
            padding: 0 12px;
            background: transparent;
            border: none;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            line-height: 20px;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        .diff-line-addition {
            background-color: rgba(63, 185, 80, 0.15);
        }
        .diff-line-addition .line-indicator {
            color: #3fb950;
        }
        .diff-line-addition .line-content {
            background-color: rgba(63, 185, 80, 0.15);
        }
        .diff-line-deletion {
            background-color: rgba(248, 81, 73, 0.15);
        }
        .diff-line-deletion .line-indicator {
            color: #f85149;
        }
        .diff-line-deletion .line-content {
            background-color: rgba(248, 81, 73, 0.15);
        }
        .diff-line-context {
            background-color: transparent;
        }
        .diff-line-context .line-indicator {
            color: var(--vscode-descriptionForeground);
        }
        .no-diff {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="section">
        <h2>Overall Summary</h2>
        <h3>Prompt</h3>
        <pre>${escapeHtml(session.prompt)}</pre>

        <h3>All Files Changed (${session.files.length})</h3>
        <ul>${filesHtml}</ul>

        <h3>Complete Diff</h3>
        <div class="pr-diff-viewer">
            ${prDiffHtml}
        </div>

        <h3>Response</h3>
        <pre>${escapeHtml(session.responseSnippet)}</pre>
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
      vscode.commands.registerCommand('promptvc.showPromptDiff', (promptChange: PromptChange) => {
        console.log('PromptVC: Showing prompt diff', promptChange.prompt.substring(0, 50));
        showPromptDiff(promptChange);
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
