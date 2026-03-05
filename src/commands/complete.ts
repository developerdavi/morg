import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { getCurrentBranch, checkout, mergeBranch, deleteBranch, removeWorktree } from '../git/index';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';
import { confirm } from '../ui/prompts';

async function runComplete(
  branch: string | undefined,
  options: { yes?: boolean; noDelete?: boolean },
): Promise<void> {
  const projectId = await requireTrackedRepo();

  const targetBranch = branch ?? (await getCurrentBranch());
  const tasks = await configManager.getTasks(projectId);
  const task = tasks.tasks.find((t) => t.branchName === targetBranch);

  if (!task) {
    console.error(theme.error(`No tracked task found for branch "${targetBranch}".`));
    process.exit(1);
  }

  if (task.prStatus === 'open' || task.prStatus === 'needs_review' || task.prStatus === 'ready') {
    console.log(theme.warning(`  ${symbols.arrow} PR #${task.prNumber} is still open. Consider merging via GitHub first.`));
  }

  if (!options.yes) {
    const ok = await confirm({ message: `Complete "${targetBranch}" and merge into default branch?` });
    if (!ok) {
      console.log(theme.muted('Cancelled.'));
      return;
    }
  }

  const projectConfig = await configManager.getProjectConfig(projectId);
  const defaultBranch = projectConfig.defaultBranch;

  await withSpinner(`Switching to ${defaultBranch}...`, () => checkout(defaultBranch));
  await withSpinner(`Merging ${targetBranch}...`, () => mergeBranch(targetBranch));

  const now = new Date().toISOString();
  task.status = 'done';
  task.updatedAt = now;

  if (task.worktreePath) {
    await withSpinner(`Removing worktree...`, () => removeWorktree(task.worktreePath!));
    task.worktreePath = null;
  }

  if (!options.noDelete) {
    await withSpinner(`Deleting branch ${targetBranch}...`, () => deleteBranch(targetBranch));
  }

  await configManager.saveTasks(projectId, tasks);
  console.log(theme.success(`\n${symbols.success} Completed ${theme.primaryBold(targetBranch)}`));
}

export function registerCompleteCommand(program: Command): void {
  program
    .command('complete [branch]')
    .description('Merge a branch into the default branch and mark task as done')
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('--no-delete', 'Keep the branch after merging')
    .action(runComplete);
}
