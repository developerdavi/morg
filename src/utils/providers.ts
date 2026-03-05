import type { GlobalConfig, ProjectConfig } from '../config/schemas';
import { configManager } from '../config/manager';
import { JiraClient } from '../integrations/jira/client';
import { NotionClient } from '../integrations/notion/client';
import { ClaudeClient } from '../integrations/claude/client';
import type { Ticket, TicketsProvider, AIProvider } from '../integrations/providers/types';
import { IntegrationError } from './errors';
import { withSpinner } from '../ui/spinner';
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
