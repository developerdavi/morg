import { execa } from 'execa';
import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { ghClient, ghPrToPrStatus } from '../integrations/github/client';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';
import { confirm, select } from '../ui/prompts';
import {
  getCurrentBranch,
  checkout,
  pullBranch,
  rebaseBranch,
  mergeBranch,
  deleteBranch,
} from '../git/index';

async function hasDiverged(branch: string, defaultBranch: string): Promise<boolean> {
  // Count commits in defaultBranch that are not yet in branch
  const result = await execa(
    'git',
    ['log', `${branch}..${defaultBranch}`, '--oneline'],
    { reject: false },
  );
  if (result.exitCode !== 0) return false;
  return result.stdout.trim().length > 0;
}

async function runSync(): Promise<void> {
  const projectId = await requireTrackedRepo();
  const projectConfig = await configManager.getProjectConfig(projectId);
  const { defaultBranch, syncPull } = projectConfig;

  // ── Step 1: Pull default branch ──────────────────────────────────────────────
  let shouldPull = false;
  if (syncPull === 'always') {
    shouldPull = true;
  } else if (syncPull === 'ask') {
    shouldPull = await confirm({ message: `Pull latest ${defaultBranch}?` });
  }
  // 'never' → shouldPull stays false

  if (shouldPull) {
    const currentBranch = await getCurrentBranch();
    if (currentBranch !== defaultBranch) {
      await checkout(defaultBranch);
    }
    await withSpinner(`Pulling ${defaultBranch}...`, () => pullBranch(defaultBranch));
    if (currentBranch !== defaultBranch) {
      await checkout(currentBranch);
    }
    console.log(theme.success(`  ${symbols.success} Pulled latest ${defaultBranch}`));
  }

  // ── Step 2: Load tasks ───────────────────────────────────────────────────────
  const tasks = await configManager.getTasks(projectId);
  const allTasks = tasks.tasks;

  // ── Step 3: Offer to clean up merged tasks ───────────────────────────────────
  const mergedTasks = allTasks.filter((t) => t.status === 'pr_merged');
  for (const task of mergedTasks) {
    const doDelete = await confirm({
      message: `PR for ${theme.primary(task.branchName)} was merged. Delete local branch and mark done?`,
      initialValue: true,
    });
    if (doDelete) {
      const currentBranch = await getCurrentBranch();
      if (currentBranch === task.branchName) {
        await checkout(defaultBranch);
      }
      try {
        await deleteBranch(task.branchName);
        console.log(theme.success(`  ${symbols.success} Deleted branch ${task.branchName}`));
      } catch {
        console.log(
          theme.warning(`  ${symbols.warning} Could not delete ${task.branchName} — skipping`),
        );
      }
      task.status = 'done';
      task.updatedAt = new Date().toISOString();
    }
  }

  // ── Step 4: Offer rebase/merge for active branches that have diverged ────────
  const activeTasks = allTasks.filter((t) => ['active', 'pr_open'].includes(t.status));
  for (const task of activeTasks) {
    const diverged = await hasDiverged(task.branchName, defaultBranch);
    if (!diverged) continue;

    const action = await select<'rebase' | 'merge' | 'skip'>({
      message: `${defaultBranch} has new commits not in ${task.branchName}. What do you want to do?`,
      options: [
        { value: 'rebase', label: 'Rebase', hint: `git rebase ${defaultBranch}` },
        { value: 'merge', label: 'Merge', hint: `git merge --no-ff ${defaultBranch}` },
        { value: 'skip', label: 'Skip', hint: 'do nothing for now' },
      ],
    });

    if (action === 'skip') continue;

    const currentBranch = await getCurrentBranch();
    if (currentBranch !== task.branchName) {
      await checkout(task.branchName);
    }

    try {
      if (action === 'rebase') {
        await rebaseBranch(defaultBranch);
        console.log(
          theme.success(`  ${symbols.success} Rebased ${task.branchName} onto ${defaultBranch}`),
        );
      } else {
        await mergeBranch(defaultBranch);
        console.log(
          theme.success(`  ${symbols.success} Merged ${defaultBranch} into ${task.branchName}`),
        );
      }
    } catch {
      console.log(
        theme.warning(
          `  ${symbols.warning} ${action} failed for ${task.branchName} — resolve conflicts manually`,
        ),
      );
    }

    if (currentBranch !== task.branchName) {
      await checkout(currentBranch);
    }
  }

  // ── Step 5: Sync PR statuses with GitHub ────────────────────────────────────
  const syncableTasks = allTasks.filter((t) => ['active', 'pr_open'].includes(t.status));

  if (syncableTasks.length === 0) {
    await configManager.saveTasks(projectId, tasks);
    console.log(theme.muted('No active tasks to sync with GitHub.'));
    return;
  }

  let updated = 0;
  for (const task of syncableTasks) {
    const pr = await withSpinner(`Checking ${task.branchName}...`, () =>
      ghClient.getPRForBranch(task.branchName),
    );
    if (!pr) continue;

    const prStatus = ghPrToPrStatus(pr);
    const taskStatus = pr.mergedAt ? ('pr_merged' as const) : ('pr_open' as const);

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

  await configManager.saveTasks(projectId, tasks);

  if (updated > 0) {
    console.log(theme.success(`\nSynced ${updated} task(s).`));
  } else {
    console.log(theme.muted('All tasks up to date.'));
  }
}

export function registerSyncCommand(program: Command): void {
  program.command('sync').description('Sync task statuses with GitHub PRs').action(runSync);
}
