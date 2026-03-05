import type { Command } from 'commander';
import boxen from 'boxen';
import Table from 'cli-table3';
import { execa } from 'execa';
import { configManager } from '../config/manager';
import { getCurrentBranch, checkout, branchExists } from '../git/index';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';
import { select, text } from '../ui/prompts';
import { getTicketsProvider } from '../utils/providers';
import { IntegrationError } from '../utils/errors';
import type { Ticket, TicketsProvider } from '../integrations/providers/types';

function renderTicketDetail(ticket: Ticket): void {
  const lines: string[] = [
    `${theme.primaryBold(ticket.key)}  ${theme.muted(ticket.status)}`,
    ``,
    theme.bold(ticket.title),
  ];
  if (ticket.assignee) {
    lines.push(``, `${theme.muted('Assignee:')}  ${ticket.assignee.name}`);
  }
  if (ticket.url) {
    const shortUrl = `https://notion.so/${ticket.id.replace(/-/g, '')}`;
    lines.push(``, `${theme.muted('URL:')}      ${theme.primary(shortUrl)}`);
  }
  if (ticket.description) {
    lines.push(``, theme.muted(ticket.description));
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

async function runTicketActions(
  ticket: Ticket,
  projectId: string,
  provider: TicketsProvider,
): Promise<void> {
  type Action = 'start' | 'status' | 'browser' | 'copy' | 'done';

  const options: { value: Action; label: string; hint?: string }[] = [
    { value: 'start', label: 'Start branch', hint: `checkout ${ticket.key.toLowerCase()}` },
    { value: 'status', label: 'Change status', hint: ticket.status },
    ...(ticket.url ? [{ value: 'browser' as Action, label: 'Open in browser' }] : []),
    ...(ticket.url ? [{ value: 'copy' as Action, label: 'Copy URL' }] : []),
    { value: 'done', label: 'Done' },
  ];

  const action = await select<Action>({ message: 'Action', options });

  if (action === 'done') return;

  if (action === 'start') {
    const branchName = ticket.key.toLowerCase();
    const projectConfig = await configManager.getProjectConfig(projectId);
    const base = projectConfig.defaultBranch;
    const exists = await branchExists(branchName);
    if (exists) {
      await withSpinner(`Switching to ${branchName}...`, () => checkout(branchName));
    } else {
      await withSpinner(`Creating branch ${branchName} from ${base}...`, () =>
        checkout(branchName, true, base),
      );
    }
    const now = new Date().toISOString();
    const branches = await configManager.getBranches(projectId);
    const existing = branches.branches.find((b) => b.branchName === branchName);
    if (!existing) {
      branches.branches.push({
        id: `branch_${Date.now()}`,
        branchName,
        ticketId: ticket.key,
        ticketTitle: ticket.title,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        prNumber: null,
        prUrl: null,
        prStatus: null,
        worktreePath: null,
        lastAccessedAt: now,
      });
    } else {
      existing.lastAccessedAt = now;
    }
    await configManager.saveBranches(projectId, branches);
    console.log(theme.success(`\n${symbols.success} On branch ${theme.primaryBold(branchName)}`));
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

  const url = ticket.url ? `https://notion.so/${ticket.id.replace(/-/g, '')}` : null;

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
  options: { plain?: boolean },
): Promise<void> {
  const projectId = await requireTrackedRepo();
  const plain = options.plain ?? false;

  // Resolve ticket ID: from arg, or from current branch's tracked ticket
  let resolvedId = ticketId?.toUpperCase();
  if (!resolvedId) {
    const [branchesFile, currentBranch] = await Promise.all([
      configManager.getBranches(projectId),
      getCurrentBranch(),
    ]);
    const branch = branchesFile.branches.find((b) => b.branchName === currentBranch);
    resolvedId = branch?.ticketId ?? undefined;
  }

  const [globalConfig, projectConfig] = await Promise.all([
    configManager.getGlobalConfig(),
    configManager.getProjectConfig(projectId),
  ]);
  const provider = getTicketsProvider(globalConfig, projectConfig);
  if (!provider) {
    throw new IntegrationError(
      'No tickets integration is enabled for this project.',
      'notion/jira',
      'Run: morg config and morg init to configure an integration.',
    );
  }

  // If we have a resolved ID, go straight to detail view
  if (resolvedId) {
    const ticket = await withSpinner(`Fetching ${resolvedId}...`, () =>
      provider.getTicket(resolvedId!),
    );
    renderTicketDetail(ticket);
    if (!plain) {
      await runTicketActions(ticket, projectId, provider);
    }
    return;
  }

  // No ticket ID — list all tickets
  const tickets = await withSpinner('Fetching tickets...', () => provider.listTickets());
  if (tickets.length === 0) {
    console.log(theme.muted('No tickets found.'));
    return;
  }

  if (plain) {
    const table = new Table({
      head: [theme.primaryBold('Key'), theme.primaryBold('Title'), theme.primaryBold('Status')],
      style: { head: [], border: [] },
      colWidths: [14, 60, 20],
      wordWrap: true,
    });
    for (const t of tickets) {
      table.push([theme.primary(t.key), t.title, theme.muted(t.status)]);
    }
    console.log('');
    console.log(table.toString());
    return;
  }

  // Interactive selection — label always shows key + title, hint shows status
  const chosen = await select({
    message: 'Select a ticket',
    options: tickets.map((t) => ({
      value: t.key,
      label: `${t.key.padEnd(12)}${t.title}`,
      hint: t.status,
    })),
  });

  const ticket = await withSpinner(`Fetching ${chosen}...`, () => provider.getTicket(chosen));
  renderTicketDetail(ticket);
  await runTicketActions(ticket, projectId, provider);
}

export function registerTicketsCommand(program: Command): void {
  program
    .command('tickets [id]')
    .alias('ticket')
    .description('Show details for a ticket (defaults to current branch ticket)')
    .option('--plain', 'Output list/detail without interactive prompts (for scripts/pipes)')
    .action(runTickets);
}
