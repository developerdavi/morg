import type { Command } from 'commander';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { configManager } from '../config/manager';
import { getCurrentBranch, stashPop, checkout } from '../git/index';
import { isTicketId, findBranchCaseInsensitive } from '../utils/ticket';
import { handleDirtyTree } from '../utils/stash';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';
import { select } from '../ui/prompts';

async function pickBranch(projectId: string, currentBranch: string): Promise<string> {
  const branches = await configManager.getBranches(projectId);
  const choices = branches.branches
    .filter((b) => ['active', 'pr_open'].includes(b.status) && b.branchName !== currentBranch)
    .map((b) => ({
      value: b.branchName,
      label: b.branchName,
      hint: b.ticketId ? `${b.ticketId}${b.ticketTitle ? ` · ${b.ticketTitle}` : ''}` : undefined,
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
    const branches = await configManager.getBranches(projectId);
    const branch = branches.branches.find(
      (b) => b.ticketId?.toUpperCase() === ticketId && b.status === 'active',
    );
    if (!branch) {
      console.error(theme.error(`No active branch found for ticket ${ticketId}.`));
      console.error(theme.muted(`Use: morg start ${ticketId}`));
      process.exit(1);
    }
    branchName = branch.branchName;
  } else {
    // Case-insensitive branch name lookup
    const branches = await configManager.getBranches(projectId);
    const found = findBranchCaseInsensitive(branches.branches, input);
    branchName = found?.branchName ?? input;
  }

  // Check if branch has a worktree
  const branches = await configManager.getBranches(projectId);
  const branch = findBranchCaseInsensitive(branches.branches, branchName);

  if (branch?.worktreePath) {
    // Signal the shell-init wrapper to cd into the worktree directory.
    // The wrapper (installed via `eval "$(morg shell-init bash/zsh)"`) reads
    // this file after the process exits and runs `cd` in the parent shell.
    // Without the wrapper the fallback message below still guides the user.
    try {
      writeFileSync(join(tmpdir(), `morg_chdir_${process.ppid}`), branch.worktreePath);
    } catch {
      // Ignore — fallback message is shown regardless
    }

    // Update lastAccessedAt
    branch.lastAccessedAt = new Date().toISOString();
    await configManager.saveBranches(projectId, branches);
    console.log(
      theme.success(`\n${symbols.success} Worktree branch ${theme.primaryBold(branchName)}`),
    );
    console.log(theme.muted(`  cd ${branch.worktreePath}`));
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
  if (branch) {
    branch.lastAccessedAt = new Date().toISOString();
    await configManager.saveBranches(projectId, branches);
  }

  console.log(theme.success(`\n${symbols.success} On branch ${theme.primaryBold(branchName)}`));
}

export function registerSwitchCommand(program: Command): void {
  program
    .command('switch [branch-or-ticket]')
    .description('Switch to a branch (stashing if dirty)')
    .action(runSwitch);
}
