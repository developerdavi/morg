import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock dependencies before importing the registry
vi.mock('../../src/config/manager', () => ({
  configManager: {
    getGlobalConfig: vi.fn(),
    getProjectConfig: vi.fn(),
  },
}));

vi.mock('../../src/utils/detect', () => ({
  requireTrackedRepo: vi.fn().mockResolvedValue('test-project'),
}));

import { configManager } from '../../src/config/manager';

const mockGlobalConfigBase = {
  version: 1 as const,
  githubUsername: 'testuser',
  autoStash: 'ask' as const,
  autoDeleteMerged: 'ask' as const,
  autoUpdateTicketStatus: 'ask' as const,
  integrations: {},
};

const mockProjectConfigBase = {
  version: 1 as const,
  projectId: 'test-project',
  githubUsername: 'testuser',
  githubRepo: 'testuser/testrepo',
  defaultBranch: 'main',
  integrations: { github: { enabled: true } },
};

const mockConfigManager = configManager as {
  getGlobalConfig: ReturnType<typeof vi.fn>;
  getProjectConfig: ReturnType<typeof vi.fn>;
};

describe('registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfigManager.getGlobalConfig.mockResolvedValue(mockGlobalConfigBase);
    mockConfigManager.getProjectConfig.mockResolvedValue(mockProjectConfigBase);
  });

  describe('tickets()', () => {
    it('returns JiraClient when Jira is enabled at both levels', async () => {
      mockConfigManager.getGlobalConfig.mockResolvedValue({
        ...mockGlobalConfigBase,
        integrations: {
          jira: {
            enabled: true,
            baseUrl: 'https://test.atlassian.net',
            userEmail: 'a@b.com',
            apiToken: 'token',
          },
        },
      });
      mockConfigManager.getProjectConfig.mockResolvedValue({
        ...mockProjectConfigBase,
        integrations: {
          ...mockProjectConfigBase.integrations,
          jira: {
            enabled: true,
            projectKey: 'TEST',
            defaultTransitions: { start: 'In Progress', done: 'Done' },
          },
        },
      });

      const { registry } = await import('../../src/services/registry');
      const { JiraClient } = await import(
        '../../src/integrations/providers/tickets/implementations/jira-tickets-provider'
      );
      const provider = await registry.tickets();
      expect(provider).toBeInstanceOf(JiraClient);
    });

    it('returns NotionClient when Notion is enabled and Jira is not', async () => {
      mockConfigManager.getGlobalConfig.mockResolvedValue({
        ...mockGlobalConfigBase,
        integrations: { notion: { enabled: true, apiToken: 'secret_token' } },
      });
      mockConfigManager.getProjectConfig.mockResolvedValue({
        ...mockProjectConfigBase,
        integrations: {
          ...mockProjectConfigBase.integrations,
          notion: {
            enabled: true,
            databaseId: 'db-id',
            titleProperty: 'Task name',
            statusProperty: 'Status',
            idProperty: 'ID',
          },
        },
      });

      const { registry } = await import('../../src/services/registry');
      const { NotionClient } = await import(
        '../../src/integrations/providers/tickets/implementations/notion-tickets-provider'
      );
      const provider = await registry.tickets();
      expect(provider).toBeInstanceOf(NotionClient);
    });

    it('returns null when no integration is enabled', async () => {
      const { registry } = await import('../../src/services/registry');
      const provider = await registry.tickets();
      expect(provider).toBeNull();
    });
  });

  describe('ai()', () => {
    it('returns ClaudeClient when anthropicApiKey is present', async () => {
      mockConfigManager.getGlobalConfig.mockResolvedValue({
        ...mockGlobalConfigBase,
        anthropicApiKey: 'sk-ant-test-key',
      });

      const { registry } = await import('../../src/services/registry');
      const { ClaudeClient } = await import(
        '../../src/integrations/providers/ai/implementations/claude-ai-provider'
      );
      const provider = await registry.ai();
      expect(provider).toBeInstanceOf(ClaudeClient);
    });

    it('returns null when anthropicApiKey is absent', async () => {
      const { registry } = await import('../../src/services/registry');
      const provider = await registry.ai();
      expect(provider).toBeNull();
    });
  });

  describe('gh()', () => {
    it('returns a GhClient instance', async () => {
      const { registry } = await import('../../src/services/registry');
      const { GhClient } = await import('../../src/integrations/providers/github/github-client');
      const client = await registry.gh();
      expect(client).toBeInstanceOf(GhClient);
    });
  });
});
