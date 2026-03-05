import { z } from 'zod';
import type { JiraGlobalConfig, JiraProjectConfig } from '../../config/schemas';
import { IntegrationError } from '../../utils/errors';
import type { Ticket, TicketsProvider } from '../providers/types';

const JiraIssueSchema = z.object({
  id: z.string(),
  key: z.string(),
  fields: z.object({
    summary: z.string(),
    status: z.object({
      name: z.string(),
    }),
    assignee: z
      .object({
        displayName: z.string(),
        emailAddress: z.string(),
      })
      .nullable()
      .optional(),
    description: z.unknown().optional(),
  }),
});

export type JiraIssue = z.infer<typeof JiraIssueSchema>;

export class JiraClient implements TicketsProvider {
  constructor(
    private readonly config: JiraGlobalConfig,
    private readonly projectConfig?: JiraProjectConfig,
  ) {}

  private get headers(): Record<string, string> {
    const token = Buffer.from(`${this.config.userEmail}:${this.config.apiToken}`).toString(
      'base64',
    );
    return {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private url(path: string): string {
    return `${this.config.baseUrl}/rest/api/3${path}`;
  }

  async getIssue(ticketId: string): Promise<JiraIssue> {
    const res = await fetch(this.url(`/issue/${ticketId}`), { headers: this.headers });
    if (!res.ok) {
      throw new IntegrationError(
        `Jira returned ${res.status} for ${ticketId}`,
        'jira',
        'Check your JIRA_BASE_URL and JIRA_API_TOKEN',
      );
    }
    const data = await res.json();
    return JiraIssueSchema.parse(data);
  }

  async getTicket(ticketId: string): Promise<Ticket> {
    const issue = await this.getIssue(ticketId);
    return {
      id: issue.key,
      key: issue.key,
      title: issue.fields.summary,
      status: issue.fields.status.name,
      url: `${this.config.baseUrl}/browse/${issue.key}`,
      assignee: issue.fields.assignee
        ? { name: issue.fields.assignee.displayName, email: issue.fields.assignee.emailAddress }
        : null,
    };
  }

  async listTickets(opts?: { status?: string }): Promise<Ticket[]> {
    const projectKey = this.projectConfig?.projectKey;
    const jql = [
      projectKey ? `project="${projectKey}"` : null,
      opts?.status ? `status="${opts.status}"` : null,
    ]
      .filter(Boolean)
      .join(' AND ');
    const res = await fetch(this.url(`/search?jql=${encodeURIComponent(jql)}&maxResults=50`), {
      headers: this.headers,
    });
    if (!res.ok) throw new IntegrationError('Failed to list Jira issues', 'jira');
    const data = (await res.json()) as { issues: unknown[] };
    return data.issues.map((raw) => {
      const issue = JiraIssueSchema.parse(raw);
      return {
        id: issue.key,
        key: issue.key,
        title: issue.fields.summary,
        status: issue.fields.status.name,
        url: `${this.config.baseUrl}/browse/${issue.key}`,
        assignee: issue.fields.assignee
          ? { name: issue.fields.assignee.displayName, email: issue.fields.assignee.emailAddress }
          : null,
      };
    });
  }

  async getStatuses(): Promise<string[]> {
    try {
      if (this.projectConfig?.projectKey) {
        const res = await fetch(this.url(`/project/${this.projectConfig.projectKey}/statuses`), {
          headers: this.headers,
        });
        if (res.ok) {
          const data = (await res.json()) as { statuses: { name: string }[] }[];
          return [...new Set(data.flatMap((t) => t.statuses.map((s) => s.name)))];
        }
      }
      const res = await fetch(this.url('/status'), { headers: this.headers });
      if (!res.ok) return [];
      const data = (await res.json()) as { name: string }[];
      return data.map((s) => s.name);
    } catch {
      return [];
    }
  }

  async transitionTicket(ticketId: string, transitionName: string): Promise<void> {
    return this.transitionIssue(ticketId, transitionName);
  }

  async transitionIssue(ticketId: string, transitionName: string): Promise<void> {
    // Get available transitions
    const tRes = await fetch(this.url(`/issue/${ticketId}/transitions`), {
      headers: this.headers,
    });
    if (!tRes.ok) throw new IntegrationError(`Failed to get transitions for ${ticketId}`, 'jira');

    const tData = (await tRes.json()) as { transitions: { id: string; name: string }[] };
    const transition = tData.transitions.find(
      (t) => t.name.toLowerCase() === transitionName.toLowerCase(),
    );
    if (!transition) {
      throw new IntegrationError(
        `Transition "${transitionName}" not found for ${ticketId}`,
        'jira',
      );
    }

    const res = await fetch(this.url(`/issue/${ticketId}/transitions`), {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ transition: { id: transition.id } }),
    });
    if (!res.ok) {
      throw new IntegrationError(`Failed to transition ${ticketId} to "${transitionName}"`, 'jira');
    }
  }
}
