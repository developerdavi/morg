import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { getCurrentBranch } from '../git/index';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';
import { fetchTicket } from '../utils/providers';
import { isTicketId, findBranchCaseInsensitive } from '../utils/ticket';
import { registry } from '../services/registry';

async function runTrack(branch?: string, ticket?: string): Promise<void> {
  const projectId = await requireTrackedRepo();

  // If the first arg looks like a ticket ID, treat it as the ticket for the current branch
  let branchName: string;
  let ticketId: string | null;
  if (branch && isTicketId(branch)) {
    branchName = await getCurrentBranch();
    ticketId = branch.toUpperCase();
  } else {
    branchName = branch ?? (await getCurrentBranch());
    ticketId = ticket?.toUpperCase() ?? null;
  }

  // Fetch ticket info — non-fatal; if fetch fails, branch is tracked without a ticket link
  let ticketTitle: string | null = null;
  if (ticketId) {
    const ticketsProvider = await registry.tickets().catch(() => null);
    if (ticketsProvider) {
      try {
        const ticket = await fetchTicket(ticketsProvider, ticketId);
        ticketTitle = ticket.title;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(theme.warning(`  ${symbols.warning} Could not fetch ticket: ${msg}`));
        ticketId = null;
      }
    }
  }

  const branchesFile = await configManager.getBranches(projectId);
  const existing = findBranchCaseInsensitive(branchesFile.branches, branchName);

  if (existing) {
    if (ticketId) {
      existing.ticketId = ticketId;
      existing.ticketTitle = ticketTitle;
      existing.updatedAt = new Date().toISOString();
      await configManager.saveBranches(projectId, branchesFile);
      console.log(
        theme.success(
          `${symbols.success} Updated branch ${existing.branchName} → ticket ${ticketId}`,
        ),
      );
    } else {
      console.log(theme.muted(`Branch ${existing.branchName} is already tracked.`));
    }
    return;
  }

  const now = new Date().toISOString();
  branchesFile.branches.push({
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
    worktreePath: null,
    ticketUrl: null,
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
