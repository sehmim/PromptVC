/**
 * Represents changes made by a single prompt within an interactive session
 */
export interface PromptChange {
  prompt: string;
  response?: string;
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
