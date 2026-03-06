import { execa } from 'execa';
import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { GhClient, ghPrToPrStatus } from '../integrations/github/client';
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

async function runSync(options: { all?: boolean }): Promise<void> {
  const projectId = await requireTrackedRepo();
  const [globalConfig, projectConfig] = await Promise.all([
    configManager.getGlobalConfig(),
    configManager.getProjectConfig(projectId),
  ]);
  const { defaultBranch } = projectConfig;
  const gh = new GhClient(projectConfig.githubUsername);
  const autoDeleteMerged = projectConfig.autoDeleteMerged ?? globalConfig.autoDeleteMerged;
  const autoUpdateTicketStatus =
    projectConfig.autoUpdateTicketStatus ?? globalConfig.autoUpdateTicketStatus;

  // ── Step 1: Always pull default branch ───────────────────────────────────────
  const startBranch = await getCurrentBranch();
  if (startBranch !== defaultBranch) {
    await checkout(defaultBranch);
  }
  await withSpinner(`Pulling ${defaultBranch}...`, () => pullBranch(defaultBranch));
  if (startBranch !== defaultBranch) {
    await checkout(startBranch);
  }
  console.log(theme.success(`  ${symbols.success} Pulled latest ${defaultBranch}`));

  // ── Step 2: Sync PR statuses (all tracked branches) ──────────────────────────
  const branchesFile = await configManager.getBranches(projectId);
  const allBranches = branchesFile.branches;
  const syncableBranches = allBranches.filter((b) => ['active', 'pr_open'].includes(b.status));

  let updated = 0;
  let discovered = 0;
  for (const branch of syncableBranches) {
    const pr = await withSpinner(`Checking ${branch.branchName}...`, () =>
      gh.getPRForBranch(branch.branchName),
    );
    if (!pr) continue;

    const prStatus = ghPrToPrStatus(pr);
    const branchStatus = pr.mergedAt ? ('pr_merged' as const) : ('pr_open' as const);
    const isNewlyDiscovered = branch.prNumber == null;

    if (isNewlyDiscovered || branch.prStatus !== prStatus || branch.status !== branchStatus) {
      branch.prNumber = pr.number;
      branch.prUrl = pr.url;
      branch.prStatus = prStatus;
      branch.status = branchStatus;
      branch.updatedAt = new Date().toISOString();
      if (isNewlyDiscovered) {
        discovered++;
        console.log(
          theme.success(`  ${symbols.success} ${branch.branchName} → linked PR #${pr.number}`),
        );
      } else {
        updated++;
        console.log(theme.success(`  ${symbols.success} ${branch.branchName} → ${prStatus}`));
      }
    }
  }

  if (updated > 0) console.log(theme.success(`  Synced ${updated} PR status(es).`));
  if (discovered > 0) console.log(theme.success(`  Discovered ${discovered} new PR(s).`));

  // ── Step 3: Delete merged branches (all tracked branches) ────────────────────
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
    if (doDelete) {
      const currentBranch = await getCurrentBranch();
      if (currentBranch === branch.branchName) {
        await checkout(defaultBranch);
      }
      try {
        await deleteBranch(branch.branchName);
        console.log(theme.success(`  ${symbols.success} Deleted branch ${branch.branchName}`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(
          theme.warning(`  ${symbols.warning} Could not delete ${branch.branchName}: ${msg}`),
        );
      }
      branch.status = 'done';
      branch.updatedAt = new Date().toISOString();
      if (branch.ticketId) {
        await promptTicketDone(projectId, branch.ticketId, autoUpdateTicketStatus);
      }
    }
  }

  // ── Step 4: Update branches with new changes from default branch ──────────────
  // Scope: current branch only by default; all active branches if --all
  const currentBranch = await getCurrentBranch();
  const activeBranches = allBranches.filter((b) => ['active', 'pr_open'].includes(b.status));
  const branchesToUpdate = options.all
    ? activeBranches
    : activeBranches.filter((b) => b.branchName === currentBranch);

  for (const branch of branchesToUpdate) {
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        theme.warning(`  ${symbols.warning} ${action} failed for ${branch.branchName}: ${msg}`),
      );
    }

    if (currentBranch !== branch.branchName) {
      await checkout(currentBranch);
    }
  }

  await configManager.saveBranches(projectId, branchesFile);

  if (activeBranches.length === 0 && mergedBranches.length === 0) {
    console.log(theme.muted('No branches to sync.'));
  }
}

export function registerSyncCommand(program: Command): void {
  program
    .command('sync')
    .description('Sync branch statuses with GitHub PRs and update branches')
    .option('--all', 'Update all active branches (default: current branch only)')
    .action(runSync);
}
