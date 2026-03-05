import type { NotionGlobalConfig, NotionProjectConfig } from '../../config/schemas';
import type { Ticket, TicketsProvider } from '../providers/types';

const BASE_URL = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

type RichTextItem = { plain_text: string };
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
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(`Notion API error ${res.status}: ${err.message ?? res.statusText}`);
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
    if (!page) throw new Error(`Ticket ${ticketId} not found in Notion`);
    return this.mapPage(page);
  }

  async listTickets(opts?: { status?: string }): Promise<Ticket[]> {
    const body: Record<string, unknown> = opts?.status
      ? {
          filter: {
            property: this.projectConfig.statusProperty,
            status: { equals: opts.status },
          },
        }
      : {};
    const pages = await this.queryDatabase(body);
    return pages.map((p) => this.mapPage(p));
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
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(`Notion API error ${res.status}: ${err.message ?? res.statusText}`);
    }
  }

  private mapPage(page: NotionPage): Ticket {
    const props = page.properties;

    const titleProp = props[this.projectConfig.titleProperty];
    const title = titleProp?.title?.[0]?.plain_text ?? titleProp?.rich_text?.[0]?.plain_text ?? '';

    const statusProp = props[this.projectConfig.statusProperty];
    const status = statusProp?.status?.name ?? statusProp?.select?.name ?? '';

    const idProp = props[this.projectConfig.idProperty];
    const key = idProp?.unique_id
      ? `${idProp.unique_id.prefix ?? ''}-${idProp.unique_id.number}`
      : (idProp?.rich_text?.[0]?.plain_text ?? page.id);

    return { id: page.id, key, title, status, url: page.url };
  }
}
