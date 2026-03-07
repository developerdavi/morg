import type { Command } from 'commander';
import boxen from 'boxen';
import Table from 'cli-table3';
import { execa } from 'execa';
import { configManager } from '../config/manager';
import { getCurrentBranch } from '../git/index';
import { requireTrackedRepo } from '../utils/detect';
import { findBranchCaseInsensitive } from '../utils/ticket';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';
import { select, text } from '../ui/prompts';
import { registry } from '../services/registry';
import { IntegrationError } from '../utils/errors';
import type { Ticket, TicketsProvider } from '../integrations/providers/tickets/tickets-provider';
import type { Branch } from '../config/schemas';
import { runStart } from './start';

function renderTicketDetail(ticket: Ticket): void {
  const typeTag = ticket.issueType ? `  ${theme.muted(`[${ticket.issueType}]`)}` : '';
  const lines: string[] = [
    `${theme.primaryBold(ticket.key)}  ${theme.muted(ticket.status)}${typeTag}`,
    ``,
    theme.bold(ticket.title),
  ];
  if (ticket.parent) {
    lines.push(
      ``,
      `${theme.muted('Parent:')}    ${theme.primary(ticket.parent.key)}  ${theme.muted(ticket.parent.status)}  ${ticket.parent.title}`,
    );
  }
  if (ticket.assignee) {
    lines.push(``, `${theme.muted('Assignee:')}  ${ticket.assignee.name}`);
  }
  if (ticket.url) {
    lines.push(``, `${theme.muted('URL:')}      ${theme.primary(ticket.url)}`);
  }
  if (ticket.subtasks && ticket.subtasks.length > 0) {
    lines.push(``, theme.muted(`Subtasks (${ticket.subtasks.length}):`));
    for (const s of ticket.subtasks) {
      lines.push(`  ${theme.primary(s.key)}  ${theme.muted(s.status)}  ${s.title}`);
    }
  }
  if (ticket.issueLinks && ticket.issueLinks.length > 0) {
    lines.push(``, theme.muted('Links:'));
    for (const l of ticket.issueLinks) {
      lines.push(`  ${theme.muted(l.type)}  ${theme.primary(l.ticket.key)}  ${l.ticket.title}`);
    }
  }
  if (ticket.description) {
    lines.push(``, ticket.description);
  }

  console.log('');
  console.log(
    boxen(lines.join('\n'), {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
    }),
  );
}

/** Returns the tracked branch name for a ticket key, if any. */
function getTrackedBranchForTicket(branches: Branch[], ticketKey: string): string | undefined {
  const upper = ticketKey.toUpperCase();
  return branches.find((b) => b.ticketId?.toUpperCase() === upper)?.branchName;
}

async function openTicketDetail(
  key: string,
  projectId: string,
  provider: TicketsProvider,
  currentBranch: string,
  branchesFile: Awaited<ReturnType<typeof configManager.getBranches>>,
  onBack?: () => Promise<void>,
): Promise<void> {
  const ticket = await withSpinner(`Fetching ${key}...`, () => provider.getTicket(key));
  renderTicketDetail(ticket);
  const trackedBranchName = getTrackedBranchForTicket(branchesFile.branches, ticket.key);
  await runTicketActions(ticket, projectId, provider, {
    currentBranch,
    trackedBranchName,
    branchesFile,
    onBack,
  });
}

