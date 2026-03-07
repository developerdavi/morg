import { z } from 'zod';
import type { JiraGlobalConfig, JiraProjectConfig } from '../../../../config/schemas';
import { IntegrationError } from '../../../../utils/errors';
import type { Ticket, TicketsProvider } from '../tickets-provider';

const JiraIssueRefSchema = z.object({
  key: z.string(),
  fields: z.object({
    summary: z.string(),
    status: z.object({ name: z.string() }),
  }),
});

const JiraIssueSchema = z.object({
  id: z.string(),
  key: z.string(),
  fields: z.object({
    summary: z.string(),
    status: z.object({ name: z.string() }),
    issuetype: z.object({ name: z.string() }).optional(),
    assignee: z.object({ displayName: z.string(), emailAddress: z.string() }).nullable().optional(),
    description: z.unknown().optional(),
    parent: JiraIssueRefSchema.optional().nullable(),
    subtasks: z.array(JiraIssueRefSchema).optional(),
    issuelinks: z
      .array(
        z.object({
          type: z.object({ name: z.string(), inward: z.string(), outward: z.string() }),
          inwardIssue: JiraIssueRefSchema.optional(),
          outwardIssue: JiraIssueRefSchema.optional(),
        }),
      )
      .optional(),
  }),
});

export type JiraIssue = z.infer<typeof JiraIssueSchema>;

