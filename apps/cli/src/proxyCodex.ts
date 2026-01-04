import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getRepoRoot, getBranch, getHeadHash, getDiff, getChangedFiles, getUncommittedFiles, getUncommittedDiff } from './git';
import { initDb, insertSession } from './store';
import { PromptChange } from '@promptvc/types';

/**
 * Maximum length for prompt and response snippets
 */
const MAX_PROMPT_LENGTH = 5000;
const MAX_RESPONSE_LENGTH = 5000;

/**
 * Truncate a string to a maximum length
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength) + '... [truncated]';
}

/**
 * Extract prompt from command line arguments
 * Looks for the first non-flag argument
 */
function extractPrompt(args: string[]): string | null {
  for (const arg of args) {
    // Skip flags and their values
    if (arg.startsWith('-')) {
      continue;
    }
    // This is likely the prompt
    if (arg.length > 0) {
      return arg;
    }
  }
  return null; // Will be filled in later from output or files
}

/**
 * Generate a smart prompt description from files changed
 */
function generatePromptFromFiles(files: string[]): string {
  if (files.length === 0) {
    return 'interactive session';
  }

  const fileNames = files.map(f => {
    const parts = f.split('/');
    return parts[parts.length - 1];
  }).join(', ');

  return `Modified ${files.length} file${files.length > 1 ? 's' : ''}: ${fileNames}`;
}

/**
 * Check if a prompt is a system prompt that should be filtered out
 */
function isSystemPrompt(prompt: string): boolean {
  const systemPatterns = [
    '# AGENTS.md',
    '<INSTRUCTIONS>',
    '<environment_context>',
    '## Skills',
    'These skills are discovered at startup',
    'skill-creator:',
    'skill-installer:',
  ];

  // Check if prompt starts with or contains system patterns
  for (const pattern of systemPatterns) {
    if (prompt.startsWith(pattern) || prompt.includes(pattern)) {
      return true;
    }
  }

  return false;
}

/**
 * Read prompts from the latest codex session file
 */
function readCodexSessionPrompts(): string[] {
  try {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) return [];

    const sessionsDir = path.join(homeDir, '.codex', 'sessions');
    if (!fs.existsSync(sessionsDir)) return [];

    // Find all rollout-*.jsonl files recursively
    const findCommand = `find "${sessionsDir}" -name "rollout-*.jsonl" -type f -print0 | xargs -0 ls -t | head -1`;
    const { execSync } = require('child_process');

    const latestSessionFile = execSync(findCommand, { encoding: 'utf-8' }).trim();
    if (!latestSessionFile || !fs.existsSync(latestSessionFile)) return [];

    // Read and parse the session file
    const sessionContent = fs.readFileSync(latestSessionFile, 'utf-8');
    const lines = sessionContent.split('\n').filter(line => line.trim());

    const prompts: string[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        // Extract user messages
        if (entry.type === 'response_item' &&
            entry.payload?.role === 'user' &&
            entry.payload?.content?.[0]?.text) {
          const promptText = entry.payload.content[0].text;

          // Filter out system prompts
          if (!isSystemPrompt(promptText)) {
            prompts.push(promptText);
          }
        }
      } catch (e) {
        // Skip invalid JSON lines
        continue;
      }
    }

    return prompts;
  } catch (error) {
    console.error('[PromptVC] Warning: Failed to read codex session:', error);
    return [];
  }
}

