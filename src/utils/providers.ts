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
 *
 * @param mode - 'always': auto-transition without prompting; 'ask': prompt the user (default);
 *               'never': skip entirely.
 */
export async function promptTicketDone(
  projectId: string,
  ticketId: string,
  mode: 'always' | 'ask' | 'never' = 'ask',
): Promise<void> {
  if (mode === 'never') return;

  const [globalConfig, projectConfig] = await Promise.all([
    configManager.getGlobalConfig(),
    configManager.getProjectConfig(projectId),
  ]);
  const provider = getTicketsProvider(globalConfig, projectConfig);
  if (!provider) return;

  try {
    const [statuses, currentTicket] = await Promise.all([
      provider.getStatuses?.() ?? Promise.resolve(undefined),
      provider.getTicket(ticketId),
    ]);
    let doneStatus: string;
    if (statuses && statuses.length > 0) {
      const defaultDone =
        statuses.find((s) => /done|complete|closed|shipped|resolved/i.test(s)) ??
        statuses[statuses.length - 1]!;
      if (mode === 'always') {
        doneStatus = defaultDone;
      } else {
        doneStatus = await select({
          message: 'Done status:',
          options: statuses.map((s) => ({ value: s, label: s })),
          initialValue: defaultDone,
        });
      }
    } else if (mode === 'always') {
      doneStatus = 'Done';
    } else {
      doneStatus = await text({ message: 'Done status:', initialValue: 'Done' });
    }
    if (currentTicket.status.toLowerCase() === doneStatus.toLowerCase()) return;
    if (mode === 'ask') {
      const ok = await confirm({ message: `Mark ticket ${ticketId} as done?`, initialValue: true });
      if (!ok) return;
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

/**
 * Transitions a ticket to an "in progress" status when starting a branch.
 * Non-fatal — silently skips if no provider is configured or the call fails.
 *
 * @param mode - 'always': auto-transition without prompting; 'ask': prompt the user;
 *               'never': skip entirely.
 */
export async function promptTicketInProgress(
  projectId: string,
  ticketId: string,
  mode: 'always' | 'ask' | 'never' = 'ask',
): Promise<void> {
  if (mode === 'never') return;

  const [globalConfig, projectConfig] = await Promise.all([
    configManager.getGlobalConfig(),
    configManager.getProjectConfig(projectId),
  ]);
  const provider = getTicketsProvider(globalConfig, projectConfig);
  if (!provider) return;

  try {
    const [statuses, currentTicket] = await Promise.all([
      provider.getStatuses?.() ?? Promise.resolve(undefined),
      provider.getTicket(ticketId),
    ]);
    let inProgressStatus: string;
    if (statuses && statuses.length > 0) {
      const defaultInProgress =
        statuses.find((s) => /in[\s-]?progress/i.test(s)) ??
        statuses.find((s) => /\bstarted\b|\bworking\b|\bdoing\b/i.test(s) && !/not/i.test(s)) ??
        statuses[0]!;
      if (mode === 'always') {
        inProgressStatus = defaultInProgress;
      } else {
        inProgressStatus = await select({
          message: 'In progress status:',
          options: statuses.map((s) => ({ value: s, label: s })),
          initialValue: defaultInProgress,
        });
      }
    } else if (mode === 'always') {
      inProgressStatus = 'In Progress';
    } else {
      inProgressStatus = await text({
        message: 'In progress status:',
        initialValue: 'In Progress',
      });
    }
    if (currentTicket.status.toLowerCase() === inProgressStatus.toLowerCase()) return;
    if (mode === 'ask') {
      const ok = await confirm({
        message: `Mark ticket ${ticketId} as in progress?`,
        initialValue: true,
      });
      if (!ok) return;
    }
    await withSpinner(`Marking ${ticketId} as "${inProgressStatus}"...`, () =>
      provider.transitionTicket(ticketId, inProgressStatus),
    );
    console.log(
      theme.success(`  ${symbols.success} Ticket ${ticketId} marked as "${inProgressStatus}"`),
    );
  } catch {
    console.log(
      theme.warning(`  ${symbols.warning} Could not update ticket ${ticketId} — skipping`),
    );
  }
}