/** Convert Atlassian Document Format (ADF) to markdown. Links are preserved as [text](url). */
function adfToMarkdown(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as {
    type?: string;
    text?: string;
    content?: unknown[];
    marks?: { type: string; attrs?: { href?: string } }[];
    attrs?: { level?: number; url?: string };
  };

  if (n.type === 'hardBreak') return '\n';
  if (n.type === 'inlineCard') return n.attrs?.url ? `<${n.attrs.url}>` : '';

  if (n.type === 'text') {
    const text = n.text ?? '';
    const linkMark = n.marks?.find((m) => m.type === 'link');
    if (linkMark?.attrs?.href) return `[${text}](${linkMark.attrs.href})`;
    const codeMark = n.marks?.find((m) => m.type === 'code');
    if (codeMark) return `\`${text}\``;
    return text;
  }

  const children = n.content?.map(adfToMarkdown).join('') ?? '';

  if (n.type === 'paragraph') return children + '\n';
  if (n.type === 'heading') return `${'#'.repeat(n.attrs?.level ?? 1)} ${children}\n`;
  if (n.type === 'listItem') return `• ${children.trimEnd()}\n`;
  if (n.type === 'bulletList' || n.type === 'orderedList') return children;
  if (n.type === 'codeBlock') return `\`\`\`\n${children}\`\`\`\n`;
  if (n.type === 'blockquote')
    return (
      children
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n') + '\n'
    );
  if (n.type === 'rule') return '---\n';
  return children;
}

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
    const res = await fetch(this.url(`/issue/${ticketId}`), {
      headers: this.headers,
      signal: AbortSignal.timeout(10_000),
    });
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

  async getChildIssues(ticketId: string): Promise<z.infer<typeof JiraIssueRefSchema>[]> {
    const jql = `parent = "${ticketId}" ORDER BY created ASC`;
    const res = await fetch(
      this.url(`/search/jql?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary,status`),
      { headers: this.headers, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { issues: unknown[] };
    return data.issues.flatMap((raw) => {
      try {
        return [JiraIssueRefSchema.parse(raw)];
      } catch {
        return [];
      }
    });
  }

  async getTicket(ticketId: string): Promise<Ticket> {
    const issue = await this.getIssue(ticketId);
    const description = issue.fields.description
      ? adfToMarkdown(issue.fields.description).trim() || undefined
      : undefined;

    const parent = issue.fields.parent
      ? {
          key: issue.fields.parent.key,
          title: issue.fields.parent.fields.summary,
          status: issue.fields.parent.fields.status.name,
          url: `${this.config.baseUrl}/browse/${issue.fields.parent.key}`,
        }
      : null;

    // fields.subtasks only contains actual Sub-task type issues.
    // Epic children (Features/Stories) are only accessible via JQL parent = key.
    // Fetch both and merge.
    const directSubtasks = (issue.fields.subtasks ?? []).map((s) => ({
      key: s.key,
      title: s.fields.summary,
      status: s.fields.status.name,
      url: `${this.config.baseUrl}/browse/${s.key}`,
    }));

    const childIssues = await this.getChildIssues(issue.key);
    const directSubtaskKeys = new Set(directSubtasks.map((s) => s.key));
    const epicChildren = childIssues
      .filter((c) => !directSubtaskKeys.has(c.key))
      .map((c) => ({
        key: c.key,
        title: c.fields.summary,
        status: c.fields.status.name,
        url: `${this.config.baseUrl}/browse/${c.key}`,
      }));

    const subtasks = [...directSubtasks, ...epicChildren];

    const issueLinks = (issue.fields.issuelinks ?? []).flatMap((l) => {
      if (l.inwardIssue) {
        return [
          {
            type: l.type.inward,
            ticket: {
              key: l.inwardIssue.key,
              title: l.inwardIssue.fields.summary,
              status: l.inwardIssue.fields.status.name,
              url: `${this.config.baseUrl}/browse/${l.inwardIssue.key}`,
            },
          },
        ];
      }
      if (l.outwardIssue) {
        return [
          {
            type: l.type.outward,
            ticket: {
              key: l.outwardIssue.key,
              title: l.outwardIssue.fields.summary,
              status: l.outwardIssue.fields.status.name,
              url: `${this.config.baseUrl}/browse/${l.outwardIssue.key}`,
            },
          },
        ];
      }
      return [];
    });

    return {
      id: issue.key,
      key: issue.key,
      title: issue.fields.summary,
      status: issue.fields.status.name,
      issueType: issue.fields.issuetype?.name,
      url: `${this.config.baseUrl}/browse/${issue.key}`,
      assignee: issue.fields.assignee
        ? { name: issue.fields.assignee.displayName, email: issue.fields.assignee.emailAddress }
        : null,
      description,
      parent,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
      issueLinks: issueLinks.length > 0 ? issueLinks : undefined,
    };
  }

  async listTickets(opts?: { status?: string }): Promise<Ticket[]> {
    const projectKey = this.projectConfig?.projectKey;

    const clauses = [
      'issue in issueHistory()',
      'assignee = currentUser()',
      projectKey ? `project="${projectKey}"` : null,
      opts?.status ? `status="${opts.status}"` : null,
    ].filter(Boolean);
    const jql = clauses.join(' AND ');
    const orderBy = 'ORDER BY lastViewed DESC';

    const fields = 'summary,status,assignee,issuetype';
    const res = await fetch(
      this.url(
        `/search/jql?jql=${encodeURIComponent(`${jql} ${orderBy}`)}&maxResults=50&fields=${fields}`,
      ),
      { headers: this.headers, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) throw new IntegrationError(`Failed to list Jira issues (${res.status})`, 'jira');
    const data = (await res.json()) as { issues: unknown[] };
    return data.issues.map((raw) => {
      const issue = JiraIssueSchema.parse(raw);
      return {
        id: issue.key,
        key: issue.key,
        title: issue.fields.summary,
        status: issue.fields.status.name,
        issueType: issue.fields.issuetype?.name,
        url: `${this.config.baseUrl}/browse/${issue.key}`,
        assignee: issue.fields.assignee
          ? { name: issue.fields.assignee.displayName, email: issue.fields.assignee.emailAddress }
          : null,
      };
    });
  }

  async getStatuses(): Promise<string[]> {
    if (this.projectConfig?.projectKey) {
      const res = await fetch(this.url(`/project/${this.projectConfig.projectKey}/statuses`), {
        headers: this.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { statuses: { name: string }[] }[];
        return [...new Set(data.flatMap((t) => t.statuses.map((s) => s.name)))];
      }
    }
    const res = await fetch(this.url('/status'), {
      headers: this.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok)
      throw new IntegrationError(`Failed to fetch Jira statuses (${res.status})`, 'jira');
    const data = (await res.json()) as { name: string }[];
    return data.map((s) => s.name);
  }

  async transitionTicket(ticketId: string, transitionName: string): Promise<void> {
    return this.transitionIssue(ticketId, transitionName);
  }

  async transitionIssue(ticketId: string, transitionName: string): Promise<void> {
    const tRes = await fetch(this.url(`/issue/${ticketId}/transitions`), {
      headers: this.headers,
      signal: AbortSignal.timeout(10_000),
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
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new IntegrationError(`Failed to transition ${ticketId} to "${transitionName}"`, 'jira');
    }
  }
}
