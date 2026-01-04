import simpleGit, { SimpleGit } from 'simple-git';
import * as path from 'path';

/**
 * Get the root directory of the git repository
 */
export async function getRepoRoot(cwd: string = process.cwd()): Promise<string> {
  const git: SimpleGit = simpleGit(cwd);
  try {
    const root = await git.revparse(['--show-toplevel']);
    return root.trim();
  } catch (error) {
    throw new Error(`Not a git repository (or any parent): ${cwd}`);
  }
}

/**
 * Get the current branch name
 */
export async function getBranch(cwd: string = process.cwd()): Promise<string> {
  const git: SimpleGit = simpleGit(cwd);
  try {
    const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
    return branch.trim();
  } catch (error) {
    throw new Error('Failed to get current branch');
  }
}

/**
 * Get the current HEAD commit hash
 */
export async function getHeadHash(cwd: string = process.cwd()): Promise<string> {
  const git: SimpleGit = simpleGit(cwd);
  try {
    const hash = await git.revparse(['HEAD']);
    return hash.trim();
  } catch (error) {
    throw new Error('Failed to get HEAD hash');
  }
}

/**
 * Get the diff between two commits (or from a commit to working tree)
 * @param from - Starting commit hash (default: HEAD)
 * @param to - Ending commit hash (default: working tree)
 * @param cwd - Working directory
 */
export async function getDiff(
  from: string = 'HEAD',
  to?: string,
  cwd: string = process.cwd()
): Promise<string> {
  const git: SimpleGit = simpleGit(cwd);
  try {
    const args = [from];
    if (to) {
      args.push(to);
    }
    const diff = await git.diff(args);
    return diff;
  } catch (error) {
    throw new Error(`Failed to get diff: ${error}`);
  }
}

/**
 * Get list of files that changed between two commits
 * @param from - Starting commit hash (default: HEAD)
 * @param to - Ending commit hash (default: working tree)
 * @param cwd - Working directory
 */
export async function getChangedFiles(
  from: string = 'HEAD',
  to?: string,
  cwd: string = process.cwd()
): Promise<string[]> {
  const git: SimpleGit = simpleGit(cwd);
  try {
    const args = ['--name-only', from];
    if (to) {
      args.push(to);
    }
    const diff = await git.diff(args);
    const files = diff
      .split('\n')
      .map(f => f.trim())
      .filter(f => f.length > 0);
    return files;
  } catch (error) {
    throw new Error(`Failed to get changed files: ${error}`);
  }
}

/**
 * Check if the working directory is clean (no uncommitted changes)
 */
export async function isWorkingDirClean(cwd: string = process.cwd()): Promise<boolean> {
  const git: SimpleGit = simpleGit(cwd);
  try {
    const status = await git.status();
    return status.isClean();
  } catch (error) {
    throw new Error(`Failed to check working directory status: ${error}`);
  }
}

/**
 * Get list of files with uncommitted changes (modified, added, deleted)
 */
export async function getUncommittedFiles(cwd: string = process.cwd()): Promise<string[]> {
  const git: SimpleGit = simpleGit(cwd);
  try {
    const status = await git.status();
    const files = [
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.renamed.map(r => r.to),
    ];
    return files;
  } catch (error) {
    throw new Error(`Failed to get uncommitted files: ${error}`);
  }
}

/**
 * Get diff of uncommitted changes
 */
export async function getUncommittedDiff(cwd: string = process.cwd()): Promise<string> {
  const git: SimpleGit = simpleGit(cwd);
  try {
    const diff = await git.diff();
    return diff;
  } catch (error) {
    throw new Error(`Failed to get uncommitted diff: ${error}`);
  }
}

/**
 * Get short commit hash (7 characters)
 */
export async function getShortHash(hash: string, cwd: string = process.cwd()): Promise<string> {
  const git: SimpleGit = simpleGit(cwd);
  try {
    const shortHash = await git.revparse(['--short', hash]);
    return shortHash.trim();
  } catch (error) {
    return hash.substring(0, 7);
  }
}
