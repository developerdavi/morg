import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { getCurrentBranch } from '../git/index';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';

async function runUntrack(branch?: string): Promise<void> {
  const projectId = await requireTrackedRepo();
  const branchName = branch ?? (await getCurrentBranch());

  const branchesFile = await configManager.getBranches(projectId);
  const before = branchesFile.branches.length;
  branchesFile.branches = branchesFile.branches.filter((b) => b.branchName !== branchName);

  if (branchesFile.branches.length === before) {
    console.log(theme.muted(`Branch ${branchName} is not tracked.`));
    return;
  }

  await configManager.saveBranches(projectId, branchesFile);
  console.log(theme.success(`${symbols.success} Untracked ${branchName}`));
}

export function registerUntrackCommand(program: Command): void {
  program
    .command('untrack [branch]')
    .description('Stop tracking the current (or specified) branch')
    .action(runUntrack);
}
