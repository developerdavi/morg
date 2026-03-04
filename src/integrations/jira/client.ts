import { z } from 'zod';
import type { JiraGlobalConfig, JiraProjectConfig } from '../../config/schemas';
import { IntegrationError } from '../../utils/errors';

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

export class JiraClient {
  constructor(
    private readonly config: JiraGlobalConfig,
    private readonly _projectConfig?: JiraProjectConfig,
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
