import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { PromptSession, PromptChange } from '@promptvc/types';

const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]'],
  [/\bsk-[A-Za-z0-9]{20,}\b/g, '[REDACTED_OPENAI_KEY]'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED_SLACK_TOKEN]'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, '[REDACTED_GOOGLE_KEY]'],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[REDACTED_AWS_ACCESS_KEY]'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]'],
  [/(authorization\s*:\s*bearer)\s+[^\s]+/gi, '$1 [REDACTED]'],
  [/(\b(?:postgres|mysql|mongodb|redis|amqp)s?:\/\/)([^:\s/@]+):([^\s/@]+)@/gi, '$1$2:[REDACTED]@'],
  [/(\b(?:api[_-]?key|secret|password|passwd|token|access[_-]?key|client[_-]?secret|private[_-]?key|auth[_-]?token)\b)(\s*[=:]\s*)(['"]?)([^'"\r\n]+)\3/gi, '$1$2[REDACTED]'],
  [/(\b(?:api[_-]?key|secret|password|passwd|token|access[_-]?key|client[_-]?secret|private[_-]?key|auth[_-]?token)\b)\s+([A-Za-z0-9+/_=-]{8,})/gi, '$1 [REDACTED]'],
  [/(\bssh-(?:rsa|ed25519)\b|\becdsa-[^\s]+)\s+[A-Za-z0-9+/=]{40,}/g, '$1 [REDACTED_SSH_KEY]'],
];

function redactSensitive(value: string): string {
  if (!value) {
    return value;
  }

  let redacted = value.replace(PRIVATE_KEY_BLOCK, (match) => {
    const lines = match.split('\n');
    if (lines.length >= 2) {
      return `${lines[0]}\n[REDACTED_PRIVATE_KEY]\n${lines[lines.length - 1]}`;
    }
    return '[REDACTED_PRIVATE_KEY]';
  });

  for (const [pattern, replacement] of REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }

  return redacted;
}

function redactPromptChange(change: PromptChange): PromptChange {
  return {
    ...change,
    prompt: redactSensitive(change.prompt),
    response: change.response ? redactSensitive(change.response) : undefined,
    diff: redactSensitive(change.diff),
  };
}

function redactPromptSession(session: PromptSession): PromptSession {
  return {
    ...session,
    prompt: redactSensitive(session.prompt),
    responseSnippet: redactSensitive(session.responseSnippet),
    diff: redactSensitive(session.diff),
    perPromptChanges: session.perPromptChanges?.map(redactPromptChange),
  };
}

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

function parseTimestamp(value?: string): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortPromptChangesNewestFirst(promptChanges: PromptChange[]): PromptChange[] {
  return promptChanges
    .map((promptChange, index) => ({
      promptChange,
      index,
      sortTime: parseTimestamp(promptChange.timestamp),
    }))
    .sort((a, b) => {
      if (a.sortTime !== b.sortTime) {
        return b.sortTime - a.sortTime;
      }
      return b.index - a.index;
    })
    .map(entry => entry.promptChange);
}

const PROMPTVC_DIR_NAME = '.promptvc';
const SETTINGS_FILE_NAME = 'settings.json';
const NOTIFY_SOUND_SETTING_KEY = 'notifySoundEnabled';
const DEFAULT_NOTIFY_SOUND_ENABLED = true;

function getRepoRootFromWorkspace(): string | null {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return null;
  }

  return workspaceFolders[0].uri.fsPath;
}

function getSettingsPath(repoRoot: string): string {
  return path.join(repoRoot, PROMPTVC_DIR_NAME, SETTINGS_FILE_NAME);
}

function readPromptvcSettings(repoRoot: string): Record<string, unknown> {
  const settingsPath = getSettingsPath(repoRoot);
  if (!fs.existsSync(settingsPath)) {
    return {};
  }

  try {
    const data = fs.readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(data);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (error) {
    console.warn('PromptVC: Failed to read settings:', error);
  }

  return {};
}

function writePromptvcSettings(repoRoot: string, settings: Record<string, unknown>): boolean {
  try {
    const settingsDir = path.join(repoRoot, PROMPTVC_DIR_NAME);
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }

    const settingsPath = getSettingsPath(repoRoot);
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    console.error('PromptVC: Failed to write settings:', error);
    return false;
  }
}

function getNotifySoundEnabled(repoRoot: string | null): boolean {
  if (!repoRoot) {
    return DEFAULT_NOTIFY_SOUND_ENABLED;
  }

  const settings = readPromptvcSettings(repoRoot);
  const value = settings[NOTIFY_SOUND_SETTING_KEY];
  return typeof value === 'boolean' ? value : DEFAULT_NOTIFY_SOUND_ENABLED;
}

function setNotifySoundEnabled(repoRoot: string | null, enabled: boolean): boolean {
  if (!repoRoot) {
    return false;
  }

  const settings = readPromptvcSettings(repoRoot);
  settings[NOTIFY_SOUND_SETTING_KEY] = enabled;
  return writePromptvcSettings(repoRoot, settings);
}

function getCodexIconUri(extensionUri: vscode.Uri): vscode.Uri | null {
  const assetIconPath = path.join(extensionUri.fsPath, '..', '..', 'assets', 'openai.svg');
  const candidates = [
    vscode.Uri.file(assetIconPath),
    vscode.Uri.joinPath(extensionUri, 'media', 'openai.svg'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate.fsPath)) {
      return candidate;
    }
  }

  return null;
}

