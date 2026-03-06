import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { TicketsProvider, Ticket } from '../../src/integrations/providers/tickets/tickets-provider';

// Mock the registry so providers tests don't require a real project
vi.mock('../../src/services/registry', () => ({
  registry: {
    tickets: vi.fn(),
  },
}));

// Mock UI to suppress spinner/prompt output
vi.mock('../../src/ui/spinner', () => ({
  withSpinner: vi.fn((_, fn: () => unknown) => fn()),
}));

vi.mock('../../src/ui/prompts', () => ({
  confirm: vi.fn().mockResolvedValue(true),
  select: vi.fn(),
  text: vi.fn(),
}));

import { registry } from '../../src/services/registry';
import { fetchTicket, promptTicketDone, promptTicketInProgress } from '../../src/utils/providers';

const mockRegistry = registry as { tickets: ReturnType<typeof vi.fn> };

function makeProvider(overrides: Partial<TicketsProvider> = {}): TicketsProvider {
  return {
    getTicket: vi.fn().mockResolvedValue({
      id: 'MORG-1',
      key: 'MORG-1',
      title: 'Test ticket',
      status: 'To Do',
      url: 'https://example.com/MORG-1',
    } satisfies Ticket),
    listTickets: vi.fn().mockResolvedValue([]),
    transitionTicket: vi.fn().mockResolvedValue(undefined),
    getStatuses: vi.fn().mockResolvedValue(['To Do', 'In Progress', 'Done']),
    ...overrides,
  };
}

describe('fetchTicket', () => {
  it('returns the ticket from the provider', async () => {
    const provider = makeProvider();
    const ticket = await fetchTicket(provider, 'MORG-1');
    expect(ticket.key).toBe('MORG-1');
    expect(provider.getTicket).toHaveBeenCalledWith('MORG-1');
  });
});

describe('promptTicketDone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when mode is never', async () => {
    const provider = makeProvider();
    mockRegistry.tickets.mockResolvedValue(provider);
    await promptTicketDone('proj', 'MORG-1', 'never');
    expect(provider.transitionTicket).not.toHaveBeenCalled();
  });

  it('does nothing when registry.tickets() returns null', async () => {
    mockRegistry.tickets.mockResolvedValue(null);
    await promptTicketDone('proj', 'MORG-1', 'ask');
    // No error thrown
  });

  it('auto-transitions when mode is always', async () => {
    const provider = makeProvider({
      getStatuses: vi.fn().mockResolvedValue(['To Do', 'In Progress', 'Done']),
    });
    mockRegistry.tickets.mockResolvedValue(provider);
    await promptTicketDone('proj', 'MORG-1', 'always');
    expect(provider.transitionTicket).toHaveBeenCalledWith('MORG-1', 'Done');
  });

  it('skips transition when ticket is already at the target status', async () => {
    const provider = makeProvider({
      getTicket: vi.fn().mockResolvedValue({
        id: 'MORG-1', key: 'MORG-1', title: 'Test', status: 'Done', url: null,
      }),
      getStatuses: vi.fn().mockResolvedValue(['To Do', 'In Progress', 'Done']),
    });
    mockRegistry.tickets.mockResolvedValue(provider);
    await promptTicketDone('proj', 'MORG-1', 'always');
    expect(provider.transitionTicket).not.toHaveBeenCalled();
  });
});

describe('promptTicketInProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does nothing when mode is never', async () => {
    const provider = makeProvider();
    mockRegistry.tickets.mockResolvedValue(provider);
    await promptTicketInProgress('proj', 'MORG-1', 'never');
    expect(provider.transitionTicket).not.toHaveBeenCalled();
  });

  it('auto-transitions to In Progress when mode is always', async () => {
    const provider = makeProvider({
      getStatuses: vi.fn().mockResolvedValue(['To Do', 'In Progress', 'Done']),
    });
    mockRegistry.tickets.mockResolvedValue(provider);
    await promptTicketInProgress('proj', 'MORG-1', 'always');
    expect(provider.transitionTicket).toHaveBeenCalledWith('MORG-1', 'In Progress');
  });
});
