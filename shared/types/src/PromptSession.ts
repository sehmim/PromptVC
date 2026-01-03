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
  mode: 'oneshot' | 'interactive';
  autoTagged: boolean;
}
