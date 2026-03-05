import type { Command } from 'commander';
import { execa } from 'execa';
import { configManager } from '../config/manager';
import { getCurrentBranch, checkout, removeWorktree } from '../git/index';
import { requireTrackedRepo } from '../utils/detect';
import { findBranchCaseInsensitive } from '../utils/ticket';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';
import { confirm } from '../ui/prompts';

async function hasUnmergedCommits(branch: string, defaultBranch: string): Promise<boolean> {
  const result = await execa('git', ['log', `${defaultBranch}..${branch}`, '--oneline'], {
    reject: false,
  });
  return result.exitCode === 0 && result.stdout.trim().length > 0;
}

async function runDelete(branch: string | undefined, options: { force?: boolean }): Promise<void> {
  const projectId = await requireTrackedRepo();

  const currentBranch = await getCurrentBranch();

  const projectConfig = await configManager.getProjectConfig(projectId);
  const defaultBranch = projectConfig.defaultBranch;

  // Resolve target branch with case-insensitive lookup when a branch arg is provided
  let targetBranch: string;
  if (branch) {
    const branches = await configManager.getBranches(projectId);
    const found = findBranchCaseInsensitive(branches.branches, branch);
    targetBranch = found?.branchName ?? branch;
  } else {
    targetBranch = currentBranch;
  }

  if (targetBranch === defaultBranch) {
    console.error(theme.error(`Cannot delete the default branch "${defaultBranch}".`));
    process.exit(1);
  }

  const branches = await configManager.getBranches(projectId);
  const trackedBranch = findBranchCaseInsensitive(branches.branches, targetBranch);

  if (!options.force && (await hasUnmergedCommits(targetBranch, defaultBranch))) {
    console.error(theme.error(`Branch "${targetBranch}" has unmerged commits.`));
    console.error(theme.muted(`  Use --force / -f to delete anyway.`));
    process.exit(1);
  }

  const ok = await confirm({ message: `Delete branch "${targetBranch}"?` });
  if (!ok) {
    console.log(theme.muted('Cancelled.'));
    return;
  }

  // If currently on the target branch, switch away first
  if (currentBranch === targetBranch) {
    await withSpinner(`Switching to ${defaultBranch}...`, () => checkout(defaultBranch));
  }

  // Remove worktree if present
  if (trackedBranch?.worktreePath) {
    await withSpinner('Removing worktree...', () => removeWorktree(trackedBranch.worktreePath!));
  }

  // Delete the branch (-D to force if requested, -d otherwise)
  const deleteFlag = options.force ? '-D' : '-d';
  const result = await execa('git', ['branch', deleteFlag, targetBranch], { reject: false });
  if (result.exitCode !== 0) {
    console.error(theme.error(`Failed to delete branch: ${result.stderr}`));
    process.exit(1);
  }

  // Mark branch as abandoned
  if (trackedBranch) {
    trackedBranch.status = 'abandoned';
    trackedBranch.updatedAt = new Date().toISOString();
    if (trackedBranch.worktreePath) trackedBranch.worktreePath = null;
    await configManager.saveBranches(projectId, branches);
  }

  console.log(theme.success(`\n${symbols.success} Deleted ${theme.primaryBold(targetBranch)}`));
}

export function registerDeleteCommand(program: Command): void {
  program
    .command('delete [branch]')
    .description('Delete a tracked branch (only if fully merged; use -f to force)')
    .option('-f, --force', 'Delete even if the branch has unmerged commits')
    .action(runDelete);
}
