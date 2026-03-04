import type { Command } from 'commander';
import { configManager } from '../config/manager';
import {
  getCurrentBranch,
  isWorkingTreeDirty,
  stash,
  stashPop,
  checkout,
} from '../git/index';
import { isTicketId } from '../utils/ticket';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';

async function runSwitch(input: string): Promise<void> {
  const projectId = await requireTrackedRepo();

  let branchName: string;

  if (isTicketId(input)) {
    const ticketId = input.trim().toUpperCase();
    const tasks = await configManager.getTasks(projectId);
    const task = tasks.tasks.find((t) => t.ticketId === ticketId && t.status === 'active');
    if (!task) {
      console.error(theme.error(`No active task found for ticket ${ticketId}.`));
      console.error(theme.muted(`Use: morg start ${ticketId}`));
      process.exit(1);
    }
    branchName = task.branchName;
  } else {
    branchName = input;
  }

  const dirty = await isWorkingTreeDirty();
  if (dirty) {
    const current = await getCurrentBranch();
    await withSpinner(`Stashing changes on ${current}...`, () =>
      stash(`morg: stash before switching to ${branchName}`),
    );
  }

  await withSpinner(`Switching to ${branchName}...`, () => checkout(branchName));

  if (dirty) {
    await stashPop().catch(() => {
      // Nothing to pop on this branch — ignore
    });
  }

  console.log(theme.success(`\n${symbols.success} On branch ${theme.primaryBold(branchName)}`));
}

export function registerSwitchCommand(program: Command): void {
  program
    .command('switch <branch-or-ticket>')
    .description('Switch to a branch (stashing if dirty)')
    .action(runSwitch);
}
