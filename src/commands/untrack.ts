import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { getCurrentBranch } from '../git/index';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';

async function runUntrack(branch?: string): Promise<void> {
  const projectId = await requireTrackedRepo();
  const branchName = branch ?? (await getCurrentBranch());

  const tasks = await configManager.getTasks(projectId);
  const before = tasks.tasks.length;
  tasks.tasks = tasks.tasks.filter((t) => t.branchName !== branchName);

  if (tasks.tasks.length === before) {
    console.log(theme.muted(`Branch ${branchName} is not tracked.`));
    return;
  }

  await configManager.saveTasks(projectId, tasks);
  console.log(theme.success(`${symbols.success} Untracked ${branchName}`));
}

export function registerUntrackCommand(program: Command): void {
  program
    .command('untrack [branch]')
    .description('Stop tracking the current (or specified) branch')
    .action(runUntrack);
}
