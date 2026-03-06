import { registry } from '../services/registry';
import type { Ticket, TicketsProvider } from '../integrations/providers/tickets/tickets-provider';
import { withSpinner } from '../ui/spinner';
import { confirm, select, text } from '../ui/prompts';
import { theme, symbols } from '../ui/theme';

export type { Ticket, TicketsProvider };

/**
 * Fetches a ticket from the given provider, printing its title.
 * Throws IntegrationError if the fetch fails.
 *
 * @param provider - TicketsProvider instance (get via `registry.tickets()`)
 * @param ticketId - Ticket key (e.g. MORG-42)
 * @returns The fetched ticket
 * @throws IntegrationError if the provider returns an error
 */
export async function fetchTicket(provider: TicketsProvider, ticketId: string): Promise<Ticket> {
  const ticket = await withSpinner(`Fetching ${ticketId}...`, () => provider.getTicket(ticketId));
  console.log(theme.muted(`  ${symbols.arrow} ${ticket.title}`));
  return ticket;
}

type TransitionDirection = 'inProgress' | 'done';

async function promptTicketTransition(
  provider: TicketsProvider,
  ticketId: string,
  direction: TransitionDirection,
  mode: 'always' | 'ask' | 'never',
): Promise<void> {
  const [statuses, currentTicket] = await Promise.all([
    provider.getStatuses?.() ?? Promise.resolve(undefined),
    provider.getTicket(ticketId),
  ]);

  const isDone = direction === 'done';
  const defaultStatusPattern = isDone
    ? /done|complete|closed|shipped|resolved/i
    : /in[\s-]?progress/i;
  const fallbackPattern = isDone ? null : /\bstarted\b|\bworking\b|\bdoing\b/i;
  const fallbackDefault = isDone ? 'Done' : 'In Progress';
  const promptMessage = isDone ? 'Done status:' : 'In progress status:';
  const confirmMessage = isDone
    ? `Mark ticket ${ticketId} as done?`
    : `Mark ticket ${ticketId} as in progress?`;
  const spinnerMessage = (status: string) =>
    isDone ? `Marking ${ticketId} as "${status}"...` : `Marking ${ticketId} as "${status}"...`;

  let targetStatus: string;
  if (statuses && statuses.length > 0) {
    const defaultStatus =
      statuses.find((s) => defaultStatusPattern.test(s)) ??
      (fallbackPattern ? statuses.find((s) => fallbackPattern.test(s) && !/not/i.test(s)) : null) ??
      (isDone ? statuses[statuses.length - 1]! : statuses[0]!);

    if (mode === 'always') {
      targetStatus = defaultStatus;
    } else {
      targetStatus = await select({
        message: promptMessage,
        options: statuses.map((s) => ({ value: s, label: s })),
        initialValue: defaultStatus,
      });
    }
  } else if (mode === 'always') {
    targetStatus = fallbackDefault;
  } else {
    targetStatus = await text({ message: promptMessage, initialValue: fallbackDefault });
  }

  if (currentTicket.status.toLowerCase() === targetStatus.toLowerCase()) return;

  if (mode === 'ask') {
    const ok = await confirm({ message: confirmMessage, initialValue: true });
    if (!ok) return;
  }

  await withSpinner(spinnerMessage(targetStatus), () =>
    provider.transitionTicket(ticketId, targetStatus),
  );
  console.log(theme.success(`  ${symbols.success} Ticket ${ticketId} marked as "${targetStatus}"`));
}
/**
 * Prompts the user to transition a ticket to a "done" status after a branch is merged.
 * Non-fatal — silently skips if no provider is configured or the call fails.
 *
 * @param _projectId - Unused (kept for backward compat); registry resolves projectId internally
 * @param ticketId - Ticket key (e.g. MORG-42)
 * @param mode - 'always': auto-transition; 'ask': prompt user; 'never': skip
 */
export async function promptTicketDone(
  _projectId: string,
  ticketId: string,
  mode: 'always' | 'ask' | 'never' = 'ask',
): Promise<void> {
  if (mode === 'never') return;
  const provider = await registry.tickets().catch(() => null);
  if (!provider) return;
  try {
    await promptTicketTransition(provider, ticketId, 'done', mode);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(theme.warning(`  ${symbols.warning} Could not update ticket ${ticketId}: ${msg}`));
  }
}

/**
 * Transitions a ticket to an "in progress" status when starting a branch.
 * Non-fatal — silently skips if no provider is configured or the call fails.
 *
 * @param _projectId - Unused (kept for backward compat); registry resolves projectId internally
 * @param ticketId - Ticket key (e.g. MORG-42)
 * @param mode - 'always': auto-transition; 'ask': prompt user; 'never': skip
 */
export async function promptTicketInProgress(
  _projectId: string,
  ticketId: string,
  mode: 'always' | 'ask' | 'never' = 'ask',
): Promise<void> {
  if (mode === 'never') return;
  const provider = await registry.tickets().catch(() => null);
  if (!provider) return;
  try {
    await promptTicketTransition(provider, ticketId, 'inProgress', mode);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(theme.warning(`  ${symbols.warning} Could not update ticket ${ticketId}: ${msg}`));
  }
}
