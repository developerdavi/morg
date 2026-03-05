import { execa } from 'execa';
import { GitError } from '../utils/errors';

export async function getRepoRoot(): Promise<string> {
  const result = await execa('git', ['rev-parse', '--show-toplevel'], { reject: false });
  if (result.exitCode !== 0) {
    throw new GitError('Not inside a git repository.', 'Run git init or cd into a repo.');
  }
  return result.stdout.trim();
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
    ? base ? ['checkout', '-b', branch, base] : ['checkout', '-b', branch]
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
    const result = await execa('git', ['log', `${ref}..HEAD`, '--no-merges', '--format=%s'], { reject: false });
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
