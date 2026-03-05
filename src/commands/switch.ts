import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { getCurrentBranch, stashPop, checkout } from '../git/index';
import { isTicketId } from '../utils/ticket';
import { handleDirtyTree } from '../utils/stash';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';
import { select } from '../ui/prompts';

async function pickBranch(projectId: string, currentBranch: string): Promise<string> {
  const tasks = await configManager.getTasks(projectId);
  const choices = tasks.tasks
    .filter((t) => ['active', 'pr_open'].includes(t.status) && t.branchName !== currentBranch)
    .map((t) => ({
      value: t.branchName,
      label: t.branchName,
      hint: t.ticketId ? `${t.ticketId}${t.ticketTitle ? ` · ${t.ticketTitle}` : ''}` : undefined,
    }));

  if (choices.length === 0) {
    console.log(theme.muted('No other tracked branches to switch to.'));
    process.exit(0);
  }

  return select({ message: 'Switch to', options: choices });
}

async function runSwitch(input?: string): Promise<void> {
  const projectId = await requireTrackedRepo();

  let branchName: string;

  if (!input) {
    const current = await getCurrentBranch();
    branchName = await pickBranch(projectId, current);
  } else if (isTicketId(input)) {
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

  // Check if task has a worktree
  const tasks = await configManager.getTasks(projectId);
  const task = tasks.tasks.find((t) => t.branchName === branchName);

  if (task?.worktreePath) {
    // Update lastAccessedAt
    task.lastAccessedAt = new Date().toISOString();
    await configManager.saveTasks(projectId, tasks);
    console.log(
      theme.success(`\n${symbols.success} Worktree branch ${theme.primaryBold(branchName)}`),
    );
    console.log(theme.muted(`  cd ${task.worktreePath}`));
    return;
  }

  const currentForStash = await getCurrentBranch();
  const stashed = await handleDirtyTree(currentForStash, branchName);

  await withSpinner(`Switching to ${branchName}...`, () => checkout(branchName));

  if (stashed) {
    await stashPop().catch(() => {
      // Nothing to pop on this branch — ignore
    });
  }

  // Update lastAccessedAt
  if (task) {
    task.lastAccessedAt = new Date().toISOString();
    await configManager.saveTasks(projectId, tasks);
  }

  console.log(theme.success(`\n${symbols.success} On branch ${theme.primaryBold(branchName)}`));
}

export function registerSwitchCommand(program: Command): void {
  program
    .command('switch [branch-or-ticket]')
    .description('Switch to a branch (stashing if dirty)')
    .action(runSwitch);
}
