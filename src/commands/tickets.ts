import type { Command } from 'commander';
import boxen from 'boxen';
import { configManager } from '../config/manager';
import { getCurrentBranch } from '../git/index';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';
import { getTicketsProvider } from '../utils/providers';
import { IntegrationError } from '../utils/errors';

async function runTickets(ticketId?: string): Promise<void> {
  const projectId = await requireTrackedRepo();

  // Resolve ticket ID: from arg, or from current branch's tracked ticket
  let resolvedId = ticketId?.toUpperCase();
  if (!resolvedId) {
    const [branchesFile, currentBranch] = await Promise.all([
      configManager.getBranches(projectId),
      getCurrentBranch(),
    ]);
    const branch = branchesFile.branches.find((b) => b.branchName === currentBranch);
    resolvedId = branch?.ticketId ?? undefined;
    if (!resolvedId) {
      console.log(theme.muted('No ticket associated with the current branch.'));
      console.log(theme.muted(`  ${symbols.arrow} Run: morg track <ticket-id>`));
      return;
    }
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

  const ticket = await withSpinner(`Fetching ${resolvedId}...`, () =>
    provider.getTicket(resolvedId!),
  );

  const lines: string[] = [
    `${theme.primaryBold(ticket.key)}  ${theme.muted(ticket.status)}`,
    ``,
    theme.bold(ticket.title),
  ];
  if (ticket.assignee) {
    lines.push(``, `${theme.muted('Assignee:')}  ${ticket.assignee.name}`);
  }
  if (ticket.url) {
    // Use the canonical short URL (just the ID, no slug)
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

export function registerTicketsCommand(program: Command): void {
  program
    .command('tickets [id]')
    .alias('ticket')
    .description('Show details for a ticket (defaults to current branch ticket)')
    .action(runTickets);
}
