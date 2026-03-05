import type { GlobalConfig, ProjectConfig } from '../config/schemas';
import { JiraClient } from '../integrations/jira/client';
import { NotionClient } from '../integrations/notion/client';
import { ClaudeClient } from '../integrations/claude/client';
import type { TicketsProvider, AIProvider } from '../integrations/providers/types';

export function getTicketsProvider(
  globalConfig: GlobalConfig,
  projectConfig: ProjectConfig,
): TicketsProvider | null {
  if (globalConfig.integrations.jira?.enabled && projectConfig.integrations.jira?.enabled) {
    return new JiraClient(globalConfig.integrations.jira, projectConfig.integrations.jira);
  }
  if (globalConfig.integrations.notion?.enabled && projectConfig.integrations.notion?.enabled) {
    return new NotionClient(globalConfig.integrations.notion, projectConfig.integrations.notion);
  }
  return null;
}

export function getAIProvider(globalConfig: GlobalConfig): AIProvider | null {
  if (globalConfig.anthropicApiKey) {
    return new ClaudeClient(globalConfig.anthropicApiKey);
  }
  return null;
}
