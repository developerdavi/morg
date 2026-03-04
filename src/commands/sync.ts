import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { ghClient, ghPrToPrStatus } from '../integrations/github/client';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';

async function runSync(): Promise<void> {
  const projectId = await requireTrackedRepo();
  const tasks = await configManager.getTasks(projectId);
  const openTasks = tasks.tasks.filter((t) => ['active', 'pr_open'].includes(t.status));

  if (openTasks.length === 0) {
    console.log(theme.muted('No active tasks to sync.'));
    return;
  }

  let updated = 0;
  for (const task of openTasks) {
    const pr = await withSpinner(`Checking ${task.branchName}...`, () =>
      ghClient.getPRForBranch(task.branchName),
    );
    if (!pr) continue;

    const prStatus = ghPrToPrStatus(pr);
    const taskStatus = pr.mergedAt ? 'pr_merged' as const : 'pr_open' as const;

    if (task.prStatus !== prStatus || task.status !== taskStatus) {
      task.prNumber = pr.number;
      task.prUrl = pr.url;
      task.prStatus = prStatus;
      task.status = taskStatus;
      task.updatedAt = new Date().toISOString();
      updated++;
      console.log(theme.success(`  ${symbols.success} ${task.branchName} → ${prStatus}`));
    }
  }

  if (updated > 0) {
    await configManager.saveTasks(projectId, tasks);
    console.log(theme.success(`\nSynced ${updated} task(s).`));
  } else {
    console.log(theme.muted('All tasks up to date.'));
  }
}

export function registerSyncCommand(program: Command): void {
  program.command('sync').description('Sync task statuses with GitHub PRs').action(runSync);
}
