/**
 * Represents changes made by a single prompt within an interactive session
 */
export interface PromptChange {
  prompt: string;
  timestamp: string;
  hash: string;
  files: string[];
  diff: string;
}

export interface PromptSession {
  id: string;
  provider: 'codex' | 'claude' | 'gemini' | string;
  repoRoot: string;
  branch: string;
  preHash: string;
  postHash: string | null;
  prompt: string;
  responseSnippet: string;
  files: string[];
  diff: string;
  createdAt: string; // ISO timestamp
  updatedAt?: string; // ISO timestamp
  endedAt?: string; // ISO timestamp
  mode: 'oneshot' | 'interactive';
  autoTagged: boolean;
  hidden?: boolean;
  flagged?: boolean;
  tags?: string[];
  inProgress?: boolean;

  /**
   * Per-prompt changes captured during interactive sessions
   * Only populated for interactive mode when notify hook is enabled
   */
  perPromptChanges?: PromptChange[];
}

export interface FileDiff {
  fileName: string;
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
}

export interface DiffHunk {
  header: string;  // e.g., "@@ -1,5 +1,6 @@"
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'addition' | 'deletion' | 'context' | 'header';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}
