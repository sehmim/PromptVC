import { spawn } from 'child_process';
import * as path from 'path';
import { getRepoRoot, getBranch, getHeadHash, getDiff, getChangedFiles } from './git';
import { initDb, insertSession } from './store';

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
function extractPrompt(args: string[]): string {
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
  return 'interactive session';
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
  const prompt = extractPrompt(args);

  // Buffer to capture stdout
  let responseBuffer = '';

  // Spawn the real codex CLI
  const codexProcess = spawn('codex', args, {
    stdio: ['inherit', 'pipe', 'inherit'],
  });

  // Capture stdout
  codexProcess.stdout.on('data', (data) => {
    const chunk = data.toString();
    responseBuffer += chunk;
    // Also write to our stdout so user sees it
    process.stdout.write(chunk);
  });

  // Wait for the process to complete
  codexProcess.on('close', async (code) => {
    try {
      // Get post-execution git state
      const postHash = await getHeadHash();

      // Check if there were any changes
      const changedFiles = await getChangedFiles(preHash, 'HEAD');

      if (changedFiles.length === 0) {
        // No changes, don't log session
        process.exit(code ?? 0);
        return;
      }

      // Get the diff
      const diff = await getDiff(preHash, 'HEAD');

      // Prepare session data
      const sessionData = {
        provider: 'codex',
        repoRoot,
        branch,
        preHash,
        postHash: preHash !== postHash ? postHash : null,
        prompt: truncate(prompt, MAX_PROMPT_LENGTH),
        responseSnippet: truncate(responseBuffer.trim(), MAX_RESPONSE_LENGTH),
        files: changedFiles,
        diff,
        createdAt: new Date().toISOString(),
        mode: 'oneshot' as const,
        autoTagged: true,
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
