import { getRepoRoot, getBranch, getHeadHash, getDiff, getChangedFiles, isWorkingDirClean } from './git';
import { initDb, insertSession } from './store';

/**
 * Configuration for watch mode
 */
const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds
const MAX_DIFF_LENGTH = 100000; // Max diff size to log (100KB)

/**
 * State tracker for watch mode
 */
interface WatchState {
  repoRoot: string;
  branch: string;
  lastHash: string;
  hasUncommittedChanges: boolean;
  lastChangeDetectedAt: number | null;
}

/**
 * Initialize watch state
 */
async function initWatchState(): Promise<WatchState> {
  const repoRoot = await getRepoRoot();
  const branch = await getBranch();
  const lastHash = await getHeadHash();
  const isClean = await isWorkingDirClean();

  return {
    repoRoot,
    branch,
    lastHash,
    hasUncommittedChanges: !isClean,
    lastChangeDetectedAt: null,
  };
}

/**
 * Check for changes and log session if appropriate
 */
async function checkForChanges(state: WatchState): Promise<void> {
  try {
    const currentHash = await getHeadHash();
    const isClean = await isWorkingDirClean();
    const hasUncommittedChanges = !isClean;

    // Detect new uncommitted changes
    if (hasUncommittedChanges && !state.hasUncommittedChanges) {
      // New changes appeared
      state.hasUncommittedChanges = true;
      state.lastChangeDetectedAt = Date.now();
      console.log('[PromptVC Watch] Detected new uncommitted changes...');
    }

    // Detect commit (changes disappeared)
    if (!hasUncommittedChanges && state.hasUncommittedChanges) {
      // Changes were committed
      state.hasUncommittedChanges = false;

      // Check if there's a new commit
      if (currentHash !== state.lastHash) {
        console.log('[PromptVC Watch] Changes committed, logging session...');

        try {
          // Get the diff between old and new commit
          const diff = await getDiff(state.lastHash, currentHash);

          // Check diff size
          if (diff.length > MAX_DIFF_LENGTH) {
            console.log(`[PromptVC Watch] Warning: Diff too large (${diff.length} bytes), truncating...`);
          }

          // Get changed files
          const changedFiles = await getChangedFiles(state.lastHash, currentHash);

          // Create session
          const sessionData = {
            provider: 'interactive',
            repoRoot: state.repoRoot,
            branch: state.branch,
            preHash: state.lastHash,
            postHash: currentHash,
            prompt: 'interactive session',
            responseSnippet: `Committed ${changedFiles.length} file(s)`,
            files: changedFiles,
            diff: diff.length > MAX_DIFF_LENGTH ? diff.substring(0, MAX_DIFF_LENGTH) + '\n... [truncated]' : diff,
            createdAt: new Date().toISOString(),
            mode: 'interactive' as const,
            autoTagged: true,
          };

          initDb(state.repoRoot);
          const sessionId = insertSession(sessionData);
          console.log(`[PromptVC Watch] Session logged: ${sessionId}`);

          // Update state
          state.lastHash = currentHash;
        } catch (error) {
          console.error('[PromptVC Watch] Error logging session:', error);
        }
      }

      state.lastChangeDetectedAt = null;
    }

    // Check for branch changes
    const currentBranch = await getBranch();
    if (currentBranch !== state.branch) {
      console.log(`[PromptVC Watch] Branch changed: ${state.branch} -> ${currentBranch}`);
      state.branch = currentBranch;
    }
  } catch (error) {
    console.error('[PromptVC Watch] Error checking for changes:', error);
  }
}

/**
 * Start watch mode
 */
export async function startWatch(): Promise<void> {
  console.log('[PromptVC Watch] Starting watch mode...');
  console.log('[PromptVC Watch] Monitoring for git changes every 5 seconds');
  console.log('[PromptVC Watch] Press Ctrl+C to stop\n');

  try {
    const state = await initWatchState();
    console.log(`[PromptVC Watch] Repository: ${state.repoRoot}`);
    console.log(`[PromptVC Watch] Branch: ${state.branch}`);
    console.log(`[PromptVC Watch] Current commit: ${state.lastHash.substring(0, 7)}\n`);

    // Poll for changes
    const intervalId = setInterval(async () => {
      await checkForChanges(state);
    }, POLL_INTERVAL_MS);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n[PromptVC Watch] Stopping watch mode...');
      clearInterval(intervalId);
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n[PromptVC Watch] Stopping watch mode...');
      clearInterval(intervalId);
      process.exit(0);
    });

    // Keep the process alive
    await new Promise(() => {});
  } catch (error) {
    console.error('[PromptVC Watch] Failed to start watch mode:', error);
    process.exit(1);
  }
}
