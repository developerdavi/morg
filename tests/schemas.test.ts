import { describe, it, expect } from 'vitest';
import { GlobalConfigSchema, BranchSchema, ProjectsFileSchema } from '../src/config/schemas';

describe('GlobalConfigSchema', () => {
  it('parses valid config', () => {
    const raw = {
      version: 1,
      githubUsername: 'devdavi',
      anthropicApiKey: 'sk-ant-abc123',
      integrations: {
        jira: {
          enabled: true,
          baseUrl: 'https://devdavi.atlassian.net',
          userEmail: 'dev@example.com',
          apiToken: 'jira-token',
        },
      },
    };
    expect(() => GlobalConfigSchema.parse(raw)).not.toThrow();
  });

  it('defaults integrations to {}', () => {
    const raw = {
      version: 1,
      githubUsername: 'devdavi',
      anthropicApiKey: 'sk-ant-abc123',
    };
    const result = GlobalConfigSchema.parse(raw);
    expect(result.integrations).toEqual({});
  });

  it('rejects wrong version', () => {
    const raw = { version: 2, githubUsername: 'x', anthropicApiKey: 'sk-ant-x', integrations: {} };
    expect(() => GlobalConfigSchema.parse(raw)).toThrow();
  });
});

describe('BranchSchema', () => {
  const validBranch = {
    id: 'branch_123',
    branchName: 'feat/MORG-1',
    ticketId: 'MORG-1',
    ticketTitle: 'My branch',
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    prNumber: null,
    prUrl: null,
    prStatus: null,
  };

  it('parses a valid branch', () => {
    expect(() => BranchSchema.parse(validBranch)).not.toThrow();
  });

  it('accepts all valid statuses', () => {
    const statuses = ['active', 'pr_open', 'pr_merged', 'done', 'abandoned'] as const;
    for (const status of statuses) {
      expect(() => BranchSchema.parse({ ...validBranch, status })).not.toThrow();
    }
  });

  it('rejects invalid status', () => {
    expect(() => BranchSchema.parse({ ...validBranch, status: 'unknown' })).toThrow();
  });
});

describe('ProjectsFileSchema', () => {
  it('parses valid projects file', () => {
    const raw = {
      version: 1,
      projects: [
        {
          id: 'morg',
          name: 'morg',
          path: '/Users/devdavi/www/devdavi/morg',
          createdAt: new Date().toISOString(),
        },
      ],
    };
    expect(() => ProjectsFileSchema.parse(raw)).not.toThrow();
  });
});