const WEBVIEW_URL = 'https://prompt-vc.vercel.app/session';

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
      arguments: [promptChange, fileName],
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

  constructor(private context: vscode.ExtensionContext) {
    this.showHiddenSessions = this.context.workspaceState.get('promptvc.showHiddenSessions', false);
    this.viewMode = this.context.workspaceState.get('promptvc.viewMode', 'session');
    this.updateHiddenContext();
    this.updateViewModeContext();
    this.initializeStorage();
    this.setupFileWatcher();
  }

  private updateHiddenContext(): void {
    void vscode.commands.executeCommand('setContext', 'promptvc.showHiddenSessions', this.showHiddenSessions);
  }

  private updateViewModeContext(): void {
    void vscode.commands.executeCommand('setContext', 'promptvc.viewMode', this.viewMode);
  }

  private updateInitContext(): void {
    if (!this.repoRoot) {
      void vscode.commands.executeCommand('setContext', 'promptvc.hasInit', false);
      this.updateSessionsContext(false);
      return;
    }

    const promptvcDir = path.join(this.repoRoot, PROMPTVC_DIR_NAME);
    const sessionsPath = path.join(promptvcDir, 'sessions.json');
    const hasInit = fs.existsSync(promptvcDir) && fs.existsSync(sessionsPath);
    void vscode.commands.executeCommand('setContext', 'promptvc.hasInit', hasInit);
  }

  private updateSessionsContext(hasSessions: boolean): void {
    void vscode.commands.executeCommand('setContext', 'promptvc.hasSessions', hasSessions);
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
      this.refresh();
    });

    this.fileWatcher.onDidCreate(() => {
      console.log('PromptVC: Sessions file created, refreshing...');
      this.refresh();
    });

    this.fileWatcher.onDidDelete(() => {
      console.log('PromptVC: Sessions file deleted, refreshing...');
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
        this.repoRoot = null;
        this.updateInitContext();
        return;
      }

      this.repoRoot = workspaceFolders[0].uri.fsPath;
      console.log('PromptVC: Repo root:', this.repoRoot);
      this.updateInitContext();

      this.sessionsFilePath = path.join(this.repoRoot, '.promptvc', 'sessions.json');
      console.log('PromptVC: Looking for sessions at:', this.sessionsFilePath);
      this.updateSessionsContext(false);

      if (!fs.existsSync(this.sessionsFilePath)) {
        console.log('PromptVC: Sessions file does not exist yet');
        this.updateSessionsContext(false);
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
      this.updateSessionsContext(false);
      return [];
    }

    try {
      const data = fs.readFileSync(this.sessionsFilePath, 'utf-8');
      const sessions = JSON.parse(data);
      if (!Array.isArray(sessions)) {
        this.updateSessionsContext(false);
        return [];
      }
      const redactedSessions = sessions.map(redactPromptSession);
      this.updateSessionsContext(redactedSessions.length > 0);
      return redactedSessions;
    } catch (error) {
      console.error('PromptVC: Failed to read sessions:', error);
      this.updateSessionsContext(false);
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
      const redactedSessions = sessions.map(redactPromptSession);
      fs.writeFileSync(this.sessionsFilePath, JSON.stringify(redactedSessions, null, 2));
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
        const orderedPromptChanges = sortPromptChangesNewestFirst(promptChanges);
        return Promise.resolve(orderedPromptChanges.map(pc => new PromptChangeTreeItem(pc, element.session.id)));
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
        const allPrompts: Array<{
          promptChange: PromptChange;
          sessionId: string;
          sessionOrder: number;
          promptIndex: number;
          sortTime: number;
        }> = [];

        const addPromptChanges = (
          promptChanges: PromptChange[],
          sessionId: string,
          sessionOrder: number,
          fallbackTime: number
        ) => {
          promptChanges.forEach((promptChange, promptIndex) => {
            const promptTime = parseTimestamp(promptChange.timestamp) || fallbackTime;
            allPrompts.push({
              promptChange,
              sessionId,
              sessionOrder,
              promptIndex,
              sortTime: promptTime,
            });
          });
        };

        // Add prompts from all completed sessions
        sessions.forEach((session, sessionIndex) => {
          if (session.perPromptChanges && session.perPromptChanges.length > 0) {
            addPromptChanges(
              session.perPromptChanges,
              session.id,
              sessionIndex,
              parseTimestamp(session.createdAt)
            );
          }
        });

        allPrompts.sort((a, b) => {
          if (a.sortTime !== b.sortTime) {
            return b.sortTime - a.sortTime;
          }
          if (a.sessionOrder !== b.sessionOrder) {
            return a.sessionOrder - b.sessionOrder;
          }
          return b.promptIndex - a.promptIndex;
        });

        return Promise.resolve(allPrompts.map(item => new PromptChangeTreeItem(item.promptChange, item.sessionId)));
      }

      // SESSION VIEW MODE: Show grouped by sessions (default)
      const items: PromptSessionTreeItem[] = [];
      const codexIconUri = getCodexIconUri(this.context.extensionUri);

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
          session.inProgress === true,
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
  }
}

