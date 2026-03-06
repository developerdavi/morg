import type { Command } from 'commander';
import { join, basename } from 'path';
import { configManager } from '../config/manager';
import {
  getCurrentBranch,
  checkout,
  branchExists,
  getRepoRoot,
  addWorktree,
  pullBranch,
  fetchAndUpdateBranch,
} from '../git/index';
import { isTicketId, extractTicketId, findBranchCaseInsensitive } from '../utils/ticket';
import { handleDirtyTree } from '../utils/stash';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';
import { fetchTicket, promptTicketInProgress } from '../utils/providers';
import { registry } from '../services/registry';

export async function runStart(
  input: string,
  options: { base?: string; worktree?: boolean },
): Promise<void> {
  const projectId = await requireTrackedRepo();

  let branchName: string;
  let ticketId: string | null = null;
  let ticketTitle: string | null = null;

  if (isTicketId(input)) {
    const candidateId = input.trim().toUpperCase();
    // Preserve the ticket ID's original case as the branch name (e.g. MORG-28 → branch MORG-28)
    branchName = candidateId;

    // Enrich from tickets provider if available — non-fatal if not configured or fetch fails
    // ticketId only set on successful fetch so failed lookups don't link the branch to a bad ID
    const ticketsProvider = await registry.tickets().catch(() => null);
    if (ticketsProvider) {
      try {
        const ticket = await fetchTicket(ticketsProvider, candidateId);
        ticketId = ticket.key;
        ticketTitle = ticket.title;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(theme.warning(`  ${symbols.warning} Could not fetch ticket: ${msg}`));
      }
    }
  } else {
    branchName = input;
    ticketId = extractTicketId(input);
  }

  const [currentBranch, globalConfig, projectConfig] = await Promise.all([
    getCurrentBranch(),
    configManager.getGlobalConfig(),
    configManager.getProjectConfig(projectId),
  ]);
  const base = options.base ?? projectConfig.defaultBranch;
  const autoUpdateTicketStatus =
    projectConfig.autoUpdateTicketStatus ?? globalConfig.autoUpdateTicketStatus;

  let worktreePath: string | null = null;
  const exists = await branchExists(branchName);

  if (options.worktree) {
    const repoRoot = await getRepoRoot();
    const repoName = basename(repoRoot);
    const branchSlug = branchName.replace(/\//g, '-');
    worktreePath = join(repoRoot, '..', `${repoName}-worktrees`, branchSlug);

    if (exists) {
      await withSpinner(`Creating worktree for ${branchName}...`, () =>
        addWorktree(worktreePath!, branchName),
      );
    } else {
      // Update local base before creating the worktree from it
      if (currentBranch === base) {
        try {
          await withSpinner(`Pulling ${base}...`, () => pullBranch(base));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(theme.warning(`  ${symbols.warning} Could not pull ${base}: ${msg}`));
        }
      } else {
        const updated = await fetchAndUpdateBranch(base);
        if (!updated) {
          console.log(theme.warning(`  ${symbols.warning} Could not update ${base} — using local`));
        }
      }
      await withSpinner(`Creating branch ${branchName} and worktree...`, () =>
        addWorktree(worktreePath!, branchName, base),
      );
    }
    console.log(
      theme.success(`\n${symbols.success} Worktree created at ${theme.primaryBold(worktreePath)}`),
    );
    console.log(theme.muted(`  ${symbols.arrow} cd ${worktreePath}`));
  } else {
    if (exists) {
      if (currentBranch !== branchName) {
        await handleDirtyTree(currentBranch, branchName);
        await withSpinner(`Switching to ${branchName}...`, () => checkout(branchName));
      }
    } else {
      // Switch to base, pull it, then create the new branch from it
      if (currentBranch !== base) {
        await handleDirtyTree(currentBranch, branchName);
        await withSpinner(`Switching to ${base}...`, () => checkout(base));
      }
      try {
        await withSpinner(`Pulling ${base}...`, () => pullBranch(base));
      } catch {
        console.log(theme.warning(`  ${symbols.warning} Could not pull ${base} — using local`));
      }
      await withSpinner(`Creating branch ${branchName}...`, () => checkout(branchName, true));
    }
    console.log(theme.success(`\n${symbols.success} On branch ${theme.primaryBold(branchName)}`));
  }

  // Transition ticket to in-progress if configured
  if (ticketId) {
    await promptTicketInProgress(projectId, ticketId, autoUpdateTicketStatus);
  }

  // Create branch entry if it doesn't exist (case-insensitive check to avoid duplicates)
  const now = new Date().toISOString();
  const branches = await configManager.getBranches(projectId);
  const existing = findBranchCaseInsensitive(branches.branches, branchName);
  if (!existing) {
    branches.branches.push({
      id: `branch_${Date.now()}`,
      branchName,
      ticketId,
      ticketTitle,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      prNumber: null,
      prUrl: null,
      prStatus: null,
      worktreePath,
      lastAccessedAt: now,
    });
  } else {
    existing.lastAccessedAt = now;
    if (worktreePath) existing.worktreePath = worktreePath;
  }
  await configManager.saveBranches(projectId, branches);

  if (ticketId) console.log(theme.muted(`  Ticket: ${ticketId}`));
}

export function registerStartCommand(program: Command): void {
  program
    .command('start <branch-or-ticket>')
    .description('Start work on a branch or ticket')
    .option('--base <branch>', 'Base branch to create from (default: repo default branch)')
    .option('-w, --worktree', 'Create a git worktree instead of checking out')
    .action(runStart);
}
