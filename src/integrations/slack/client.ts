import { WebClient } from '@slack/web-api';
import type { SlackGlobalConfig } from '../../config/schemas';
import { IntegrationError } from '../../utils/errors';

export class SlackClient {
  private readonly client: WebClient;

  constructor(private readonly config: SlackGlobalConfig) {
    this.client = new WebClient(config.apiToken);
  }

  async postMessage(channel: string, text: string): Promise<string> {
    const result = await this.client.chat.postMessage({ channel, text });
    if (!result.ok) {
      throw new IntegrationError(
        `Slack postMessage failed: ${result.error ?? 'unknown error'}`,
        'slack',
      );
    }
    return result.ts ?? '';
  }

  async getUserInfo(userId: string): Promise<{ name: string; email: string }> {
    const result = await this.client.users.info({ user: userId });
    if (!result.ok || !result.user) {
      throw new IntegrationError(`Could not fetch Slack user ${userId}`, 'slack');
    }
    return {
      name: result.user.real_name ?? result.user.name ?? userId,
      email: result.user.profile?.email ?? '',
    };
  }
}
