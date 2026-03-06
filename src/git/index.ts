import path from 'path';
import { execa } from 'execa';
import { GitError } from '../utils/errors';

export async function getRepoRoot(): Promise<string> {
  const result = await execa('git', ['rev-parse', '--show-toplevel'], { reject: false });
  if (result.exitCode !== 0) {
    throw new GitError('Not inside a git repository.', 'Run git init or cd into a repo.');
  }
  return result.stdout.trim();
}

/**
 * Returns the main worktree root, even when called from a linked worktree.
 * Uses `git rev-parse --git-common-dir` to find the shared git directory,
 * then resolves the main repo root from it.
 */
export async function getMainWorktreeRoot(): Promise<string> {
  const commonDirResult = await execa('git', ['rev-parse', '--git-common-dir'], { reject: false });
  if (commonDirResult.exitCode !== 0) {
    throw new GitError('Not inside a git repository.', 'Run git init or cd into a repo.');
  }
  const commonDir = commonDirResult.stdout.trim();
  // If absolute, we're in a linked worktree — the main root is the parent of the .git dir
  if (path.isAbsolute(commonDir)) {
    return path.dirname(commonDir);
  }
  // Otherwise we're in the main worktree — use --show-toplevel
  return getRepoRoot();
}

export async function getCurrentBranch(): Promise<string> {
  const result = await execa('git', ['branch', '--show-current'], { reject: false });
  if (result.exitCode !== 0) {
    throw new GitError('Could not determine current branch.');
  }
  return result.stdout.trim();
}

export async function isWorkingTreeDirty(): Promise<boolean> {
  const result = await execa('git', ['status', '--porcelain'], { reject: false });
  return result.stdout.trim().length > 0;
}

export async function stash(message?: string): Promise<void> {
  const args = ['stash', 'push'];
  if (message) args.push('-m', message);
  const result = await execa('git', args, { reject: false });
  if (result.exitCode !== 0) throw new GitError(`Stash failed: ${result.stderr}`);
}

export async function stashPop(): Promise<void> {
  const result = await execa('git', ['stash', 'pop'], { reject: false });
  if (result.exitCode !== 0) throw new GitError(`Stash pop failed: ${result.stderr}`);
}

export async function checkout(branch: string, create = false, base?: string): Promise<void> {
  const args = create
    ? base
      ? ['checkout', '-b', branch, base]
      : ['checkout', '-b', branch]
    : ['checkout', branch];
  const result = await execa('git', args, { reject: false });
  if (result.exitCode !== 0) throw new GitError(`Checkout failed: ${result.stderr}`);
}

export async function getDiff(base?: string): Promise<string> {
  const args = base ? ['diff', base] : ['diff', 'HEAD'];
  const result = await execa('git', args, { reject: false });
  return result.stdout;
}

export async function getDiffWithBase(baseBranch: string): Promise<string> {
  const result = await execa('git', ['diff', `${baseBranch}...HEAD`], { reject: false });
  return result.stdout;
}

export async function getRecentCommits(n = 10): Promise<string[]> {
  const result = await execa('git', ['log', '--oneline', `-${n}`], { reject: false });
  if (result.exitCode !== 0) return [];
  return result.stdout.split('\n').filter(Boolean);
}

/** Returns commit subject lines for commits on HEAD that are not in baseBranch. */
export async function getCommitsOnBranch(baseBranch: string): Promise<string[]> {
  // Prefer the remote-tracking ref to avoid failures when a local branch doesn't exist
  for (const ref of [`origin/${baseBranch}`, baseBranch]) {
    const result = await execa('git', ['log', `${ref}..HEAD`, '--no-merges', '--format=%s'], {
      reject: false,
    });
    if (result.exitCode === 0) {
      return result.stdout.split('\n').filter(Boolean);
    }
  }
  return [];
}

export async function getRemote(): Promise<string | null> {
  const result = await execa('git', ['remote', 'get-url', 'origin'], { reject: false });
  if (result.exitCode !== 0) return null;
  return result.stdout.trim();
}

export async function getDefaultBranch(): Promise<string> {
  const result = await execa('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
    reject: false,
  });
  if (result.exitCode === 0) {
    return result.stdout.trim().replace('refs/remotes/origin/', '');
  }
  const mainResult = await execa('git', ['rev-parse', '--verify', 'main'], { reject: false });
  return mainResult.exitCode === 0 ? 'main' : 'master';
}

export async function pushBranch(branch: string): Promise<void> {
  const result = await execa('git', ['push', '-u', 'origin', branch], { reject: false });
  if (result.exitCode !== 0) throw new GitError(`git push failed: ${result.stderr}`);
}

export async function branchExists(branch: string): Promise<boolean> {
  const result = await execa('git', ['rev-parse', '--verify', branch], { reject: false });
  return result.exitCode === 0;
}

export async function addWorktree(
  worktreePath: string,
  branch: string,
  base?: string,
): Promise<void> {
  const args = base
    ? ['worktree', 'add', worktreePath, '-b', branch, base]
    : ['worktree', 'add', worktreePath, branch];
  const result = await execa('git', args, { reject: false });
  if (result.exitCode !== 0) throw new GitError(`git worktree add failed: ${result.stderr}`);
}

export async function removeWorktree(worktreePath: string): Promise<void> {
  const result = await execa('git', ['worktree', 'remove', '--force', worktreePath], {
    reject: false,
  });
  if (result.exitCode !== 0) throw new GitError(`git worktree remove failed: ${result.stderr}`);
}

export async function mergeBranch(branch: string, noFF = true): Promise<void> {
  const args = noFF ? ['merge', '--no-ff', branch] : ['merge', branch];
  const result = await execa('git', args, { reject: false });
  if (result.exitCode !== 0) throw new GitError(`git merge failed: ${result.stderr}`);
}

export async function deleteBranch(branch: string): Promise<void> {
  const result = await execa('git', ['branch', '-d', branch], { reject: false });
  if (result.exitCode !== 0) throw new GitError(`git branch -d failed: ${result.stderr}`);
}

export async function pullBranch(branch: string): Promise<void> {
  const result = await execa('git', ['pull', 'origin', branch], { reject: false });
  if (result.exitCode !== 0) throw new GitError(`git pull failed: ${result.stderr}`);
}

/**
 * Fast-forward a local branch from origin without checking it out.
 * Only works when NOT currently on that branch.
 * Returns true on success, false if the branch can't be fast-forwarded or has no remote.
 */
export async function fetchAndUpdateBranch(branch: string): Promise<boolean> {
  const result = await execa('git', ['fetch', 'origin', `${branch}:${branch}`], { reject: false });
  return result.exitCode === 0;
}

export async function rebaseBranch(onto: string): Promise<void> {
  const result = await execa('git', ['rebase', onto], { reject: false });
  if (result.exitCode !== 0) throw new GitError(`git rebase failed: ${result.stderr}`);
}
