import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PromptSession, PromptChange } from '@promptvc/types';

function normalizeTagsInput(input: string): string[] {
  const tags = input
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
  return Array.from(new Set(tags));
}

function formatTagsLabel(tags?: string[]): string | null {
  if (!tags || tags.length === 0) {
    return null;
  }

  const visibleTags = tags.slice(0, 3);
  const extraCount = tags.length - visibleTags.length;
  const extraLabel = extraCount > 0 ? ` +${extraCount}` : '';
  return `tags: ${visibleTags.join(', ')}${extraLabel}`;
}

function normalizeSessionMetadata(session: PromptSession): PromptSession {
  const normalized = { ...session };
  if (!normalized.tags || normalized.tags.length === 0) {
    delete normalized.tags;
  }
  if (!normalized.flagged) {
    delete normalized.flagged;
  }
  if (!normalized.hidden) {
    delete normalized.hidden;
  }
  return normalized;
}

function getCodexIconUri(repoRoot: string | null): vscode.Uri | null {
  if (!repoRoot) {
    return null;
  }

  const iconPath = path.join(repoRoot, 'assets', 'openai.svg');
  if (!fs.existsSync(iconPath)) {
    return null;
  }

  return vscode.Uri.file(iconPath);
}

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
    public readonly isInProgress: boolean = false,
    codexIconUri: vscode.Uri | null = null
  ) {
    // Create a more descriptive label
    const labelPrefixes: string[] = [];
    if (session.hidden) {
      labelPrefixes.push('HIDDEN');
    }
    if (session.flagged) {
      labelPrefixes.push('FLAG');
    }
    const labelPrefix = labelPrefixes.length > 0 ? `[${labelPrefixes.join(', ')}] ` : '';

    const perPromptCount = session.perPromptChanges?.length ?? 0;
    const hasPerPromptChanges = perPromptCount > 0;
    const promptCount = hasPerPromptChanges ? perPromptCount : 1;

    let baseLabel = session.prompt;
    if (hasPerPromptChanges) {
      const latestPrompt = session.perPromptChanges![perPromptCount - 1].prompt;
      const extraCount = perPromptCount - 1;
      const promptLabel = extraCount > 0 ? `${latestPrompt} (+${extraCount} more)` : latestPrompt;
      baseLabel = promptLabel;
    }

    let label = `${labelPrefix}${baseLabel}`;
    if (label.length > 70) {
      label = `${label.substring(0, 70)}...`;
    }

    super(label, collapsibleState);

    // Build rich tooltip
    const totalFiles = session.files.length;
    const modeLabel = session.mode === 'oneshot' ? 'One-shot' : 'Interactive';
    const statusLabel = isInProgress ? ' (IN PROGRESS)' : '';

    const metaLines: string[] = [];
    if (session.hidden) {
      metaLines.push('Hidden: yes');
    }
    if (session.flagged) {
      metaLines.push('Flagged: yes');
    }
    if (session.tags && session.tags.length > 0) {
      metaLines.push(`Tags: ${session.tags.join(', ')}`);
    }
    const metaSection = metaLines.length > 0 ? `${metaLines.join('\n')}\n\n` : '';

    const tooltipPrompt = hasPerPromptChanges ? baseLabel : session.prompt;
    this.tooltip = `${tooltipPrompt}${statusLabel}\n\n${metaSection}Mode: ${modeLabel}\nPrompts: ${promptCount}\nFiles: ${totalFiles}\nDate: ${new Date(session.createdAt).toLocaleString()}`;

    // Show prompt count for interactive sessions
    let description: string;
    if (isInProgress) {
      description = `IN PROGRESS • ${session.perPromptChanges?.length || 0} prompt${(session.perPromptChanges?.length || 0) !== 1 ? 's' : ''}`;
    } else if (session.perPromptChanges && session.perPromptChanges.length > 0) {
      description = `${session.perPromptChanges.length} prompt${session.perPromptChanges.length !== 1 ? 's' : ''} • ${totalFiles} file${totalFiles !== 1 ? 's' : ''}`;
    } else {
      description = `${totalFiles} file${totalFiles !== 1 ? 's' : ''} • ${new Date(session.createdAt).toLocaleDateString()}`;
    }

    const metaParts: string[] = [];
    if (session.flagged) {
      metaParts.push('flagged');
    }
    const tagsLabel = formatTagsLabel(session.tags);
    if (tagsLabel) {
      metaParts.push(tagsLabel);
    }
    if (session.hidden) {
      metaParts.push('hidden');
    }
    if (metaParts.length > 0) {
      description = `${description} • ${metaParts.join(' • ')}`;
    }

    this.description = description;

    if (isInProgress) {
      this.contextValue = 'promptSessionInProgress';
    } else {
      this.contextValue = session.hidden ? 'promptSessionHidden' : 'promptSession';
    }

    const providerIcon = session.provider === 'codex' ? codexIconUri : null;
    if (providerIcon) {
      this.iconPath = providerIcon;
    } else {
      this.iconPath = new vscode.ThemeIcon(
        session.mode === 'oneshot' ? 'terminal' : 'circle-filled',
        session.mode === 'oneshot'
          ? new vscode.ThemeColor('terminal.ansiGreen')
          : new vscode.ThemeColor('terminal.ansiBlue')
      );
    }

    // Make it clickable to open the webview
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
  private showHiddenSessions: boolean = false;
  private viewMode: 'session' | 'prompt' = 'session';

  private fileWatcher: vscode.FileSystemWatcher | null = null;
  private currentSessionWatcher: vscode.FileSystemWatcher | null = null;
  private currentSession: PromptSession | null = null;

  constructor(private context: vscode.ExtensionContext) {
    this.showHiddenSessions = this.context.workspaceState.get('promptvc.showHiddenSessions', false);
    this.viewMode = this.context.workspaceState.get('promptvc.viewMode', 'session');
    this.updateHiddenContext();
    this.updateViewModeContext();
    this.initializeStorage();
    this.setupFileWatcher();
    this.setupCurrentSessionWatcher();
  }

  private updateHiddenContext(): void {
    void vscode.commands.executeCommand('setContext', 'promptvc.showHiddenSessions', this.showHiddenSessions);
  }

  private updateViewModeContext(): void {
    void vscode.commands.executeCommand('setContext', 'promptvc.viewMode', this.viewMode);
  }

  public setShowHiddenSessions(show: boolean): void {
    if (this.showHiddenSessions === show) {
      return;
    }

    this.showHiddenSessions = show;
    void this.context.workspaceState.update('promptvc.showHiddenSessions', show);
    this.updateHiddenContext();
    this.refresh();
  }

  public setViewMode(mode: 'session' | 'prompt'): void {
    if (this.viewMode === mode) {
      return;
    }

    this.viewMode = mode;
    void this.context.workspaceState.update('promptvc.viewMode', mode);
    this.updateViewModeContext();
    this.refresh();
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

      // Validate and filter prompt changes - ensure all required fields exist
      const validPromptChanges = perPromptChanges.filter(pc => {
        return pc.prompt && typeof pc.prompt === 'string' &&
               pc.diff !== undefined && pc.diff !== null &&
               pc.files && Array.isArray(pc.files) &&
               pc.timestamp && pc.hash;
      });

      if (validPromptChanges.length === 0) {
        console.warn('PromptVC: No valid prompt changes found in current session');
        this.currentSession = null;
        return;
      }

      // Create a temporary session from the current prompts
      const latestPrompt = validPromptChanges[validPromptChanges.length - 1].prompt;
      const allFiles = Array.from(new Set(validPromptChanges.flatMap(pc => pc.files)));
      const combinedDiff = validPromptChanges.map(pc => pc.diff || '').join('\n\n');

      this.currentSession = {
        id: 'current',
        provider: 'codex',
        repoRoot: this.repoRoot,
        branch: 'current',
        preHash: validPromptChanges[0].hash,
        postHash: null,
        prompt: latestPrompt,
        responseSnippet: `In progress: ${validPromptChanges.length} prompt${validPromptChanges.length !== 1 ? 's' : ''}`,
        files: allFiles,
        diff: combinedDiff,
        createdAt: validPromptChanges[0].timestamp,
        mode: 'interactive',
        autoTagged: true,
        perPromptChanges: validPromptChanges,
      };

      console.log('PromptVC: Loaded current session with', validPromptChanges.length, 'prompts');
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
   * Write sessions to JSON file
   */
  private writeSessions(sessions: PromptSession[]): boolean {
    if (!this.sessionsFilePath) {
      return false;
    }

    try {
      fs.writeFileSync(this.sessionsFilePath, JSON.stringify(sessions, null, 2));
      return true;
    } catch (error) {
      console.error('PromptVC: Failed to write sessions:', error);
      return false;
    }
  }

  /**
   * Update metadata for a stored session
   */
  public updateSessionMetadata(sessionId: string, updater: (session: PromptSession) => PromptSession): void {
    if (sessionId === 'current') {
      vscode.window.showWarningMessage('PromptVC: Cannot update an in-progress session.');
      return;
    }

    this.initializeStorage();
    if (!this.sessionsFilePath || !fs.existsSync(this.sessionsFilePath)) {
      vscode.window.showErrorMessage('PromptVC: sessions.json not found.');
      return;
    }

    const sessions = this.readSessions();
    const index = sessions.findIndex(session => session.id === sessionId);
    if (index === -1) {
      vscode.window.showWarningMessage(`PromptVC: Session not found: ${sessionId}`);
      return;
    }

    const updated = normalizeSessionMetadata(updater({ ...sessions[index] }));
    sessions[index] = updated;

    if (!this.writeSessions(sessions)) {
      vscode.window.showErrorMessage('PromptVC: Failed to save session metadata.');
      return;
    }

    this.refresh();
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

    // If element is a PromptSessionTreeItem, return per-prompt changes if available (session view only)
    if (element instanceof PromptSessionTreeItem) {
      const promptChanges = element.session.perPromptChanges;
      if (promptChanges && promptChanges.length > 0) {
        return Promise.resolve(promptChanges.map(pc => new PromptChangeTreeItem(pc, element.session.id)));
      }
      return Promise.resolve([]);
    }

    // No element provided - return root level items based on view mode
    try {
      const sessions = this.readSessions()
        .filter(session => this.showHiddenSessions || !session.hidden)
        .slice(0, 50);

      // PROMPT VIEW MODE: Show flat list of all prompts
      if (this.viewMode === 'prompt') {
        const allPrompts: PromptChangeTreeItem[] = [];

        // Add prompts from current in-progress session
        if (this.currentSession && this.currentSession.perPromptChanges) {
          allPrompts.push(...this.currentSession.perPromptChanges.map(pc =>
            new PromptChangeTreeItem(pc, this.currentSession!.id)
          ));
        }

        // Add prompts from all completed sessions
        for (const session of sessions) {
          if (session.perPromptChanges && session.perPromptChanges.length > 0) {
            allPrompts.push(...session.perPromptChanges.map(pc =>
              new PromptChangeTreeItem(pc, session.id)
            ));
          }
        }

        return Promise.resolve(allPrompts);
      }

      // SESSION VIEW MODE: Show grouped by sessions (default)
      const items: PromptSessionTreeItem[] = [];
      const codexIconUri = getCodexIconUri(this.repoRoot);

      // Add current in-progress session at the top if it exists
      if (this.currentSession) {
        console.log('PromptVC: Adding current in-progress session');
        const collapsibleState = this.currentSession.perPromptChanges && this.currentSession.perPromptChanges.length > 0
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None;
        items.push(new PromptSessionTreeItem(this.currentSession, collapsibleState, true, codexIconUri));
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

      // Add completed sessions - expand by default to show all prompts
      items.push(...sessions.map(session => (
        new PromptSessionTreeItem(
          session,
          session.perPromptChanges && session.perPromptChanges.length > 0
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None,
          false,
          codexIconUri
        )
      )));

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
    // Validate prompt change data
    if (!promptChange.prompt || typeof promptChange.prompt !== 'string') {
      vscode.window.showErrorMessage('Prompt is missing or invalid');
      return;
    }
    if (!promptChange.diff || typeof promptChange.diff !== 'string') {
      vscode.window.showErrorMessage('Prompt diff is missing or invalid');
      return;
    }

    const promptPreview = promptChange.prompt.substring(0, 50);
    const promptSuffix = promptChange.prompt.length > 50 ? '...' : '';

    const panel = vscode.window.createWebviewPanel(
      'promptvcPromptDiff',
      `Prompt: ${promptPreview}${promptSuffix}`,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
      }
    );

    panel.webview.html = getPromptWebviewContent(promptChange);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open prompt diff: ${error}`);
  }
}

/**
 * Open diff in VS Code's native diff editor
 */
async function openDiffInEditor(session: PromptSession): Promise<void> {
  try {
    // Validate session data
    if (!session.prompt || typeof session.prompt !== 'string') {
      vscode.window.showErrorMessage('Session prompt is missing or invalid');
      return;
    }
    if (!session.diff || typeof session.diff !== 'string') {
      vscode.window.showErrorMessage('Session diff is missing or invalid');
      return;
    }

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
  // Validate session data
  if (!session.prompt || typeof session.prompt !== 'string') {
    vscode.window.showErrorMessage('Session prompt is missing or invalid');
    return;
  }
  if (!session.diff || typeof session.diff !== 'string') {
    vscode.window.showErrorMessage('Session diff is missing or invalid');
    return;
  }

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

interface SplitRow {
  left?: DiffLine;
  right?: DiffLine;
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
 * Detect language from file extension
 */
function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: { [key: string]: string } = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'java': 'java',
    'c': 'c',
    'cpp': 'cpp',
    'cs': 'csharp',
    'go': 'go',
    'rs': 'rust',
    'php': 'php',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'json': 'json',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
    'sh': 'bash',
    'bash': 'bash',
    'sql': 'sql',
    'swift': 'swift',
    'kt': 'kotlin',
    'r': 'r',
    'dart': 'dart',
  };
  return langMap[ext] || 'plaintext';
}

/**
 * Generate PR-style diff HTML for a file
 */
function generateFileDiffHtml(file: FileDiff, index: number): string {
  const language = getLanguageFromFilename(file.fileName);
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
          <td class="line-content"><pre data-language="${language}">${escapeHtml(line.content)}</pre></td>
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
    <details class="file-diff" data-file-index="${index}" data-language="${language}" open>
      <summary class="file-diff-header">
        <div class="file-header-content">
          <input type="checkbox" class="viewed-checkbox" data-file-index="${index}" onclick="event.stopPropagation()">
          <span class="file-name">${escapeHtml(file.fileName)}</span>
          ${statsHtml}
        </div>
      </summary>
      <div class="file-diff-content">
        ${hunksHtml}
      </div>
    </details>
  `;
}

function buildSplitRows(hunk: DiffHunk): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;

  while (i < hunk.lines.length) {
    const line = hunk.lines[i];
    if (line.type === 'context') {
      rows.push({ left: line, right: line });
      i += 1;
      continue;
    }

    const deletions: DiffLine[] = [];
    const additions: DiffLine[] = [];
    while (i < hunk.lines.length && hunk.lines[i].type !== 'context') {
      const current = hunk.lines[i];
      if (current.type === 'deletion') {
        deletions.push(current);
      } else if (current.type === 'addition') {
        additions.push(current);
      }
      i += 1;
    }

    const maxLen = Math.max(deletions.length, additions.length);
    for (let j = 0; j < maxLen; j++) {
      rows.push({ left: deletions[j], right: additions[j] });
    }
  }

  return rows;
}

function generateFileDiffSplitHtml(file: FileDiff, index: number): string {
  const language = getLanguageFromFilename(file.fileName);
  const statsHtml = `
    <span class="diff-stats-additions">+${file.additions}</span>
    <span class="diff-stats-deletions">-${file.deletions}</span>
  `;

  const hunksHtml = file.hunks.map(hunk => {
    const rowsHtml = buildSplitRows(hunk).map(row => {
      const leftType = row.left?.type ?? 'empty';
      const rightType = row.right?.type ?? 'empty';
      const leftNum = row.left?.oldLineNumber ?? '';
      const rightNum = row.right?.newLineNumber ?? '';
      const leftIndicator = row.left
        ? (row.left.type === 'deletion' ? '-' : row.left.type === 'addition' ? '+' : ' ')
        : '';
      const rightIndicator = row.right
        ? (row.right.type === 'addition' ? '+' : row.right.type === 'deletion' ? '-' : ' ')
        : '';
      const leftContent = row.left ? escapeHtml(row.left.content) : '';
      const rightContent = row.right ? escapeHtml(row.right.content) : '';

      return `
        <tr class="split-row">
          <td class="split-line-number split-left split-${leftType}">${leftNum}</td>
          <td class="split-line-indicator split-left split-${leftType}">${leftIndicator}</td>
          <td class="split-line-content split-left split-${leftType}"><pre data-language="${language}">${leftContent}</pre></td>
          <td class="split-line-number split-right split-${rightType}">${rightNum}</td>
          <td class="split-line-indicator split-right split-${rightType}">${rightIndicator}</td>
          <td class="split-line-content split-right split-${rightType}"><pre data-language="${language}">${rightContent}</pre></td>
        </tr>
      `;
    }).join('');

    return `
      <div class="hunk">
        <div class="hunk-header">${escapeHtml(hunk.header)}</div>
        <table class="diff-table diff-table-split">
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  return `
    <details class="file-diff file-diff-split" data-file-index="${index}" data-language="${language}" open>
      <summary class="file-diff-header">
        <div class="file-header-content">
          <input type="checkbox" class="viewed-checkbox" data-file-index="${index}" onclick="event.stopPropagation()">
          <span class="file-name">${escapeHtml(file.fileName)}</span>
          ${statsHtml}
        </div>
      </summary>
      <div class="file-diff-content">
        ${hunksHtml}
      </div>
    </details>
  `;
}

/**
 * Generate HTML content for a prompt-specific webview
 */
function getPromptWebviewContent(promptChange: PromptChange): string {
  const parsedDiff = parseDiff(promptChange.diff);
  const totalAdditions = parsedDiff.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = parsedDiff.reduce((sum, file) => sum + file.deletions, 0);

  const prDiffHtml = parsedDiff.length > 0
    ? parsedDiff.map((file, index) => generateFileDiffHtml(file, index)).join('')
    : `<div class="no-diff">No changes to display</div>`;

  const prDiffSplitHtml = parsedDiff.length > 0
    ? parsedDiff.map((file, index) => generateFileDiffSplitHtml(file, index)).join('')
    : `<div class="no-diff">No changes to display</div>`;

  const filesListHtml = promptChange.files
    .map(file => `<li><code>${escapeHtml(file)}</code></li>`)
    .join('');

  const filesSectionHtml = promptChange.files.length > 0
    ? `<ul>${filesListHtml}</ul>`
    : `<div class="no-diff">No files changed</div>`;

  const timestampRaw = typeof promptChange.timestamp === 'string' ? promptChange.timestamp : '';
  const promptDate = new Date(timestampRaw);
  const formattedTimestamp = timestampRaw && !Number.isNaN(promptDate.getTime())
    ? promptDate.toLocaleString()
    : (timestampRaw || 'Unknown');

  const hashValue = typeof promptChange.hash === 'string' ? promptChange.hash : '';
  const hashDisplay = hashValue ? `<code>${escapeHtml(hashValue)}</code>` : 'n/a';

  const promptTime = promptDate.getTime();
  const storageId = hashValue || `prompt-${Number.isNaN(promptTime) ? Date.now() : promptTime}`;
  const storageKey = `promptvc-viewed-${storageId}`;

  const bodyHtml = `
    <div class="section">
        <h2>Prompt Summary</h2>
        <div class="metadata">
            <div class="metadata-label">Time</div>
            <div class="metadata-value">${escapeHtml(formattedTimestamp)}</div>
            <div class="metadata-label">Hash</div>
            <div class="metadata-value">${hashDisplay}</div>
            <div class="metadata-label">Files</div>
            <div class="metadata-value">${promptChange.files.length}</div>
            <div class="metadata-label">Diff</div>
            <div class="metadata-value">
                <span class="diff-stats-additions">+${totalAdditions}</span>
                <span class="diff-stats-deletions">-${totalDeletions}</span>
            </div>
        </div>

        <h3>Prompt</h3>
        <pre>${escapeHtml(promptChange.prompt)}</pre>

        <h3>Files Changed (${promptChange.files.length})</h3>
        ${filesSectionHtml}

        <h3>Prompt Diff</h3>
        <div class="complete-diff">
            <div class="diff-controls">
                <button class="diff-toggle" data-view="unified">Unified</button>
                <button class="diff-toggle is-active" data-view="split">Split</button>
            </div>
            <div class="pr-diff-viewer diff-unified">
                ${prDiffHtml}
            </div>
            <div class="pr-diff-viewer diff-split">
                ${prDiffSplitHtml}
            </div>
        </div>
    </div>
  `;

  return getWebviewContentTemplate('PromptVC Prompt', storageKey, bodyHtml);
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
            ? parsedPromptDiff.map((file, fileIndex) => generateFileDiffHtml(file, fileIndex)).join('')
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
    ? parsedDiff.map((file, index) => generateFileDiffHtml(file, index)).join('')
    : `<div class="no-diff">No changes to display</div>`;

  const prDiffSplitHtml = parsedDiff.length > 0
    ? parsedDiff.map((file, index) => generateFileDiffSplitHtml(file, index)).join('')
    : `<div class="no-diff">No changes to display</div>`;

  const bodyHtml = `
    <div class="section">
        <h2>Overall Summary</h2>
        <h3>${session.perPromptChanges && session.perPromptChanges.length > 1 ? 'Prompts' : 'Prompt'}</h3>
        ${session.perPromptChanges && session.perPromptChanges.length > 1
          ? `<ol style="padding-left: 20px;">${session.perPromptChanges.map(pc => `<li style="margin: 8px 0;"><pre style="margin: 0;">${escapeHtml(pc.prompt)}</pre></li>`).join('')}</ol>`
          : `<pre>${escapeHtml(session.prompt)}</pre>`
        }

        <h3>All Files Changed (${session.files.length})</h3>
        <ul>${filesHtml}</ul>

        <h3>Complete Diff</h3>
        <div class="complete-diff">
            <div class="diff-controls">
                <button class="diff-toggle" data-view="unified">Unified</button>
                <button class="diff-toggle is-active" data-view="split">Split</button>
            </div>
            <div class="pr-diff-viewer diff-unified">
                ${prDiffHtml}
            </div>
            <div class="pr-diff-viewer diff-split">
                ${prDiffSplitHtml}
            </div>
        </div>

        <h3>Response</h3>
        <pre>${escapeHtml(session.responseSnippet)}</pre>
    </div>
  `;

  return getWebviewContentTemplate('PromptVC Session', `promptvc-viewed-${session.id}`, bodyHtml);
}

/**
 * Generate HTML template for the webview
 */
function getWebviewContentTemplate(
  title: string,
  storageKey: string,
  bodyHtml: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/vs2015.min.css">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
    <style>
        :root {
            --promptvc-diff-border: var(--vscode-diffEditor-border, var(--vscode-panel-border));
            --promptvc-diff-unchanged-bg: var(--vscode-diffEditor-unchangedCodeBackground, var(--vscode-editor-background));
            --promptvc-diff-hunk-bg: var(--vscode-diffEditor-unchangedRegionBackground, var(--vscode-peekViewEditor-background));
            --promptvc-diff-added-bg: var(--vscode-diffEditor-insertedLineBackground, var(--vscode-diffEditor-insertedTextBackground));
            --promptvc-diff-removed-bg: var(--vscode-diffEditor-removedLineBackground, var(--vscode-diffEditor-removedTextBackground));
            --promptvc-diff-added-fg: var(--vscode-gitDecoration-addedResourceForeground);
            --promptvc-diff-removed-fg: var(--vscode-gitDecoration-deletedResourceForeground);
            --promptvc-editor-bg: var(--vscode-editor-background);
            --promptvc-editor-border: var(--vscode-editorWidget-border, var(--vscode-panel-border));
            --promptvc-editor-gutter-bg: var(--vscode-editorGutter-background);
            --promptvc-editor-gutter-fg: var(--vscode-editorLineNumber-foreground);
            --promptvc-editor-line-highlight: var(--vscode-editor-lineHighlightBackground, rgba(128, 128, 128, 0.12));
            --promptvc-editor-shadow: var(--vscode-widget-shadow, rgba(0, 0, 0, 0.2));
        }
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
        .diff-controls {
            display: flex;
            gap: 8px;
            margin: 10px 0 12px;
        }
        .diff-toggle {
            border: 1px solid var(--vscode-button-border, transparent);
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            padding: 4px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .diff-toggle.is-active {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .complete-diff {
            border: 1px solid var(--promptvc-editor-border);
            border-radius: 10px;
            padding: 12px;
            background: linear-gradient(180deg, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0)), var(--promptvc-editor-bg);
            box-shadow: 0 6px 18px var(--promptvc-editor-shadow);
        }
        .complete-diff .diff-controls {
            margin-top: 0;
        }
        .complete-diff .pr-diff-viewer {
            margin-top: 12px;
        }
        .complete-diff .line-number,
        .complete-diff .split-line-number {
            font-variant-numeric: tabular-nums;
            color: var(--promptvc-editor-gutter-fg);
            background-color: var(--promptvc-editor-gutter-bg);
        }
        .complete-diff .line-indicator,
        .complete-diff .split-line-indicator {
            background-color: var(--promptvc-editor-gutter-bg);
        }
        .complete-diff .line-content pre,
        .complete-diff .split-line-content pre {
            font-variant-ligatures: none;
            tab-size: 2;
            letter-spacing: 0.1px;
        }
        body[data-diff-view="unified"] .diff-split {
            display: none;
        }
        body[data-diff-view="split"] .diff-unified {
            display: none;
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
            border: 1px solid var(--promptvc-diff-border);
            border-radius: 6px;
            overflow: hidden;
        }
        .file-diff[open] {
            border-bottom: 1px solid var(--promptvc-diff-border);
        }
        .file-diff summary {
            list-style: none;
            cursor: pointer;
        }
        .file-diff summary::-webkit-details-marker {
            display: none;
        }
        .file-diff-header {
            position: sticky;
            top: 0;
            z-index: 10;
            background-color: var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-editor-background));
            padding: 12px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 600;
            user-select: none;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        .file-diff-header:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .file-header-content {
            display: flex;
            align-items: center;
            gap: 12px;
            flex: 1;
        }
        .viewed-checkbox {
            cursor: pointer;
            width: 16px;
            height: 16px;
            margin: 0;
            flex-shrink: 0;
        }
        .file-diff.viewed .file-diff-header {
            opacity: 0.6;
        }
        .file-diff.viewed .file-name {
            text-decoration: line-through;
            color: var(--vscode-descriptionForeground);
        }
        .file-name {
            font-family: var(--vscode-editor-font-family);
            font-size: 14px;
            flex: 1;
        }
        .diff-stats-additions {
            color: var(--promptvc-diff-added-fg);
            font-weight: 600;
            margin-right: 8px;
        }
        .diff-stats-deletions {
            color: var(--promptvc-diff-removed-fg);
            font-weight: 600;
        }
        .file-diff-content {
            background-color: var(--promptvc-diff-unchanged-bg);
        }
        .hunk {
            margin: 0;
        }
        .hunk-header {
            background-color: var(--promptvc-diff-hunk-bg);
            color: var(--vscode-descriptionForeground);
            padding: 6px 12px;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size, 12px);
            border-top: 1px solid var(--promptvc-diff-border);
        }
        .diff-table {
            width: 100%;
            border-collapse: collapse;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size, 12px);
            line-height: 20px;
            color: var(--vscode-editor-foreground);
        }
        .diff-table tbody {
            background-color: var(--promptvc-diff-unchanged-bg);
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
            background-color: var(--vscode-editorGutter-background);
            border-right: 1px solid var(--promptvc-diff-border);
        }
        .line-indicator {
            width: 20px;
            padding: 0 8px;
            text-align: center;
            user-select: none;
            vertical-align: top;
            font-weight: bold;
            background-color: var(--vscode-editorGutter-background);
            border-right: 1px solid var(--promptvc-diff-border);
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
            font-size: var(--vscode-editor-font-size, 12px);
            line-height: 20px;
            white-space: pre-wrap;
            word-wrap: break-word;
            color: var(--vscode-editor-foreground);
        }
        .diff-table-split {
            width: 100%;
            border-collapse: collapse;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size, 12px);
            line-height: 20px;
            table-layout: fixed;
            color: var(--vscode-editor-foreground);
        }
        .split-line-number {
            width: 40px;
            padding: 0 10px;
            text-align: right;
            color: var(--vscode-editorLineNumber-foreground);
            user-select: none;
            vertical-align: top;
            font-size: 11px;
            background-color: var(--vscode-editorGutter-background);
            border-right: 1px solid var(--promptvc-diff-border);
        }
        .split-line-indicator {
            width: 20px;
            padding: 0 8px;
            text-align: center;
            user-select: none;
            vertical-align: top;
            font-weight: bold;
            background-color: var(--vscode-editorGutter-background);
            border-right: 1px solid var(--promptvc-diff-border);
        }
        .split-line-content {
            padding: 0;
            vertical-align: top;
            width: calc((100% - 120px) / 2);
        }
        .split-line-content pre {
            margin: 0;
            padding: 0 12px;
            background: transparent;
            border: none;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size, 12px);
            line-height: 20px;
            white-space: pre-wrap;
            word-wrap: break-word;
            color: var(--vscode-editor-foreground);
        }
        .split-addition {
            background-color: var(--promptvc-diff-added-bg);
        }
        .split-deletion {
            background-color: var(--promptvc-diff-removed-bg);
        }
        .split-addition.split-line-indicator {
            color: var(--promptvc-diff-added-fg);
        }
        .split-deletion.split-line-indicator {
            color: var(--promptvc-diff-removed-fg);
        }
        .diff-line-addition {
            background-color: var(--promptvc-diff-added-bg);
        }
        .diff-line-addition .line-indicator {
            color: var(--promptvc-diff-added-fg);
        }
        .diff-line-addition .line-number,
        .diff-line-addition .line-indicator {
            background-color: var(--vscode-editorGutter-addedBackground, var(--promptvc-diff-added-bg));
        }
        .diff-line-addition .line-content {
            background-color: var(--promptvc-diff-added-bg);
        }
        .diff-line-deletion {
            background-color: var(--promptvc-diff-removed-bg);
        }
        .diff-line-deletion .line-indicator {
            color: var(--promptvc-diff-removed-fg);
        }
        .diff-line-deletion .line-number,
        .diff-line-deletion .line-indicator {
            background-color: var(--vscode-editorGutter-deletedBackground, var(--promptvc-diff-removed-bg));
        }
        .diff-line-deletion .line-content {
            background-color: var(--promptvc-diff-removed-bg);
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

        /* Syntax highlighting overrides to match VS Code theme */
        .hljs {
            background: transparent !important;
            color: var(--vscode-editor-foreground) !important;
            font-family: var(--vscode-editor-font-family) !important;
        }
        .hljs-keyword,
        .hljs-selector-tag,
        .hljs-built_in {
            color: var(--vscode-symbolIcon-keywordForeground, var(--vscode-debugTokenExpression-name, #569cd6)) !important;
        }
        .hljs-string,
        .hljs-attr,
        .hljs-attribute,
        .hljs-property {
            color: var(--vscode-symbolIcon-stringForeground, var(--vscode-debugTokenExpression-string, #ce9178)) !important;
        }
        .hljs-number,
        .hljs-literal {
            color: var(--vscode-symbolIcon-numberForeground, var(--vscode-debugTokenExpression-number, #b5cea8)) !important;
        }
        .hljs-comment {
            color: var(--vscode-symbolIcon-textForeground, var(--vscode-descriptionForeground, #6a9955)) !important;
            font-style: italic;
        }
        .hljs-function,
        .hljs-title {
            color: var(--vscode-symbolIcon-functionForeground, var(--vscode-debugTokenExpression-name, #dcdcaa)) !important;
        }
        .hljs-variable,
        .hljs-name {
            color: var(--vscode-symbolIcon-variableForeground, var(--vscode-debugTokenExpression-value, #9cdcfe)) !important;
        }
        .hljs-class,
        .hljs-type {
            color: var(--vscode-symbolIcon-classForeground, var(--vscode-debugTokenExpression-name, #4ec9b0)) !important;
        }
        .hljs-tag {
            color: var(--vscode-symbolIcon-keywordForeground, #569cd6) !important;
        }
        .hljs-operator,
        .hljs-punctuation {
            color: var(--vscode-editor-foreground) !important;
        }
        .hljs-params {
            color: var(--vscode-symbolIcon-parameterForeground, var(--vscode-debugTokenExpression-name, #9cdcfe)) !important;
        }
        .hljs-meta {
            color: var(--vscode-symbolIcon-keywordForeground, #569cd6) !important;
        }
        .hljs-regexp {
            color: var(--vscode-symbolIcon-stringForeground, #d16969) !important;
        }
</style>
</head>
<body data-diff-view="split">
    ${bodyHtml}
    <script>
        const body = document.body;
        const buttons = document.querySelectorAll('.diff-toggle');
        const storageKey = '${escapeHtml(storageKey)}';

        // Diff view toggle
        function setView(view) {
            body.dataset.diffView = view;
            buttons.forEach(button => {
                const isActive = button.dataset.view === view;
                if (isActive) {
                    button.classList.add('is-active');
                } else {
                    button.classList.remove('is-active');
                }
            });
        }

        buttons.forEach(button => {
            button.addEventListener('click', () => {
                const view = button.dataset.view || 'unified';
                setView(view);
            });
        });

        // File viewed state management
        function loadViewedState() {
            try {
                const stored = localStorage.getItem(storageKey);
                return stored ? JSON.parse(stored) : {};
            } catch (e) {
                return {};
            }
        }

        function saveViewedState(viewedState) {
            try {
                localStorage.setItem(storageKey, JSON.stringify(viewedState));
            } catch (e) {
                console.error('Failed to save viewed state:', e);
            }
        }

        function updateFileViewedState(fileIndex, isViewed) {
            const viewedState = loadViewedState();
            viewedState[fileIndex] = isViewed;
            saveViewedState(viewedState);

            // Update UI
            const fileDiffs = document.querySelectorAll(\`.file-diff[data-file-index="\${fileIndex}"]\`);
            fileDiffs.forEach(fileDiff => {
                if (isViewed) {
                    fileDiff.classList.add('viewed');
                } else {
                    fileDiff.classList.remove('viewed');
                }
            });
        }

        // Initialize viewed state
        const viewedState = loadViewedState();
        const checkboxes = document.querySelectorAll('.viewed-checkbox');

        checkboxes.forEach(checkbox => {
            const fileIndex = checkbox.dataset.fileIndex;
            const isViewed = viewedState[fileIndex] || false;

            // Set checkbox state
            checkbox.checked = isViewed;

            // Apply viewed class to file diffs
            if (isViewed) {
                const fileDiffs = document.querySelectorAll(\`.file-diff[data-file-index="\${fileIndex}"]\`);
                fileDiffs.forEach(fileDiff => fileDiff.classList.add('viewed'));
            }

            // Add event listener
            checkbox.addEventListener('change', (e) => {
                updateFileViewedState(fileIndex, e.target.checked);
            });
        });

        // Apply syntax highlighting
        if (typeof hljs !== 'undefined') {
            document.querySelectorAll('.line-content pre[data-language], .split-line-content pre[data-language]').forEach(block => {
                const language = block.dataset.language;
                if (language && language !== 'plaintext') {
                    try {
                        const result = hljs.highlight(block.textContent, { language: language, ignoreIllegals: true });
                        block.innerHTML = result.value;
                        block.classList.add('hljs');
                    } catch (e) {
                        // Fallback to auto-detection
                        try {
                            hljs.highlightElement(block);
                        } catch (e2) {
                            // If highlighting fails, just keep the plain text
                            console.warn('Syntax highlighting failed for', language, e2);
                        }
                    }
                }
            });
        }
    </script>
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
    const promptSessionsProvider = new PromptSessionsProvider(context);
    console.log('PromptVC: Created tree data provider');

    // Register tree view
    const treeView = vscode.window.createTreeView('promptvcSessions', {
      treeDataProvider: promptSessionsProvider,
    });
    console.log('PromptVC: Registered tree view');

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.showSessionDiff', (item: PromptSessionTreeItem | PromptSession) => {
        const session = item instanceof PromptSessionTreeItem ? item.session : item;
        console.log('PromptVC: Showing session diff', session.id);
        showSessionDiff(session);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.openDiffInEditor', (item: PromptSessionTreeItem | PromptSession) => {
        const session = item instanceof PromptSessionTreeItem ? item.session : item;
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

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.showHiddenSessions', () => {
        console.log('PromptVC: Showing hidden sessions');
        promptSessionsProvider.setShowHiddenSessions(true);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.hideHiddenSessions', () => {
        console.log('PromptVC: Hiding hidden sessions');
        promptSessionsProvider.setShowHiddenSessions(false);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.hideSession', (item: PromptSessionTreeItem | PromptSession) => {
        const session = item instanceof PromptSessionTreeItem ? item.session : item;
        console.log('PromptVC: Hiding session', session.id);
        promptSessionsProvider.updateSessionMetadata(session.id, existing => ({
          ...existing,
          hidden: true,
        }));
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.unhideSession', (item: PromptSessionTreeItem | PromptSession) => {
        const session = item instanceof PromptSessionTreeItem ? item.session : item;
        console.log('PromptVC: Unhiding session', session.id);
        promptSessionsProvider.updateSessionMetadata(session.id, existing => ({
          ...existing,
          hidden: false,
        }));
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.toggleSessionFlag', (item: PromptSessionTreeItem | PromptSession) => {
        const session = item instanceof PromptSessionTreeItem ? item.session : item;
        console.log('PromptVC: Toggling flag for session', session.id);
        promptSessionsProvider.updateSessionMetadata(session.id, existing => ({
          ...existing,
          flagged: !existing.flagged,
        }));
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.editSessionTags', async (item: PromptSessionTreeItem | PromptSession) => {
        const session = item instanceof PromptSessionTreeItem ? item.session : item;
        console.log('PromptVC: Editing tags for session', session.id);
        const currentTags = session.tags?.join(', ') ?? '';
        const input = await vscode.window.showInputBox({
          prompt: 'Enter comma-separated tags for this session',
          value: currentTags,
          placeHolder: 'refactor, tests, docs',
        });

        if (input === undefined) {
          return;
        }

        const tags = normalizeTagsInput(input);
        promptSessionsProvider.updateSessionMetadata(session.id, existing => ({
          ...existing,
          tags,
        }));
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.showSessionView', () => {
        console.log('PromptVC: Switching to session view');
        promptSessionsProvider.setViewMode('session');
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.showPromptView', () => {
        console.log('PromptVC: Switching to prompt view');
        promptSessionsProvider.setViewMode('prompt');
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
