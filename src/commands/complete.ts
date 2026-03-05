import type { Command } from 'commander';
import { configManager } from '../config/manager';
import {
  getCurrentBranch,
  checkout,
  mergeBranch,
  deleteBranch,
  removeWorktree,
} from '../git/index';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';
import { confirm } from '../ui/prompts';
import { promptTicketDone } from '../utils/providers';

async function runComplete(
  branch: string | undefined,
  options: { yes?: boolean; noDelete?: boolean },
): Promise<void> {
  const projectId = await requireTrackedRepo();

  const targetBranch = branch ?? (await getCurrentBranch());
  const branches = await configManager.getBranches(projectId);
  const trackedBranch = branches.branches.find((b) => b.branchName === targetBranch);

  if (!trackedBranch) {
    console.error(theme.error(`No tracked branch found for "${targetBranch}".`));
    process.exit(1);
  }

  if (
    trackedBranch.prStatus === 'open' ||
    trackedBranch.prStatus === 'needs_review' ||
    trackedBranch.prStatus === 'ready'
  ) {
    console.log(
      theme.warning(
        `  ${symbols.arrow} PR #${trackedBranch.prNumber} is still open. Consider merging via GitHub first.`,
      ),
    );
  }

  if (!options.yes) {
    const ok = await confirm({
      message: `Complete "${targetBranch}" and merge into default branch?`,
    });
    if (!ok) {
      console.log(theme.muted('Cancelled.'));
      return;
    }
  }

  const projectConfig = await configManager.getProjectConfig(projectId);
  const defaultBranch = projectConfig.defaultBranch;

  await withSpinner(`Switching to ${defaultBranch}...`, () => checkout(defaultBranch));
  await withSpinner(`Merging ${targetBranch}...`, () => mergeBranch(targetBranch));

  if (trackedBranch.ticketId) {
    await promptTicketDone(projectId, trackedBranch.ticketId);
  }

  const now = new Date().toISOString();
  trackedBranch.status = 'done';
  trackedBranch.updatedAt = now;

  if (trackedBranch.worktreePath) {
    await withSpinner(`Removing worktree...`, () => removeWorktree(trackedBranch.worktreePath!));
    trackedBranch.worktreePath = null;
  }

  if (!options.noDelete) {
    await withSpinner(`Deleting branch ${targetBranch}...`, () => deleteBranch(targetBranch));
  }

  await configManager.saveBranches(projectId, branches);
  console.log(theme.success(`\n${symbols.success} Completed ${theme.primaryBold(targetBranch)}`));
}

export function registerCompleteCommand(program: Command): void {
  program
    .command('complete [branch]')
    .description('Merge a branch into the default branch and mark branch as done')
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('--no-delete', 'Keep the branch after merging')
    .action(runComplete);
}
