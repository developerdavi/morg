import { execa } from 'execa';
import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { ghClient, ghPrToPrStatus } from '../integrations/github/client';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';
import { confirm, select } from '../ui/prompts';
import { promptTicketDone } from '../utils/providers';
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
  const result = await execa('git', ['log', `${branch}..${defaultBranch}`, '--oneline'], {
    reject: false,
  });
  if (result.exitCode !== 0) return false;
  return result.stdout.trim().length > 0;
}

async function runSync(): Promise<void> {
  const projectId = await requireTrackedRepo();
  const [globalConfig, projectConfig] = await Promise.all([
    configManager.getGlobalConfig(),
    configManager.getProjectConfig(projectId),
  ]);
  const { defaultBranch } = projectConfig;

  // Project-level overrides global; fall back to global default
  const syncPull = projectConfig.syncPull ?? globalConfig.syncPull;
  const autoDeleteMerged = projectConfig.autoDeleteMerged ?? globalConfig.autoDeleteMerged;
  const autoUpdateTicketStatus =
    projectConfig.autoUpdateTicketStatus ?? globalConfig.autoUpdateTicketStatus;

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

  // ── Step 2: Load branches ────────────────────────────────────────────────────
  const branchesFile = await configManager.getBranches(projectId);
  const allBranches = branchesFile.branches;

  // ── Step 3: Offer to clean up merged branches ────────────────────────────────
  const mergedBranches = allBranches.filter((b) => b.status === 'pr_merged');
  for (const branch of mergedBranches) {
    let doDelete = false;
    if (autoDeleteMerged === 'always') {
      doDelete = true;
      console.log(
        theme.muted(
          `  ${symbols.arrow} PR for ${theme.primary(branch.branchName)} was merged — deleting branch`,
        ),
      );
    } else if (autoDeleteMerged === 'ask') {
      doDelete = await confirm({
        message: `PR for ${theme.primary(branch.branchName)} was merged. Delete local branch and mark done?`,
        initialValue: true,
      });
    }
    // 'never' → doDelete stays false
    if (doDelete) {
      const currentBranch = await getCurrentBranch();
      if (currentBranch === branch.branchName) {
        await checkout(defaultBranch);
      }
      try {
        await deleteBranch(branch.branchName);
        console.log(theme.success(`  ${symbols.success} Deleted branch ${branch.branchName}`));
      } catch {
        console.log(
          theme.warning(`  ${symbols.warning} Could not delete ${branch.branchName} — skipping`),
        );
      }
      branch.status = 'done';
      branch.updatedAt = new Date().toISOString();
      if (branch.ticketId) {
        await promptTicketDone(projectId, branch.ticketId, autoUpdateTicketStatus);
      }
    }
  }

  // ── Step 4: Offer rebase/merge for active branches that have diverged ────────
  const activeBranches = allBranches.filter((b) => ['active', 'pr_open'].includes(b.status));
  for (const branch of activeBranches) {
    const diverged = await hasDiverged(branch.branchName, defaultBranch);
    if (!diverged) continue;

    const action = await select<'rebase' | 'merge' | 'skip'>({
      message: `${defaultBranch} has new commits not in ${branch.branchName}. What do you want to do?`,
      options: [
        { value: 'rebase', label: 'Rebase', hint: `git rebase ${defaultBranch}` },
        { value: 'merge', label: 'Merge', hint: `git merge --no-ff ${defaultBranch}` },
        { value: 'skip', label: 'Skip', hint: 'do nothing for now' },
      ],
    });

    if (action === 'skip') continue;

    const currentBranch = await getCurrentBranch();
    if (currentBranch !== branch.branchName) {
      await checkout(branch.branchName);
    }

    try {
      if (action === 'rebase') {
        await rebaseBranch(defaultBranch);
        console.log(
          theme.success(`  ${symbols.success} Rebased ${branch.branchName} onto ${defaultBranch}`),
        );
      } else {
        await mergeBranch(defaultBranch);
        console.log(
          theme.success(`  ${symbols.success} Merged ${defaultBranch} into ${branch.branchName}`),
        );
      }
    } catch {
      console.log(
        theme.warning(
          `  ${symbols.warning} ${action} failed for ${branch.branchName} — resolve conflicts manually`,
        ),
      );
    }

    if (currentBranch !== branch.branchName) {
      await checkout(currentBranch);
    }
  }

  // ── Step 5: Sync PR statuses with GitHub ────────────────────────────────────
  const syncableBranches = allBranches.filter((b) => ['active', 'pr_open'].includes(b.status));

  if (syncableBranches.length === 0) {
    await configManager.saveBranches(projectId, branchesFile);
    console.log(theme.muted('No active branches to sync with GitHub.'));
    return;
  }

  let updated = 0;
  for (const branch of syncableBranches) {
    const pr = await withSpinner(`Checking ${branch.branchName}...`, () =>
      ghClient.getPRForBranch(branch.branchName),
    );
    if (!pr) continue;

    const prStatus = ghPrToPrStatus(pr);
    const branchStatus = pr.mergedAt ? ('pr_merged' as const) : ('pr_open' as const);

    if (branch.prStatus !== prStatus || branch.status !== branchStatus) {
      branch.prNumber = pr.number;
      branch.prUrl = pr.url;
      branch.prStatus = prStatus;
      branch.status = branchStatus;
      branch.updatedAt = new Date().toISOString();
      updated++;
      console.log(theme.success(`  ${symbols.success} ${branch.branchName} → ${prStatus}`));
    }
  }

  await configManager.saveBranches(projectId, branchesFile);

  if (updated > 0) {
    console.log(theme.success(`\nSynced ${updated} branch(es).`));
  } else {
    console.log(theme.muted('All branches up to date.'));
  }
}

export function registerSyncCommand(program: Command): void {
  program.command('sync').description('Sync branch statuses with GitHub PRs').action(runSync);
}
