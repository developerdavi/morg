import { execa } from 'execa';
import * as clack from '@clack/prompts';
import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { getCurrentBranch, checkout, removeWorktree } from '../git/index';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';

/**
 * Returns true if the branch has no unmerged commits relative to defaultBranch
 * (i.e., all commits on branch are already in defaultBranch).
 */
async function isFullyMerged(branch: string, defaultBranch: string): Promise<boolean> {
  const result = await execa('git', ['log', `${defaultBranch}..${branch}`, '--oneline'], {
    reject: false,
  });
  if (result.exitCode !== 0) return false;
  return result.stdout.trim().length === 0;
}

async function runClean(): Promise<void> {
  const projectId = await requireTrackedRepo();
  const projectConfig = await configManager.getProjectConfig(projectId);
  const { defaultBranch } = projectConfig;

  const branchesFile = await configManager.getBranches(projectId);
  const currentBranch = await getCurrentBranch();

  // Only consider active/pr_open/pr_merged tracked branches (skip done/abandoned)
  const candidateBranches = branchesFile.branches.filter(
    (b) =>
      ['active', 'pr_open', 'pr_merged'].includes(b.status) &&
      b.branchName !== defaultBranch &&
      b.branchName !== currentBranch,
  );

  if (candidateBranches.length === 0) {
    console.log(
      theme.muted('No tracked branches to check (excluding current and default branch).'),
    );
    return;
  }

  // Check which branches are fully merged into the default branch
  const mergedBranches: typeof candidateBranches = [];
  for (const branch of candidateBranches) {
    const merged = await isFullyMerged(branch.branchName, defaultBranch);
    if (merged) {
      mergedBranches.push(branch);
    }
  }

  if (mergedBranches.length === 0) {
    console.log(
      theme.muted(
        `No fully-merged branches found. All tracked branches have unmerged commits relative to ${defaultBranch}.`,
      ),
    );
    return;
  }

  // Show the merged branches and let the user select which to delete
  console.log(
    theme.muted(
      `\nFound ${mergedBranches.length} fully-merged branch(es) (relative to ${theme.primary(defaultBranch)}):\n`,
    ),
  );

  const options = mergedBranches.map((b) => ({
    value: b.branchName,
    label: b.branchName,
    hint: b.ticketId ? `ticket: ${b.ticketId}` : 'no linked ticket',
  }));

  const selected = await clack.multiselect<string>({
    message: 'Select branches to delete:',
    options,
    required: false,
  });

  if (clack.isCancel(selected)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }

  const toDelete = selected as string[];

  if (toDelete.length === 0) {
    console.log(theme.muted('No branches selected. Nothing to do.'));
    return;
  }

  let deleted = 0;
  let failed = 0;

  for (const branchName of toDelete) {
    const trackedBranch = branchesFile.branches.find((b) => b.branchName === branchName);

    // Remove worktree if one is attached
    if (trackedBranch?.worktreePath) {
      await removeWorktree(trackedBranch.worktreePath).catch(() => {
        console.log(
          theme.warning(
            `  ${symbols.warning} Could not remove worktree for ${branchName} — continuing`,
          ),
        );
      });
    }

    let deleteResult = await execa('git', ['branch', '-d', branchName], { reject: false });

    if (deleteResult.exitCode !== 0) {
      // May be on the branch — switch away first then retry
      const cur = await getCurrentBranch();
      if (cur === branchName) {
        await checkout(defaultBranch);
        deleteResult = await execa('git', ['branch', '-d', branchName], { reject: false });
      }
    }

    if (deleteResult.exitCode !== 0) {
      console.log(
        theme.error(`  ${symbols.error} Failed to delete ${branchName}: ${deleteResult.stderr}`),
      );
      failed++;
      continue;
    }

    // Mark as done in tracked state
    if (trackedBranch) {
      trackedBranch.status = 'done';
      trackedBranch.updatedAt = new Date().toISOString();
      if (trackedBranch.worktreePath) trackedBranch.worktreePath = null;
    }

    console.log(theme.success(`  ${symbols.success} Deleted ${theme.primaryBold(branchName)}`));
    deleted++;
  }

  await configManager.saveBranches(projectId, branchesFile);

  console.log('');
  if (deleted > 0) {
    console.log(theme.success(`${symbols.success} Deleted ${deleted} branch(es).`));
  }
  if (failed > 0) {
    console.log(theme.warning(`${symbols.warning} Failed to delete ${failed} branch(es).`));
  }
}

export function registerCleanCommand(program: Command): void {
  program
    .command('clean')
    .description('Bulk-delete fully-merged tracked branches (local only, no external providers)')
    .action(runClean);
}
