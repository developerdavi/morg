import { Client } from '@notionhq/client';
import type {
  PageObjectResponse,
  QueryDataSourceParameters,
} from '@notionhq/client/build/src/api-endpoints';
import type { NotionGlobalConfig, NotionProjectConfig } from '../../config/schemas';
import type { Ticket, TicketsProvider } from '../providers/types';

export class NotionClient implements TicketsProvider {
  private readonly client: Client;

  constructor(
    private readonly globalConfig: NotionGlobalConfig,
    private readonly projectConfig: NotionProjectConfig,
  ) {
    this.client = new Client({ auth: globalConfig.apiToken });
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

    const res = await this.client.dataSources.query({
      data_source_id: this.projectConfig.databaseId,
      filter,
    });
    const page = res.results.find((r): r is PageObjectResponse => r.object === 'page');
    if (!page) throw new Error(`Ticket ${ticketId} not found in Notion`);
    return this.mapPage(page);
  }

  async listTickets(opts?: { status?: string }): Promise<Ticket[]> {
    const filter: QueryDataSourceParameters['filter'] = opts?.status
      ? {
          property: this.projectConfig.statusProperty,
          status: { equals: opts.status },
        }
      : undefined;
    const res = await this.client.dataSources.query({
      data_source_id: this.projectConfig.databaseId,
      ...(filter ? { filter } : {}),
    });
    return res.results
      .filter((r): r is PageObjectResponse => r.object === 'page')
      .map((p) => this.mapPage(p));
  }

  async transitionTicket(ticketId: string, transitionName: string): Promise<void> {
    const ticket = await this.getTicket(ticketId);
    await this.client.pages.update({
      page_id: ticket.id,
      properties: {
        [this.projectConfig.statusProperty]: { status: { name: transitionName } },
      },
    });
  }

  private mapPage(page: PageObjectResponse): Ticket {
    const props = page.properties;

    const titleProp = props[this.projectConfig.titleProperty];
    const title =
      titleProp?.type === 'title'
        ? (titleProp.title[0]?.plain_text ?? '')
        : titleProp?.type === 'rich_text'
          ? (titleProp.rich_text[0]?.plain_text ?? '')
          : '';

    const statusProp = props[this.projectConfig.statusProperty];
    const status =
      statusProp?.type === 'status'
        ? (statusProp.status?.name ?? '')
        : statusProp?.type === 'select'
          ? (statusProp.select?.name ?? '')
          : '';

    const idProp = props[this.projectConfig.idProperty];
    const key =
      idProp?.type === 'rich_text'
        ? (idProp.rich_text[0]?.plain_text ?? page.id)
        : idProp?.type === 'unique_id'
          ? `${idProp.unique_id.prefix ?? ''}-${idProp.unique_id.number}`
          : page.id;

    return {
      id: page.id,
      key,
      title,
      status,
      url: page.url,
    };
  }
}