async function runTicketActions(
  ticket: Ticket,
  projectId: string,
  provider: TicketsProvider,
  context: {
    currentBranch: string;
    trackedBranchName?: string;
    branchesFile: Awaited<ReturnType<typeof configManager.getBranches>>;
    onBack?: () => Promise<void>;
  },
): Promise<void> {
  type Action =
    | 'start'
    | 'switch'
    | 'status'
    | 'browser'
    | 'copy'
    | 'parent'
    | 'subtasks'
    | `link:${string}`
    | 'back'
    | 'done';

  const isTracked = !!context.trackedBranchName;
  const isOnBranch = context.trackedBranchName === context.currentBranch;

  const options: { value: Action; label: string; hint?: string }[] = [];

  if (!isTracked) {
    options.push({ value: 'start', label: 'Start branch', hint: `morg start ${ticket.key}` });
  } else if (!isOnBranch) {
    options.push({
      value: 'switch',
      label: 'Switch to branch',
      hint: context.trackedBranchName,
    });
  }

  options.push({ value: 'status', label: 'Change status', hint: ticket.status });
  if (ticket.url) {
    options.push({ value: 'browser', label: 'Open in browser' });
    options.push({ value: 'copy', label: 'Copy URL' });
  }
  if (ticket.parent) {
    options.push({
      value: 'parent',
      label: `Go to parent: ${ticket.parent.key}`,
      hint: ticket.parent.title.slice(0, 40),
    });
  }
  if (ticket.subtasks && ticket.subtasks.length > 0) {
    options.push({
      value: 'subtasks',
      label: 'View child issues',
      hint: `${ticket.subtasks.length} issue${ticket.subtasks.length === 1 ? '' : 's'}`,
    });
  }
  if (ticket.issueLinks && ticket.issueLinks.length > 0) {
    for (const l of ticket.issueLinks) {
      options.push({
        value: `link:${l.ticket.key}` as Action,
        label: `${l.type}: ${l.ticket.key}`,
        hint: l.ticket.title.slice(0, 40),
      });
    }
  }
  if (context.onBack) {
    options.push({ value: 'back', label: 'Back to list' });
  }
  options.push({ value: 'done', label: 'Done' });

  const action = await select<Action>({ message: 'Action', options });

  if (action === 'done') return;

  if (action === 'back') {
    await context.onBack!();
    return;
  }

  if (action === 'parent' && ticket.parent) {
    await openTicketDetail(
      ticket.parent.key,
      projectId,
      provider,
      context.currentBranch,
      context.branchesFile,
      () => runTicketActions(ticket, projectId, provider, context),
    );
    return;
  }

  if (action === 'subtasks' && ticket.subtasks && ticket.subtasks.length > 0) {
    const chosenKey = await select({
      message: 'Select child issue',
      options: ticket.subtasks.map((s) => ({
        value: s.key,
        label: `${s.key.padEnd(12)}${s.title}`,
        hint: s.status,
      })),
    });
    await openTicketDetail(
      chosenKey,
      projectId,
      provider,
      context.currentBranch,
      context.branchesFile,
      () => runTicketActions(ticket, projectId, provider, context),
    );
    return;
  }

  if (typeof action === 'string' && action.startsWith('link:')) {
    const key = action.slice('link:'.length);
    await openTicketDetail(
      key,
      projectId,
      provider,
      context.currentBranch,
      context.branchesFile,
      () => runTicketActions(ticket, projectId, provider, context),
    );
    return;
  }

  if (action === 'start') {
    await runStart(ticket.key, {});
    return;
  }

  if (action === 'switch') {
    await runStart(context.trackedBranchName!, {});
    return;
  }

  if (action === 'status') {
    const statuses = await provider.getStatuses?.();
    let newStatus: string;
    if (statuses && statuses.length > 0) {
      newStatus = await select({
        message: 'New status:',
        options: statuses.map((s) => ({ value: s, label: s })),
        initialValue: ticket.status,
      });
    } else {
      newStatus = await text({ message: 'New status:', initialValue: ticket.status });
    }
    await withSpinner(`Updating status to "${newStatus}"...`, () =>
      provider.transitionTicket(ticket.key, newStatus),
    );
    console.log(theme.success(`${symbols.success} Status updated to "${newStatus}"`));
    return;
  }

  const url = ticket.url;
  if (!url) return;

  if (action === 'browser') {
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    await execa(opener, [url], { reject: false });
    return;
  }

  if (action === 'copy') {
    const clipCmd = process.platform === 'darwin' ? 'pbcopy' : 'xclip';
    const result = await execa(clipCmd, { input: url, reject: false });
    if (result.exitCode === 0) {
      console.log(theme.success(`${symbols.success} URL copied to clipboard`));
    } else {
      console.log(theme.muted(`URL: ${url}`));
    }
    return;
  }
}

