import type { GlobalConfig, ProjectConfig } from '../config/schemas';
import { configManager } from '../config/manager';
import { JiraClient } from '../integrations/jira/client';
import { NotionClient } from '../integrations/notion/client';
import { ClaudeClient } from '../integrations/claude/client';
import type { Ticket, TicketsProvider, AIProvider } from '../integrations/providers/types';
import { IntegrationError } from './errors';
import { withSpinner } from '../ui/spinner';
import { confirm, select, text } from '../ui/prompts';
import { theme, symbols } from '../ui/theme';

export function getTicketsProvider(
  globalConfig: GlobalConfig,
  projectConfig: ProjectConfig,
): TicketsProvider | null {
  if (globalConfig.integrations.jira?.enabled && projectConfig.integrations.jira?.enabled) {
    return new JiraClient(globalConfig.integrations.jira, projectConfig.integrations.jira);
  }
  if (globalConfig.integrations.notion?.enabled && projectConfig.integrations.notion?.enabled) {
    return new NotionClient(globalConfig.integrations.notion, projectConfig.integrations.notion);
  }
  return null;
}

export function getAIProvider(globalConfig: GlobalConfig): AIProvider | null {
  if (globalConfig.anthropicApiKey) {
    return new ClaudeClient(globalConfig.anthropicApiKey);
  }
  return null;
}

/**
 * Fetches a ticket from the configured provider, printing its title.
 * Throws IntegrationError if no provider is configured, or re-throws
 * any error from the provider (network, not found, etc.).
 */
export async function fetchTicket(projectId: string, ticketId: string): Promise<Ticket> {
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
  const ticket = await withSpinner(`Fetching ${ticketId}...`, () => provider.getTicket(ticketId));
  console.log(theme.muted(`  ${symbols.arrow} ${ticket.title}`));
  return ticket;
}

/**
 * Prompts the user to transition a ticket to a "done" status after a branch is merged.
 * Non-fatal — silently skips if no provider is configured or the call fails.
 */
export async function promptTicketDone(projectId: string, ticketId: string): Promise<void> {
  const [globalConfig, projectConfig] = await Promise.all([
    configManager.getGlobalConfig(),
    configManager.getProjectConfig(projectId),
  ]);
  const provider = getTicketsProvider(globalConfig, projectConfig);
  if (!provider) return;

  const ok = await confirm({ message: `Mark ticket ${ticketId} as done?`, initialValue: true });
  if (!ok) return;

  try {
    const statuses = await provider.getStatuses?.();
    let doneStatus: string;
    if (statuses && statuses.length > 0) {
      const defaultDone =
        statuses.find((s) => /done|complete|closed|shipped|resolved/i.test(s)) ??
        statuses[statuses.length - 1]!;
      doneStatus = await select({
        message: 'Done status:',
        options: statuses.map((s) => ({ value: s, label: s })),
        initialValue: defaultDone,
      });
    } else {
      doneStatus = await text({ message: 'Done status:', initialValue: 'Done' });
    }
    await withSpinner(`Marking ${ticketId} as "${doneStatus}"...`, () =>
      provider.transitionTicket(ticketId, doneStatus),
    );
    console.log(theme.success(`  ${symbols.success} Ticket ${ticketId} marked as "${doneStatus}"`));
  } catch {
    console.log(
      theme.warning(`  ${symbols.warning} Could not update ticket ${ticketId} — skipping`),
    );
  }
}
