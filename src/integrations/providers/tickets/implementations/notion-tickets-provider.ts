import type { NotionGlobalConfig, NotionProjectConfig } from '../../../../config/schemas';
import { IntegrationError } from '../../../../utils/errors';
import type { Ticket, TicketsProvider } from '../tickets-provider';

const BASE_URL = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

type RichTextItem = { plain_text: string };
type NotionBlock = {
  type: string;
  [key: string]: unknown;
};

type NotionProperty = {
  type: string;
  title?: RichTextItem[];
  rich_text?: RichTextItem[];
  status?: { name: string } | null;
  select?: { name: string } | null;
  unique_id?: { prefix: string | null; number: number | null };
};

type NotionPage = {
  object: string;
  id: string;
  url: string;
  properties: Record<string, NotionProperty>;
};

export class NotionClient implements TicketsProvider {
  private readonly headers: Record<string, string>;

  constructor(
    private readonly globalConfig: NotionGlobalConfig,
    private readonly projectConfig: NotionProjectConfig,
  ) {
    this.headers = {
      Authorization: `Bearer ${globalConfig.apiToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    };
  }

  private async queryDatabase(body: Record<string, unknown>): Promise<NotionPage[]> {
    const res = await fetch(`${BASE_URL}/databases/${this.projectConfig.databaseId}/query`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new IntegrationError(
        `Notion API error ${res.status}: ${err.message ?? res.statusText}`,
        'notion',
        'Check your Notion API token and database ID.',
      );
    }
    const data = (await res.json()) as { results: NotionPage[] };
    return data.results.filter((r) => r.object === 'page');
  }

  async getTicket(ticketId: string): Promise<Ticket> {
    const uniqueIdMatch = ticketId.match(/^[A-Z]+-(\d+)$/);
    const filter = uniqueIdMatch
      ? {
          property: this.projectConfig.idProperty,
          unique_id: { equals: parseInt(uniqueIdMatch[1]!, 10) },
        }
      : {
          property: this.projectConfig.idProperty,
          rich_text: { equals: ticketId },
        };

    const pages = await this.queryDatabase({ filter });
    const page = pages[0];
    if (!page)
      throw new IntegrationError(
        `Ticket ${ticketId} not found in Notion`,
        'notion',
        'Check the ticket ID and your Notion database configuration.',
      );

    const [ticket, description] = await Promise.all([
      Promise.resolve(this.mapPage(page)),
      this.fetchPageContent(page.id),
    ]);
    return { ...ticket, description };
  }

  async listTickets(opts?: { status?: string; history?: boolean }): Promise<Ticket[]> {
    const body: Record<string, unknown> = {
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
      page_size: 100,
    };
    if (opts?.status) {
      body.filter = {
        property: this.projectConfig.statusProperty,
        status: { equals: opts.status },
      };
    }
    const pages = await this.queryDatabase(body);
    return pages.map((p) => this.mapPage(p));
  }

  async getStatuses(): Promise<string[]> {
    const res = await fetch(`${BASE_URL}/databases/${this.projectConfig.databaseId}`, {
      headers: this.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const db = (await res.json()) as {
      properties: Record<string, { type: string; status?: { options: { name: string }[] } }>;
    };
    const prop = db.properties[this.projectConfig.statusProperty];
    if (prop?.type === 'status' && Array.isArray(prop.status?.options)) {
      return prop.status!.options.map((o) => o.name);
    }
    return [];
  }

  async transitionTicket(ticketId: string, transitionName: string): Promise<void> {
    const ticket = await this.getTicket(ticketId);
    const res = await fetch(`${BASE_URL}/pages/${ticket.id}`, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify({
        properties: {
          [this.projectConfig.statusProperty]: {
            type: 'status',
            status: { name: transitionName },
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new IntegrationError(
        `Notion API error ${res.status}: ${err.message ?? res.statusText}`,
        'notion',
        'Check your Notion API token and database permissions.',
      );
    }
  }

  private async fetchPageContent(pageId: string): Promise<string> {
    const res = await fetch(`${BASE_URL}/blocks/${pageId}/children`, {
      headers: this.headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return '';
    const data = (await res.json()) as { results: NotionBlock[] };

    const lines: string[] = [];
    for (const block of data.results) {
      const content = block[block.type] as { rich_text?: RichTextItem[] } | undefined;
      const text = content?.rich_text?.map((t) => t.plain_text).join('') ?? '';
      if (!text) continue;
      switch (block.type) {
        case 'heading_1':
          lines.push(`# ${text}`);
          break;
        case 'heading_2':
          lines.push(`## ${text}`);
          break;
        case 'heading_3':
          lines.push(`### ${text}`);
          break;
        case 'bulleted_list_item':
          lines.push(`• ${text}`);
          break;
        case 'numbered_list_item':
          lines.push(`- ${text}`);
          break;
        case 'code':
          lines.push(`\`${text}\``);
          break;
        case 'quote':
          lines.push(`> ${text}`);
          break;
        default:
          lines.push(text);
          break;
      }
    }
    return lines.join('\n');
  }

  private mapPage(page: NotionPage): Ticket {
    const props = page.properties;

    const titleProp = props[this.projectConfig.titleProperty];
    const title =
      titleProp?.title?.map((t) => t.plain_text).join('') ??
      titleProp?.rich_text?.map((t) => t.plain_text).join('') ??
      '';

    const statusProp = props[this.projectConfig.statusProperty];
    const status = statusProp?.status?.name ?? statusProp?.select?.name ?? '';

    const idProp = props[this.projectConfig.idProperty];
    const key = idProp?.unique_id
      ? `${idProp.unique_id.prefix ?? ''}-${idProp.unique_id.number}`
      : (idProp?.rich_text?.[0]?.plain_text ?? page.id);

    return { id: page.id, key, title, status, url: page.url };
  }
}