/**
 * Show diff for a single prompt change
 */
async function showPromptDiff(promptChange: PromptChange, focusFile?: string): Promise<void> {
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

    const repoRoot = getRepoRootFromWorkspace();
    registerWebviewOpenFileHandler(panel, repoRoot);
    panel.webview.html = getPromptWebviewContent(promptChange, focusFile);
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

  const repoRoot = session.repoRoot || getRepoRootFromWorkspace();
  registerWebviewOpenFileHandler(panel, repoRoot);
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

function resolveFilePath(repoRoot: string | null, fileName: string): string | null {
  const cleaned = stripDiffPrefix(fileName);
  if (path.isAbsolute(cleaned)) {
    return cleaned;
  }
  if (!repoRoot) {
    return null;
  }
  return path.join(repoRoot, cleaned);
}

async function openFileAtLine(
  fileName: string,
  lineNumber: number | undefined,
  repoRoot: string | null,
  options?: { viewColumn?: vscode.ViewColumn; preserveFocus?: boolean }
): Promise<void> {
  const filePath = resolveFilePath(repoRoot, fileName);
  if (!filePath) {
    vscode.window.showErrorMessage('PromptVC: No workspace folder found.');
    return;
  }
  if (!fs.existsSync(filePath)) {
    vscode.window.showErrorMessage(`PromptVC: File not found: ${stripDiffPrefix(fileName)}`);
    return;
  }

  const targetLine = Number.isFinite(lineNumber) && lineNumber && lineNumber > 0 ? lineNumber : 1;
  const position = new vscode.Position(targetLine - 1, 0);
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
  const editor = await vscode.window.showTextDocument(document, {
    preview: true,
    viewColumn: options?.viewColumn,
    preserveFocus: options?.preserveFocus ?? false,
  });
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

function registerWebviewOpenFileHandler(panel: vscode.WebviewPanel, repoRoot: string | null): void {
  panel.webview.onDidReceiveMessage(async (message) => {
    if (!message || message.type !== 'openFileAtLine') {
      return;
    }
    const fileName = typeof message.fileName === 'string' ? message.fileName : '';
    const lineNumber = typeof message.lineNumber === 'number' ? message.lineNumber : undefined;
    const openInSplit = message.openInSplit === true;
    if (!fileName) {
      return;
    }
    try {
      await openFileAtLine(fileName, lineNumber, repoRoot, {
        viewColumn: openInSplit ? vscode.ViewColumn.Beside : undefined,
      });
    } catch (error) {
      vscode.window.showErrorMessage(`PromptVC: Failed to open file: ${error}`);
    }
  });
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

function decodeDiffEscape(char: string): string {
  switch (char) {
    case 'n':
      return '\n';
    case 'r':
      return '\r';
    case 't':
      return '\t';
    case '"':
      return '"';
    case '\\':
      return '\\';
    default:
      return char;
  }
}

function stripDiffPrefix(value: string): string {
  if (value.startsWith('a/') || value.startsWith('b/')) {
    return value.slice(2);
  }
  return value;
}

function parseDiffHeader(line: string): { oldPath: string; newPath: string } | null {
  if (!line.startsWith('diff --git ')) {
    return null;
  }

  const remainder = line.slice('diff --git '.length);
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let isEscaped = false;

  for (let i = 0; i < remainder.length; i++) {
    const char = remainder[i];
    if (isEscaped) {
      current += decodeDiffEscape(char);
      isEscaped = false;
      continue;
    }
    if (char === '\\') {
      isEscaped = true;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ' ' && !inQuotes) {
      if (current.length > 0) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  if (parts.length < 2) {
    return null;
  }

  const [oldPath, newPath] = parts;
  return {
    oldPath: stripDiffPrefix(oldPath),
    newPath: stripDiffPrefix(newPath),
  };
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

      currentFile = null;
      currentHunk = null;

      const header = parseDiffHeader(line);
      if (header) {
        currentFile = {
          fileName: header.newPath,
          oldPath: header.oldPath,
          newPath: header.newPath,
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
      const lineNumber = line.newLineNumber ?? line.oldLineNumber;
      const lineAttr = typeof lineNumber === 'number' ? ` data-line-number="${lineNumber}"` : '';

      let indicator = '';
      if (line.type === 'addition') indicator = '+';
      else if (line.type === 'deletion') indicator = '-';
      else if (line.type === 'context') indicator = ' ';

      return `
        <tr class="${lineClass}"${lineAttr}>
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
    <details class="file-diff" data-file-index="${index}" data-language="${language}" data-file-name="${escapeHtml(file.fileName)}" open>
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
      const jumpLine = row.right?.newLineNumber ?? row.left?.oldLineNumber;
      const lineAttr = typeof jumpLine === 'number' ? ` data-line-number="${jumpLine}"` : '';
      const leftIndicator = row.left
        ? (row.left.type === 'deletion' ? '-' : row.left.type === 'addition' ? '+' : ' ')
        : '';
      const rightIndicator = row.right
        ? (row.right.type === 'addition' ? '+' : row.right.type === 'deletion' ? '-' : ' ')
        : '';
      const leftContent = row.left ? escapeHtml(row.left.content) : '';
      const rightContent = row.right ? escapeHtml(row.right.content) : '';

      return `
        <tr class="split-row"${lineAttr}>
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
    <details class="file-diff file-diff-split" data-file-index="${index}" data-language="${language}" data-file-name="${escapeHtml(file.fileName)}" open>
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

const filesIconSvg = `
  <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M2.5 2.5A1.5 1.5 0 0 1 4 1h5l3.5 3.5V13A1.5 1.5 0 0 1 11 14.5H4A1.5 1.5 0 0 1 2.5 13z" fill="currentColor" opacity="0.85"/>
    <path d="M9 1v3.5h3.5" fill="currentColor"/>
    <path d="M1.5 4A1.5 1.5 0 0 1 3 2.5h.75v1H3a.5.5 0 0 0-.5.5V13a.5.5 0 0 0 .5.5h7.25v1H3A1.5 1.5 0 0 1 1.5 13z" fill="currentColor" opacity="0.45"/>
  </svg>
`;

function renderFilesChangedHeading(label: string, count: number): string {
  return `
    <h3 class="section-title">
      <span class="section-title-icon">${filesIconSvg}</span>
      <span class="section-title-text">${escapeHtml(label)}</span>
      <span class="section-title-count">${count}</span>
    </h3>
  `;
}

function resolveFilesFromDiff(files: string[] | undefined, parsedDiff: FileDiff[]): string[] {
  const diffFiles = parsedDiff.map(file => file.fileName).filter(Boolean);
  if (diffFiles.length > 0) {
    return Array.from(new Set(diffFiles));
  }
  if (!files) {
    return [];
  }
  return Array.from(new Set(files));
}

function renderFilesChangedListItems(files: string[]): string {
  return files.map(file => {
    const escapedFile = escapeHtml(file);
    return `
      <li>
        <button class="file-link" type="button" data-file-name="${escapedFile}" title="${escapedFile}">
          <span class="file-link-text">${escapedFile}</span>
        </button>
      </li>
    `;
  }).join('');
}

function renderFilesChangedSection(
  files: string[],
  options?: { compact?: boolean; emptyMessage?: string }
): string {
  const emptyMessage = options?.emptyMessage ?? 'No files changed';

  if (!files || files.length === 0) {
    return `
      <div class="files-changed files-changed-empty">
        <div class="no-diff">${escapeHtml(emptyMessage)}</div>
      </div>
    `;
  }

  const itemsHtml = renderFilesChangedListItems(files);
  const compactClass = options?.compact ? ' files-changed-compact' : '';

  return `
    <div class="files-changed${compactClass}">
      <ul class="files-changed-list">
        ${itemsHtml}
      </ul>
    </div>
  `;
}

/**
 * Generate HTML content for a prompt-specific webview
 */
function getPromptWebviewContent(promptChange: PromptChange, focusFile?: string): string {
  const parsedDiff = parseDiff(promptChange.diff);
  const totalAdditions = parsedDiff.reduce((sum, file) => sum + file.additions, 0);
  const totalDeletions = parsedDiff.reduce((sum, file) => sum + file.deletions, 0);
  const diffFiles = resolveFilesFromDiff(promptChange.files, parsedDiff);

  const prDiffHtml = parsedDiff.length > 0
    ? parsedDiff.map((file, index) => generateFileDiffHtml(file, index)).join('')
    : `<div class="no-diff">No changes to display</div>`;

  const prDiffSplitHtml = parsedDiff.length > 0
    ? parsedDiff.map((file, index) => generateFileDiffSplitHtml(file, index)).join('')
    : `<div class="no-diff">No changes to display</div>`;

  const filesSectionHtml = renderFilesChangedSection(diffFiles, {
    emptyMessage: 'No files changed',
  });

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
  const responseHtml = promptChange.response
    ? `<h3>Response</h3><pre class="prompt-block">${escapeHtml(promptChange.response)}</pre>`
    : '';

  const bodyHtml = `
    <div class="section">
        <h3>Prompt</h3>
        <pre class="prompt-block">${escapeHtml(promptChange.prompt)}</pre>
        ${responseHtml}

        ${renderFilesChangedHeading('Files Changed', diffFiles.length)}
        ${filesSectionHtml}

        <h3>Prompt Diff</h3>
        <div class="diff-controls diff-controls-top">
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
  `;

  return getWebviewContentTemplate('PromptVC Prompt', storageKey, bodyHtml, focusFile);
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
          const parsedPromptDiff = parseDiff(pc.diff);
          const promptFiles = resolveFilesFromDiff(pc.files, parsedPromptDiff);
          const totalAdditions = parsedPromptDiff.reduce((sum, file) => sum + file.additions, 0);
          const totalDeletions = parsedPromptDiff.reduce((sum, file) => sum + file.deletions, 0);
          const responseHtml = pc.response
            ? `<div class="prompt-response"><div class="files-list-label">Response</div><pre class="prompt-block prompt-block-compact">${escapeHtml(pc.response)}</pre></div>`
            : '';
          const promptDiffHtml = parsedPromptDiff.length > 0
            ? parsedPromptDiff.map((file, fileIndex) => generateFileDiffHtml(file, fileIndex)).join('')
            : `<div class="no-diff">No changes</div>`;
          const promptFilesSectionHtml = renderFilesChangedSection(promptFiles, {
            compact: true,
            emptyMessage: 'No files changed',
          });

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
              ${responseHtml}
              <div class="files-list">
                <div class="files-list-label">Files (${promptFiles.length})</div>
                ${promptFilesSectionHtml}
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

  // Parse and generate PR-style diff
  const parsedDiff = parseDiff(session.diff);
  const sessionFiles = resolveFilesFromDiff(session.files, parsedDiff);
  const filesSectionHtml = renderFilesChangedSection(sessionFiles, {
    emptyMessage: 'No files changed',
  });
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
          ? `<ol style="padding-left: 20px;">${session.perPromptChanges.map(pc => `<li style="margin: 8px 0;"><pre class="prompt-block prompt-block-compact">${escapeHtml(pc.prompt)}</pre></li>`).join('')}</ol>`
          : `<pre class="prompt-block">${escapeHtml(session.prompt)}</pre>`
        }

        ${renderFilesChangedHeading('All Files Changed', sessionFiles.length)}
        ${filesSectionHtml}

        <h3>Complete Diff</h3>
        <div class="diff-controls diff-controls-top">
            <button class="diff-toggle" data-view="unified">Unified</button>
            <button class="diff-toggle is-active" data-view="split">Split</button>
        </div>
        <div class="pr-diff-viewer diff-unified">
            ${prDiffHtml}
        </div>
        <div class="pr-diff-viewer diff-split">
            ${prDiffSplitHtml}
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
  bodyHtml: string,
  focusFile?: string
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
            --promptvc-diff-border: var(--vscode-panel-border, rgba(128, 128, 128, 0.2));
            --promptvc-diff-border-light: rgba(128, 128, 128, 0.1);
            --promptvc-diff-unchanged-bg: var(--vscode-editor-background);
            --promptvc-diff-hunk-bg: var(--vscode-peekViewEditor-background, rgba(128, 128, 128, 0.05));
            --promptvc-diff-added-bg: rgba(46, 160, 67, 0.15);
            --promptvc-diff-added-bg-subtle: rgba(46, 160, 67, 0.08);
            --promptvc-diff-removed-bg: rgba(248, 81, 73, 0.15);
            --promptvc-diff-removed-bg-subtle: rgba(248, 81, 73, 0.08);
            --promptvc-diff-added-fg: #3fb950;
            --promptvc-diff-removed-fg: #f85149;
            --promptvc-diff-added-border: #3fb950;
            --promptvc-diff-removed-border: #f85149;
            --promptvc-editor-bg: var(--vscode-editor-background);
            --promptvc-editor-border: var(--vscode-editorWidget-border, var(--vscode-panel-border));
            --promptvc-editor-gutter-bg: transparent;
            --promptvc-editor-gutter-fg: var(--vscode-editorLineNumber-foreground, rgba(128, 128, 128, 0.6));
            --promptvc-editor-line-highlight: rgba(128, 128, 128, 0.08);
            --promptvc-file-header-bg: var(--vscode-editorGroupHeader-tabsBackground, rgba(128, 128, 128, 0.05));
            --promptvc-file-header-hover: rgba(128, 128, 128, 0.12);
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
        .section-title {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 16px 0 10px;
            padding: 6px 10px;
            border-radius: 8px;
            border: 1px solid var(--promptvc-diff-border);
            background-color: var(--vscode-editorWidget-background, var(--vscode-editor-background));
        }
        .section-title-icon {
            display: inline-flex;
            width: 16px;
            height: 16px;
            color: var(--vscode-symbolIcon-fileForeground, var(--vscode-foreground));
        }
        .section-title-icon svg {
            width: 16px;
            height: 16px;
        }
        .section-title-count {
            margin-left: auto;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            font-size: 0.85em;
            font-weight: 600;
            padding: 2px 8px;
            border-radius: 999px;
            font-family: var(--vscode-editor-font-family);
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
        .prompt-block {
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            word-break: break-word;
            overflow-x: hidden;
        }
        .prompt-block-compact {
            margin: 0;
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
        .files-changed {
            border: 1px solid var(--promptvc-diff-border);
            border-radius: 8px;
            padding: 8px;
            background-color: var(--vscode-editorWidget-background, var(--vscode-editor-background));
        }
        .files-changed-compact {
            padding: 6px;
        }
        .files-changed-list {
            margin: 0;
            display: grid;
            gap: 6px 12px;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        }
        .files-changed-list li {
            padding: 0;
        }
        .files-changed-compact .files-changed-list {
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        }
        .files-changed-empty .no-diff {
            padding: 12px;
        }
        .file-link {
            width: 100%;
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 8px;
            border-radius: 6px;
            border: 1px solid transparent;
            background: transparent;
            color: var(--vscode-foreground);
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            text-align: left;
            cursor: pointer;
        }
        .file-link:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .file-link:focus-visible {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }
        .file-link.is-active {
            background-color: var(--vscode-list-activeSelectionBackground, var(--vscode-list-focusBackground));
            border-color: var(--vscode-focusBorder);
            color: var(--vscode-list-activeSelectionForeground, var(--vscode-foreground));
        }
        .file-link-text {
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        .files-list-label {
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 6px;
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
        .diff-controls-top {
            margin-top: 4px;
        }
        .pr-diff-viewer {
            margin-top: 12px;
        }
        .pr-diff-viewer .line-number,
        .pr-diff-viewer .split-line-number {
            font-variant-numeric: tabular-nums;
            color: var(--promptvc-editor-gutter-fg);
            background-color: var(--promptvc-editor-gutter-bg);
        }
        .pr-diff-viewer .line-indicator,
        .pr-diff-viewer .split-line-indicator {
            background-color: var(--promptvc-editor-gutter-bg);
        }
        .pr-diff-viewer .line-content pre,
        .pr-diff-viewer .split-line-content pre {
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
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            word-break: break-word;
        }
        .files-list {
            margin: 10px 0;
        }
        .files-list .files-changed {
            margin-top: 4px;
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
        /* PR-style diff viewer - GitHub-inspired */
        .file-diff {
            margin: 16px 0;
            border: 1px solid var(--promptvc-diff-border);
            border-radius: 6px;
            overflow: hidden;
            background-color: var(--promptvc-diff-unchanged-bg);
            transition: border-color 0.2s ease;
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
            background-color: var(--promptvc-file-header-bg);
            padding: 8px 16px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 600;
            font-size: 13px;
            user-select: none;
            transition: background-color 0.2s ease;
            border-bottom: 1px solid var(--promptvc-diff-border-light);
        }
        .file-diff-header:hover {
            background-color: var(--promptvc-file-header-hover);
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
            opacity: 0.5;
        }
        .file-diff.viewed .file-name {
            text-decoration: line-through;
            color: var(--vscode-descriptionForeground);
        }
        .file-diff.is-focused {
            outline: 2px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }
        .file-diff.is-focused .file-diff-header {
            background-color: var(--vscode-list-focusBackground, var(--vscode-editorGroupHeader-tabsBackground));
        }
        .file-name {
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            font-weight: 600;
            flex: 1;
            color: var(--vscode-foreground);
        }
        .diff-stats-additions {
            color: var(--promptvc-diff-added-fg);
            font-weight: 600;
            font-size: 12px;
            margin-right: 8px;
        }
        .diff-stats-deletions {
            color: var(--promptvc-diff-removed-fg);
            font-weight: 600;
            font-size: 12px;
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
            padding: 8px 16px;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
            font-weight: 500;
            border-top: 1px solid var(--promptvc-diff-border-light);
            border-bottom: 1px solid var(--promptvc-diff-border-light);
        }
        .diff-table {
            width: 100%;
            border-collapse: collapse;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            line-height: 20px;
            color: var(--vscode-editor-foreground);
        }
        .diff-table tbody {
            background-color: var(--promptvc-diff-unchanged-bg);
        }
        .diff-line {
            border: none;
        }
        .diff-line td {
            border: none;
        }
        .diff-line:hover .line-content {
            background-color: var(--promptvc-editor-line-highlight) !important;
        }
        .line-number {
            width: 50px;
            min-width: 50px;
            padding: 0 12px;
            text-align: right;
            color: var(--promptvc-editor-gutter-fg);
            user-select: none;
            vertical-align: top;
            font-size: 12px;
            font-variant-numeric: tabular-nums;
            background-color: var(--promptvc-editor-gutter-bg);
        }
        .line-indicator {
            width: 32px;
            min-width: 32px;
            padding: 0;
            text-align: center;
            user-select: none;
            vertical-align: top;
            font-weight: 600;
            font-size: 14px;
            background-color: var(--promptvc-editor-gutter-bg);
        }
        .line-content {
            padding: 0;
            vertical-align: top;
            width: 100%;
            position: relative;
        }
        .line-content pre {
            margin: 0;
            padding: 0 16px;
            background: transparent;
            border: none;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            line-height: 20px;
            white-space: pre-wrap;
            word-wrap: break-word;
            color: var(--vscode-editor-foreground);
        }
        .diff-table-split {
            width: 100%;
            border-collapse: collapse;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            line-height: 20px;
            table-layout: fixed;
            color: var(--vscode-editor-foreground);
        }
        .split-row td {
            border: none;
        }
        .split-row:hover .split-line-content {
            background-color: var(--promptvc-editor-line-highlight) !important;
        }
        .split-line-number {
            width: 50px;
            min-width: 50px;
            padding: 0 12px;
            text-align: right;
            color: var(--promptvc-editor-gutter-fg);
            user-select: none;
            vertical-align: top;
            font-size: 12px;
            font-variant-numeric: tabular-nums;
            background-color: var(--promptvc-editor-gutter-bg);
        }
        .split-line-indicator {
            width: 32px;
            min-width: 32px;
            padding: 0;
            text-align: center;
            user-select: none;
            vertical-align: top;
            font-weight: 600;
            font-size: 14px;
            background-color: var(--promptvc-editor-gutter-bg);
        }
        .split-line-content {
            padding: 0;
            vertical-align: top;
            width: calc((100% - 164px) / 2);
            position: relative;
        }
        .split-line-content:first-of-type {
            border-right: 1px solid var(--promptvc-diff-border-light);
        }
        .split-line-content pre {
            margin: 0;
            padding: 0 16px;
            background: transparent;
            border: none;
            font-family: var(--vscode-editor-font-family);
            font-size: 13px;
            line-height: 20px;
            white-space: pre-wrap;
            word-wrap: break-word;
            color: var(--vscode-editor-foreground);
        }
        .split-addition {
            background-color: var(--promptvc-diff-added-bg-subtle);
        }
        .split-deletion {
            background-color: var(--promptvc-diff-removed-bg-subtle);
        }
        .split-addition.split-line-content {
            background-color: var(--promptvc-diff-added-bg);
        }
        .split-deletion.split-line-content {
            background-color: var(--promptvc-diff-removed-bg);
        }
        .split-addition.split-line-indicator {
            color: var(--promptvc-diff-added-fg);
            background-color: var(--promptvc-diff-added-bg-subtle);
        }
        .split-deletion.split-line-indicator {
            color: var(--promptvc-diff-removed-fg);
            background-color: var(--promptvc-diff-removed-bg-subtle);
        }
        .split-addition.split-line-number {
            background-color: var(--promptvc-diff-added-bg-subtle);
        }
        .split-deletion.split-line-number {
            background-color: var(--promptvc-diff-removed-bg-subtle);
        }
        .diff-line-addition {
            background-color: transparent;
        }
        .diff-line-addition .line-indicator {
            color: var(--promptvc-diff-added-fg);
            background-color: var(--promptvc-diff-added-bg-subtle);
        }
        .diff-line-addition .line-number {
            background-color: var(--promptvc-diff-added-bg-subtle);
        }
        .diff-line-addition .line-content {
            background-color: var(--promptvc-diff-added-bg);
        }
        .diff-line-deletion {
            background-color: transparent;
        }
        .diff-line-deletion .line-indicator {
            color: var(--promptvc-diff-removed-fg);
            background-color: var(--promptvc-diff-removed-bg-subtle);
        }
        .diff-line-deletion .line-number {
            background-color: var(--promptvc-diff-removed-bg-subtle);
        }
        .diff-line-deletion .line-content {
            background-color: var(--promptvc-diff-removed-bg);
        }
        .diff-line-context {
            background-color: transparent;
        }
        .diff-line-context .line-indicator {
            color: var(--vscode-descriptionForeground);
            font-weight: 400;
        }
        .no-diff {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 13px;
        }

        /* Improved visual polish */
        .file-diff:first-child {
            margin-top: 0;
        }
        .file-diff:last-child {
            margin-bottom: 0;
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
        const focusFile = ${JSON.stringify(focusFile ?? '')};
        const vscodeApi = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;

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

        function normalizePath(value) {
            return value.replace(/\\\\/g, '/');
        }

        function findMatches(targetFile, elements, getValue) {
            if (!targetFile) {
                return [];
            }

            const normalizedTarget = normalizePath(targetFile);
            let matches = elements.filter(el => normalizePath(getValue(el) || '') === normalizedTarget);

            if (matches.length === 0) {
                const targetBase = normalizedTarget.split('/').pop();
                matches = elements.filter(el => (getValue(el) || '').split('/').pop() === targetBase);
            }

            return matches;
        }

        function updateActiveFileLinks(targetFile) {
            const fileLinks = Array.from(document.querySelectorAll('.file-link'));
            fileLinks.forEach(link => link.classList.remove('is-active'));

            const matches = findMatches(targetFile, fileLinks, el => el.dataset.fileName || '');
            matches.forEach(link => link.classList.add('is-active'));
        }

        function focusFileDiff(targetFile) {
            if (!targetFile) {
                return;
            }

            const fileDiffs = Array.from(document.querySelectorAll('.file-diff'));
            const matches = findMatches(targetFile, fileDiffs, el => el.dataset.fileName || '');

            document.querySelectorAll('.file-diff.is-focused').forEach(el => {
                el.classList.remove('is-focused');
            });

            if (matches.length === 0) {
                updateActiveFileLinks(targetFile);
                return;
            }

            matches.forEach(el => {
                el.classList.add('is-focused');
                el.setAttribute('open', 'true');
            });

            const view = body.dataset.diffView || 'split';
            const preferredSelector = view === 'unified' ? '.diff-unified' : '.diff-split';
            const preferredMatch = matches.find(el => el.closest(preferredSelector));
            const focusTarget = preferredMatch || matches[0];

            if (focusTarget) {
                focusTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }

            updateActiveFileLinks(targetFile);
        }

        document.querySelectorAll('.file-link').forEach(link => {
            link.addEventListener('click', () => {
                const fileName = link.dataset.fileName;
                if (!fileName) {
                    return;
                }

                focusFileDiff(fileName);
            });
        });

        function handleOpenFileRequest(fileName, lineNumber, openInSplit) {
            if (!vscodeApi || !fileName) {
                return;
            }
            vscodeApi.postMessage({
                type: 'openFileAtLine',
                fileName,
                lineNumber,
                openInSplit: openInSplit === true,
            });
        }

        document.addEventListener('dblclick', (event) => {
            const target = event.target instanceof Element ? event.target : null;
            if (!target) {
                return;
            }
            const row = target.closest('tr[data-line-number]');
            if (!row) {
                return;
            }
            const fileNode = row.closest('.file-diff');
            if (!fileNode) {
                return;
            }
            const fileName = fileNode.dataset.fileName;
            const lineNumber = Number(row.dataset.lineNumber);
            if (!fileName || !Number.isFinite(lineNumber)) {
                return;
            }
            handleOpenFileRequest(fileName, lineNumber, true);
        });

        document.querySelectorAll('.file-diff-header').forEach(header => {
            header.addEventListener('dblclick', (event) => {
                event.preventDefault();
                const currentTarget = event.currentTarget instanceof Element ? event.currentTarget : null;
                if (!currentTarget) {
                    return;
                }
                const fileNode = currentTarget.closest('.file-diff');
                if (!fileNode) {
                    return;
                }
                const fileName = fileNode.dataset.fileName;
                const firstRow = fileNode.querySelector('tr[data-line-number]');
                const lineNumber = firstRow ? Number(firstRow.dataset.lineNumber) : undefined;
                handleOpenFileRequest(fileName, lineNumber, true);
            });
        });

        focusFileDiff(focusFile);
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

    const updateNotifySoundContext = (): boolean => {
      const enabled = getNotifySoundEnabled(getRepoRootFromWorkspace());
      void vscode.commands.executeCommand('setContext', 'promptvc.notifySoundEnabled', enabled);
      return enabled;
    };

    const setNotifySound = (enabled: boolean): void => {
      const repoRoot = getRepoRootFromWorkspace();
      if (!repoRoot) {
        vscode.window.showErrorMessage('PromptVC: No workspace folder found.');
        return;
      }

      if (!setNotifySoundEnabled(repoRoot, enabled)) {
        vscode.window.showErrorMessage('PromptVC: Failed to update session sound setting.');
        return;
      }

      void vscode.commands.executeCommand('setContext', 'promptvc.notifySoundEnabled', enabled);
      vscode.window.setStatusBarMessage(`PromptVC: Session sound ${enabled ? 'enabled' : 'disabled'}`, 2000);
    };

    updateNotifySoundContext();

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
      vscode.commands.registerCommand('promptvc.showPromptDiff', (promptChange: PromptChange, focusFile?: string) => {
        console.log('PromptVC: Showing prompt diff', promptChange.prompt.substring(0, 50));
        showPromptDiff(promptChange, focusFile);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.refreshSessions', () => {
        console.log('PromptVC: Refreshing sessions');
        promptSessionsProvider.refresh();
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.enableNotifySound', () => {
        console.log('PromptVC: Enabling session sound');
        setNotifySound(true);
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.disableNotifySound', () => {
        console.log('PromptVC: Disabling session sound');
        setNotifySound(false);
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

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.copyInstallCommand', () => {
        vscode.env.clipboard.writeText('npm install -g promptvc');
        vscode.window.showInformationMessage('Copied: npm install -g promptvc');
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.copyConfigCommand', () => {
        vscode.env.clipboard.writeText('promptvc config');
        vscode.window.showInformationMessage('Copied: promptvc config');
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.copyInitCommand', () => {
        vscode.env.clipboard.writeText('promptvc init');
        vscode.window.showInformationMessage('Copied: promptvc init');
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.openLocalWebViewer', async () => {
        console.log('PromptVC: Opening web viewer');
        await vscode.env.openExternal(vscode.Uri.parse(WEBVIEW_URL));
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('promptvc.downloadSessions', async () => {
        console.log('PromptVC: Downloading sessions');

        const sessionsFilePath = promptSessionsProvider['sessionsFilePath'];

        if (!sessionsFilePath || !fs.existsSync(sessionsFilePath)) {
          vscode.window.showErrorMessage('PromptVC: No sessions found. Initialize PromptVC first.');
          return;
        }

        try {
          // Read the sessions file
          const sessionsData = fs.readFileSync(sessionsFilePath, 'utf-8');

          // Prompt user for save location
          const defaultFilename = `promptvc-sessions-${new Date().toISOString().split('T')[0]}.json`;
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(path.join(require('os').homedir(), 'Downloads', defaultFilename)),
            filters: {
              'JSON Files': ['json'],
              'All Files': ['*']
            },
            saveLabel: 'Download Sessions'
          });

          if (uri) {
            // Write to the selected location
            fs.writeFileSync(uri.fsPath, sessionsData, 'utf-8');

            const action = await vscode.window.showInformationMessage(
              `Sessions downloaded to: ${path.basename(uri.fsPath)}`,
              'Open File',
              'Open Folder',
              'Open Web Viewer'
            );

            if (action === 'Open File') {
              await vscode.commands.executeCommand('vscode.open', uri);
            } else if (action === 'Open Folder') {
              await vscode.commands.executeCommand('revealFileInOS', uri);
            } else if (action === 'Open Web Viewer') {
              await vscode.env.openExternal(vscode.Uri.parse(WEBVIEW_URL));
            }
          }
        } catch (error) {
          console.error('PromptVC: Error downloading sessions:', error);
          vscode.window.showErrorMessage(`Failed to download sessions: ${error}`);
        }
      })
    );

    // Watch for workspace changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        console.log('PromptVC: Workspace folders changed');
        promptSessionsProvider.refresh();
        updateNotifySoundContext();
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
