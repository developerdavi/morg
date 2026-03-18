import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Branch, BranchesFile } from '../src/config/schemas';

vi.mock('../src/utils/detect', () => ({
  requireTrackedRepo: vi.fn(),
}));

vi.mock('../src/config/manager', () => ({
  configManager: {
    getBranches: vi.fn(),
  },
}));

import { requireTrackedRepo } from '../src/utils/detect';
import { configManager } from '../src/config/manager';

const mockRequireTrackedRepo = requireTrackedRepo as ReturnType<typeof vi.fn>;
const mockGetBranches = configManager.getBranches as ReturnType<typeof vi.fn>;

function makeBranch(overrides: Partial<Branch>): Branch {
  return {
    id: 'test-id',
    branchName: 'feature/test',
    ticketId: null,
    ticketTitle: null,
    ticketUrl: null,
    status: 'active',
    prNumber: null,
    prUrl: null,
    prStatus: null,
    worktreePath: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastAccessedAt: new Date().toISOString(),
    ...overrides,
  };
}

// Dynamically import the module to get the action handler
async function runCompletions(type?: string): Promise<string> {
  const { registerCompletionsCommand } = await import('../src/commands/completions');
  const { Command } = await import('commander');
  const program = new Command();
  registerCompletionsCommand(program);

  const output: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => output.push(String(args[0]));

  try {
    await program.parseAsync(['node', 'test', '_completions', ...(type ? [type] : [])]);
  } finally {
    console.log = origLog;
  }

  return output.join('\n');
}

describe('_completions command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireTrackedRepo.mockResolvedValue('project-123');
  });

  describe('branches type', () => {
    it('outputs active and pr_open branch names', async () => {
      const branchesFile: BranchesFile = {
        version: 1,
        branches: [
          makeBranch({ branchName: 'feature/one', status: 'active' }),
          makeBranch({ branchName: 'feature/two', status: 'pr_open' }),
          makeBranch({ branchName: 'feature/done', status: 'done' }),
          makeBranch({ branchName: 'feature/abandoned', status: 'abandoned' }),
        ],
      };
      mockGetBranches.mockResolvedValue(branchesFile);

      const output = await runCompletions('branches');
      expect(output).toBe('feature/one\nfeature/two');
    });

    it('outputs nothing when no branches exist', async () => {
      mockGetBranches.mockResolvedValue({ version: 1, branches: [] });

      const output = await runCompletions('branches');
      expect(output).toBe('');
    });
  });

  describe('tickets type', () => {
    it('outputs deduplicated ticket IDs', async () => {
      const branchesFile: BranchesFile = {
        version: 1,
        branches: [
          makeBranch({ branchName: 'feature/one', ticketId: 'MORG-1' }),
          makeBranch({ branchName: 'feature/two', ticketId: 'MORG-2' }),
          makeBranch({ branchName: 'feature/three', ticketId: 'MORG-1' }),
          makeBranch({ branchName: 'feature/no-ticket', ticketId: null }),
        ],
      };
      mockGetBranches.mockResolvedValue(branchesFile);

      const output = await runCompletions('tickets');
      expect(output).toBe('MORG-1\nMORG-2');
    });
  });

  describe('error handling', () => {
    it('outputs nothing when repo is not tracked', async () => {
      mockRequireTrackedRepo.mockRejectedValue(new Error('Not tracked'));

      const output = await runCompletions('branches');
      expect(output).toBe('');
    });

    it('outputs nothing when getBranches fails', async () => {
      mockGetBranches.mockRejectedValue(new Error('File not found'));

      const output = await runCompletions('branches');
      expect(output).toBe('');
    });

    it('outputs nothing for unknown type', async () => {
      mockGetBranches.mockResolvedValue({ version: 1, branches: [] });

      const output = await runCompletions('unknown');
      expect(output).toBe('');
    });
  });
});
