import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { getCurrentBranch } from '../git/index';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';

async function runTrack(branch?: string, ticket?: string): Promise<void> {
  const projectId = await requireTrackedRepo();
  const branchName = branch ?? (await getCurrentBranch());
  const ticketId = ticket?.toUpperCase() ?? null;

  const tasks = await configManager.getTasks(projectId);
  const existing = tasks.tasks.find((t) => t.branchName === branchName);

  if (existing) {
    if (ticketId) {
      existing.ticketId = ticketId;
      existing.updatedAt = new Date().toISOString();
      await configManager.saveTasks(projectId, tasks);
      console.log(
        theme.success(`${symbols.success} Updated task for ${branchName} → ticket ${ticketId}`),
      );
    } else {
      console.log(theme.muted(`Branch ${branchName} is already tracked.`));
    }
    return;
  }

  const now = new Date().toISOString();
  tasks.tasks.push({
    id: `task_${Date.now()}`,
    branchName,
    ticketId,
    ticketTitle: null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    prNumber: null,
    prUrl: null,
    prStatus: null,
    worktreePath: null,
  });
  await configManager.saveTasks(projectId, tasks);
  console.log(theme.success(`${symbols.success} Now tracking ${branchName}`));
}

export function registerTrackCommand(program: Command): void {
  program
    .command('track [branch] [ticket]')
    .description('Track the current (or specified) branch as a task')
    .action(runTrack);
}
