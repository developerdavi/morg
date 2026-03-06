import type { Command } from 'commander';
import { existsSync } from 'fs';
import { configManager } from '../config/manager';
import { requireTrackedRepo } from '../utils/detect';
import { removeWorktree } from '../git/index';
import { theme, symbols } from '../ui/theme';

async function runWorktreeList(): Promise<void> {
  const projectId = await requireTrackedRepo();
  const branchesFile = await configManager.getBranches(projectId);
  const worktrees = branchesFile.branches.filter((b) => b.worktreePath);

  if (worktrees.length === 0) {
    console.log(theme.muted('No worktrees tracked by morg.'));
    return;
  }

  console.log('');
  for (const b of worktrees) {
    const exists = existsSync(b.worktreePath!);
    const statusLabel = exists ? theme.success('exists') : theme.error('missing');
    console.log(
      `  ${theme.primaryBold(b.branchName)}  ${theme.muted(`[${b.status}]`)}  ${statusLabel}`,
    );
    console.log(`    ${theme.muted(b.worktreePath!)}`);
  }
  console.log('');
}

async function runWorktreeClean(): Promise<void> {
  const projectId = await requireTrackedRepo();
  const branchesFile = await configManager.getBranches(projectId);

  let cleaned = 0;
  for (const branch of branchesFile.branches) {
    if (!branch.worktreePath) continue;

    const isDone = ['done', 'abandoned'].includes(branch.status);
    const noLongerExists = !existsSync(branch.worktreePath);

    if (!isDone && !noLongerExists) continue;

    if (isDone && existsSync(branch.worktreePath)) {
      try {
        await removeWorktree(branch.worktreePath);
      } catch {
        // Worktree may already be removed; clear the path anyway
      }
    }

    branch.worktreePath = null;
    branch.updatedAt = new Date().toISOString();
    cleaned++;
    console.log(
      theme.success(
        `  ${symbols.success} Cleaned worktree for ${theme.primary(branch.branchName)}`,
      ),
    );
  }

  await configManager.saveBranches(projectId, branchesFile);

  if (cleaned === 0) {
    console.log(theme.muted('No stale worktrees found.'));
  } else {
    console.log(theme.muted(`  Cleaned ${cleaned} worktree(s).`));
  }
}

export function registerWorktreeCommand(program: Command): void {
  const wt = program.command('worktree').description('Manage git worktrees tracked by morg');

  wt.command('list').description('List all worktrees tracked by morg').action(runWorktreeList);

  wt.command('clean')
    .description('Remove worktrees for done or abandoned branches')
    .action(runWorktreeClean);
}