async function runTickets(
  ticketId: string | undefined,
  options: { plain?: boolean; json?: boolean },
  resolveFromBranch = false,
): Promise<void> {
  const projectId = await requireTrackedRepo();
  const plain = options.plain ?? false;
  const json = options.json ?? false;

  const [branchesFile, currentBranch] = await Promise.all([
    configManager.getBranches(projectId),
    getCurrentBranch(),
  ]);

  // Resolve ticket ID: from arg, or (only for `ticket` singular) from current branch
  let resolvedId = ticketId?.toUpperCase();
  if (!resolvedId && resolveFromBranch) {
    const branch = findBranchCaseInsensitive(branchesFile.branches, currentBranch);
    resolvedId = branch?.ticketId ?? undefined;
  }

  const provider = await registry.tickets();
  if (!provider) {
    throw new IntegrationError(
      'No tickets integration is enabled for this project.',
      'notion/jira',
      'Run: morg config and morg init to configure an integration.',
    );
  }

  // If we have a resolved ID, go straight to detail view (no back button)
  if (resolvedId) {
    const ticket = await withSpinner(`Fetching ${resolvedId}...`, () =>
      provider.getTicket(resolvedId!),
    );

    if (json) {
      process.stdout.write(JSON.stringify({ ticket }, null, 2) + '\n');
      return;
    }

    renderTicketDetail(ticket);
    if (!plain) {
      const trackedBranchName = getTrackedBranchForTicket(branchesFile.branches, ticket.key);
      await runTicketActions(ticket, projectId, provider, {
        currentBranch,
        trackedBranchName,
        branchesFile,
      });
    }
    return;
  }

  // No ticket ID — list all tickets
  const tickets = await withSpinner('Fetching tickets...', () => provider.listTickets());

  if (json) {
    process.stdout.write(JSON.stringify({ tickets }, null, 2) + '\n');
    return;
  }

  if (tickets.length === 0) {
    console.log(theme.muted('No tickets found.'));
    return;
  }

  if (plain) {
    const table = new Table({
      head: [
        theme.primaryBold('Key'),
        theme.primaryBold('Title'),
        theme.primaryBold('Type'),
        theme.primaryBold('Status'),
      ],
      style: { head: [], border: [] },
      colWidths: [14, 50, 16, 20],
      wordWrap: true,
    });
    for (const t of tickets) {
      table.push([
        theme.primary(t.key),
        t.title,
        theme.muted(t.issueType ?? ''),
        theme.muted(t.status),
      ]);
    }
    console.log('');
    console.log(table.toString());
    return;
  }

  // Interactive selection with a back-capable detail flow
  async function showList(): Promise<void> {
    const chosen = await select({
      message: 'Select a ticket',
      options: tickets.map((t) => ({
        value: t.key,
        label: `${t.key.padEnd(12)}${t.title}`,
        hint: t.issueType ? `${t.issueType} · ${t.status}` : t.status,
      })),
    });

    const ticket = await withSpinner(`Fetching ${chosen}...`, () => provider!.getTicket(chosen));
    renderTicketDetail(ticket);
    const trackedBranchName = getTrackedBranchForTicket(branchesFile.branches, ticket.key);
    await runTicketActions(ticket, projectId, provider!, {
      currentBranch,
      trackedBranchName,
      branchesFile,
      onBack: showList,
    });
  }

  await showList();
}

export function registerTicketsCommand(program: Command): void {
  // `morg tickets [id]` — always lists if no id given
  program
    .command('tickets [id]')
    .description('List all tickets, or show detail for a specific ticket')
    .option('--plain', 'Output list/detail without interactive prompts (for scripts/pipes)')
    .option('--json', 'Output as JSON (for scripting)')
    .action((id: string | undefined, options: { plain?: boolean; json?: boolean }) =>
      runTickets(id, options, false),
    );

  // `morg ticket [id]` — resolves to current branch ticket if no id given
  program
    .command('ticket [id]')
    .description('Show ticket details (defaults to current branch ticket)')
    .option('--plain', 'Output without interactive prompts (for scripts/pipes)')
    .option('--json', 'Output as JSON (for scripting)')
    .action((id: string | undefined, options: { plain?: boolean; json?: boolean }) =>
      runTickets(id, options, true),
    );
}