/**
 * Main function to proxy the Codex CLI
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let repoRoot: string;
  let branch: string;
  let preHash: string;

  // Get initial git state
  try {
    repoRoot = await getRepoRoot();
    branch = await getBranch();
    preHash = await getHeadHash();
  } catch (error) {
    console.error('Error: Not in a git repository or git command failed');
    console.error(error);
    process.exit(1);
  }

  // Extract prompt from args
  let promptFromArgs = extractPrompt(args);

  // Spawn the real codex CLI with inherited stdio
  // This allows codex to detect it's running in a terminal
  // Note: We can't capture output without breaking TTY detection
  const codexProcess = spawn('codex', args, {
    stdio: 'inherit',
  });

  // Wait for the process to complete
  codexProcess.on('close', async (code) => {
    try {
      // Get post-execution git state
      const postHash = await getHeadHash();

      // Check for uncommitted changes first
      let changedFiles = await getUncommittedFiles();
      let diff = '';

      if (changedFiles.length > 0) {
        // Uncommitted changes exist
        diff = await getUncommittedDiff();
      } else {
        // Check for committed changes
        changedFiles = await getChangedFiles(preHash, 'HEAD');
        if (changedFiles.length === 0) {
          // No changes at all, don't log session
          process.exit(code ?? 0);
          return;
        }
        // Get the diff for committed changes
        diff = await getDiff(preHash, 'HEAD');
      }

      // Try to read prompts from notify hook first (faster, real-time)
      let capturedPrompts: string[] = [];
      let perPromptChanges: PromptChange[] | undefined;

      if (!promptFromArgs) {
        const sessionFile = path.join(repoRoot, '.promptvc', 'current_session.json');

        if (fs.existsSync(sessionFile)) {
          try {
            const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
            if (Array.isArray(sessionData)) {
              // Check if it's the new format (array of PromptChange objects)
              if (sessionData.length > 0 && typeof sessionData[0] === 'object' && 'prompt' in sessionData[0]) {
                // New format: array of PromptChange objects
                perPromptChanges = sessionData as PromptChange[];
                capturedPrompts = perPromptChanges.map(pc => pc.prompt);
              } else {
                // Old format: array of strings
                capturedPrompts = sessionData as string[];
              }
            }
            // Clean up the session file
            fs.unlinkSync(sessionFile);
            // Also clean up the prompt count file
            const lastPromptFile = path.join(repoRoot, '.promptvc', 'last_prompt_count');
            if (fs.existsSync(lastPromptFile)) {
              fs.unlinkSync(lastPromptFile);
            }
          } catch (error) {
            console.error('[PromptVC] Warning: Failed to read session file:', error);
          }
        }

        // Fallback: read directly from codex session files if notify hook didn't run
        if (capturedPrompts.length === 0) {
          capturedPrompts = readCodexSessionPrompts();
        }
      }

      // Determine the final prompt to use
      let finalPrompt: string;
      let responseSnippet: string;

      if (promptFromArgs) {
        // Use the command-line argument (one-shot mode)
        finalPrompt = promptFromArgs;
        responseSnippet = `Modified ${changedFiles.length} file(s)`;
      } else if (capturedPrompts.length > 0) {
        // Use captured prompts from notification hook (interactive mode)
        finalPrompt = capturedPrompts.join(' → ');
        responseSnippet = `Interactive session: ${capturedPrompts.length} prompt${capturedPrompts.length > 1 ? 's' : ''}`;
      } else {
        // Fallback: generate from files
        finalPrompt = generatePromptFromFiles(changedFiles);
        responseSnippet = `Modified ${changedFiles.length} file(s)`;
      }

      // Determine mode
      const mode: 'oneshot' | 'interactive' = promptFromArgs ? 'oneshot' : 'interactive';

      // Prepare session data
      const sessionData = {
        provider: 'codex',
        repoRoot,
        branch,
        preHash,
        postHash: preHash !== postHash ? postHash : null,
        prompt: truncate(finalPrompt, MAX_PROMPT_LENGTH),
        responseSnippet,
        files: changedFiles,
        diff,
        createdAt: new Date().toISOString(),
        mode,
        autoTagged: true,
        perPromptChanges, // Include per-prompt changes if available
      };

      // Initialize DB and insert session
      initDb(repoRoot);
      const sessionId = insertSession(sessionData);

      // Log success (optional - you can make this configurable)
      console.error(`\n[PromptVC] Session logged: ${sessionId}`);

      process.exit(code ?? 0);
    } catch (error) {
      // Don't fail the original command due to logging errors
      console.error('[PromptVC] Warning: Failed to log session:', error);
      process.exit(code ?? 0);
    }
  });

  // Handle errors in spawning
  codexProcess.on('error', (error) => {
    console.error('Error: Failed to execute codex CLI');
    console.error('Make sure "codex" is installed and available in your PATH');
    console.error(error);
    process.exit(1);
  });
}
