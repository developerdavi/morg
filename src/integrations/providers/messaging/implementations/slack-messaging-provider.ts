import { WebClient } from '@slack/web-api';
import type { SlackGlobalConfig } from '../../../../config/schemas';
import { IntegrationError } from '../../../../utils/errors';
import type { MessagingProvider } from '../messaging-provider';

export class SlackClient implements MessagingProvider {
  private readonly client: WebClient;

  constructor(private readonly config: SlackGlobalConfig) {
    this.client = new WebClient(config.apiToken);
  }

  async sendMessage(channel: string, text: string): Promise<void> {
    const result = await this.client.chat.postMessage({ channel, text });
    if (!result.ok) {
      throw new IntegrationError(
        `Slack postMessage failed: ${result.error ?? 'unknown error'}`,
        'slack',
      );
    }
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
