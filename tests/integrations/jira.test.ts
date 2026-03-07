import { vi, describe, it, expect, beforeEach } from 'vitest';
import { JiraClient } from '../../src/integrations/providers/tickets/implementations/jira-tickets-provider';
import { IntegrationError } from '../../src/utils/errors';

const globalConfig = {
  enabled: true,
  baseUrl: 'https://test.atlassian.net',
  userEmail: 'user@test.com',
  apiToken: 'test-token',
};

const projectConfig = {
  enabled: true,
  projectKey: 'MORG',
  defaultTransitions: { start: 'In Progress', done: 'Done' },
};

const jiraIssuePayload = {
  id: '10001',
  key: 'MORG-1',
  fields: {
    summary: 'Test ticket title',
    status: { name: 'To Do' },
    assignee: { displayName: 'Jane Doe', emailAddress: 'jane@test.com' },
    description: null,
  },
};

describe('JiraClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTicket', () => {
    it('returns a normalized Ticket from a Jira issue', async () => {
      vi.stubGlobal('fetch', vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(jiraIssuePayload),
        })
        // getChildIssues secondary fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ issues: [] }),
        }),
      );

      const client = new JiraClient(globalConfig, projectConfig);
      const ticket = await client.getTicket('MORG-1');

      expect(ticket.key).toBe('MORG-1');
      expect(ticket.title).toBe('Test ticket title');
      expect(ticket.status).toBe('To Do');
      expect(ticket.url).toBe('https://test.atlassian.net/browse/MORG-1');
      expect(ticket.assignee?.name).toBe('Jane Doe');
    });

    it('throws IntegrationError on HTTP 401', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
      }));

      const client = new JiraClient(globalConfig, projectConfig);
      await expect(client.getTicket('MORG-1')).rejects.toBeInstanceOf(IntegrationError);
    });
  });

  describe('listTickets', () => {
    it('returns an array of tickets', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ issues: [jiraIssuePayload] }),
      }));

      const client = new JiraClient(globalConfig, projectConfig);
      const tickets = await client.listTickets();

      expect(tickets).toHaveLength(1);
      expect(tickets[0]?.key).toBe('MORG-1');
    });

    it('throws IntegrationError on HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
      }));

      const client = new JiraClient(globalConfig, projectConfig);
      await expect(client.listTickets()).rejects.toBeInstanceOf(IntegrationError);
    });
  });

  describe('transitionIssue', () => {
    it('calls the transitions endpoint and posts the transition id', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            transitions: [{ id: '21', name: 'In Progress' }],
          }),
        })
        .mockResolvedValueOnce({ ok: true });

      vi.stubGlobal('fetch', mockFetch);

      const client = new JiraClient(globalConfig, projectConfig);
      await client.transitionIssue('MORG-1', 'In Progress');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const postCall = mockFetch.mock.calls[1];
      expect(postCall?.[1]?.method).toBe('POST');
    });

    it('throws IntegrationError when transition name is not found', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ transitions: [] }),
      }));

      const client = new JiraClient(globalConfig, projectConfig);
      await expect(client.transitionIssue('MORG-1', 'Nonexistent')).rejects.toBeInstanceOf(IntegrationError);
    });
  });
});
