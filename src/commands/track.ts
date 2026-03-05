import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { getCurrentBranch } from '../git/index';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';

async function runTrack(branch?: string, ticket?: string): Promise<void> {
  const projectId = await requireTrackedRepo();
  const branchName = branch ?? (await getCurrentBranch());
  const ticketId = ticket?.toUpperCase() ?? null;

  const branchesFile = await configManager.getBranches(projectId);
  const existing = branchesFile.branches.find((b) => b.branchName === branchName);

  if (existing) {
    if (ticketId) {
      existing.ticketId = ticketId;
      existing.updatedAt = new Date().toISOString();
      await configManager.saveBranches(projectId, branchesFile);
      console.log(
        theme.success(`${symbols.success} Updated branch ${branchName} → ticket ${ticketId}`),
      );
    } else {
      console.log(theme.muted(`Branch ${branchName} is already tracked.`));
    }
    return;
  }

  const now = new Date().toISOString();
  branchesFile.branches.push({
    id: `branch_${Date.now()}`,
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
  await configManager.saveBranches(projectId, branchesFile);
  console.log(theme.success(`${symbols.success} Now tracking ${branchName}`));
}

export function registerTrackCommand(program: Command): void {
  program
    .command('track [branch] [ticket]')
    .description('Track the current (or specified) branch')
    .action(runTrack);
}
