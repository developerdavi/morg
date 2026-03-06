import { configManager } from '../config/manager';
import { requireTrackedRepo } from '../utils/detect';
import { GhClient } from '../integrations/providers/github/github-client';
import { JiraClient } from '../integrations/providers/tickets/implementations/jira-tickets-provider';
import { NotionClient } from '../integrations/providers/tickets/implementations/notion-tickets-provider';
import { ClaudeClient } from '../integrations/providers/ai/implementations/claude-ai-provider';
import { SlackClient } from '../integrations/providers/messaging/implementations/slack-messaging-provider';
import type { TicketsProvider } from '../integrations/providers/tickets/tickets-provider';
import type { AIProvider } from '../integrations/providers/ai/ai-provider';
import type { MessagingProvider } from '../integrations/providers/messaging/messaging-provider';

class Registry {
  // Lazily resolved once per process — safe because each CLI run is one process / one project
  private _projectId: string | null = null;

  private async pid(): Promise<string> {
    if (!this._projectId) this._projectId = await requireTrackedRepo();
    return this._projectId;
  }

  async gh(): Promise<GhClient> {
    const pid = await this.pid();
    const globalConfig = await configManager.getGlobalConfig(pid);
    return new GhClient(globalConfig.githubUsername);
  }

  async tickets(): Promise<TicketsProvider | null> {
    const pid = await this.pid();
    const [globalConfig, projectConfig] = await Promise.all([
      configManager.getGlobalConfig(pid),
      configManager.getProjectConfig(pid),
    ]);
    if (globalConfig.integrations.jira?.enabled && projectConfig.integrations.jira?.enabled) {
      return new JiraClient(globalConfig.integrations.jira, projectConfig.integrations.jira);
    }
    if (globalConfig.integrations.notion?.enabled && projectConfig.integrations.notion?.enabled) {
      return new NotionClient(globalConfig.integrations.notion, projectConfig.integrations.notion);
    }
    return null;
  }

  async ai(): Promise<AIProvider | null> {
    const globalConfig = await configManager.getGlobalConfig(await this.pid());
    return globalConfig.anthropicApiKey ? new ClaudeClient(globalConfig.anthropicApiKey) : null;
  }

  async messaging(): Promise<MessagingProvider | null> {
    const globalConfig = await configManager.getGlobalConfig(await this.pid());
    return globalConfig.integrations.slack?.enabled
      ? new SlackClient(globalConfig.integrations.slack)
      : null;
  }
}

// Singleton — import and use directly
export const registry = new Registry();
