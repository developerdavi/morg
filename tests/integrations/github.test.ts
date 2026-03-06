import { vi, describe, it, expect, beforeEach } from 'vitest';
import { execa } from 'execa';
import { GhClient, ghPrToPrStatus } from '../../src/integrations/github/client';

vi.mock('execa');

const mockExeca = execa as unknown as ReturnType<typeof vi.fn>;

const prPayload = {
  number: 42,
  title: 'feat: add feature',
  url: 'https://github.com/org/repo/pull/42',
  state: 'OPEN',
  isDraft: false,
  headRefName: 'feat/MORG-42',
  baseRefName: 'main',
  author: { login: 'testuser' },
  reviewDecision: null,
  statusCheckRollup: null,
  mergedAt: null,
};

describe('GhClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPRForBranch', () => {
    it('returns PR on exact branch name match', async () => {
      mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '' }); // ghEnv auth token
      mockExeca.mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify(prPayload),
      });

      const client = new GhClient('testuser');
      const pr = await client.getPRForBranch('feat/MORG-42');

      expect(pr?.number).toBe(42);
      expect(pr?.title).toBe('feat: add feature');
    });

    it('returns null when no PR exists', async () => {
      mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '' }); // ghEnv for pr view
      mockExeca.mockResolvedValueOnce({ exitCode: 1, stdout: '' }); // pr view fails
      mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '' }); // ghEnv for listPRs
      mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '[]' }); // listPRs returns empty

      const client = new GhClient('testuser');
      const pr = await client.getPRForBranch('no-such-branch');

      expect(pr).toBeNull();
    });

    it('falls back to case-insensitive search', async () => {
      mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '' }); // ghEnv
      mockExeca.mockResolvedValueOnce({ exitCode: 1, stdout: '' }); // exact match fails
      mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '' }); // ghEnv (listPRs)
      mockExeca.mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify([prPayload]),
      });

      const client = new GhClient('testuser');
      const pr = await client.getPRForBranch('FEAT/MORG-42');

      expect(pr?.number).toBe(42);
    });
  });

  describe('getPRChecks', () => {
    it('returns checks array on success', async () => {
      const checksPayload = [
        { name: 'CI', state: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'Lint', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ];
      mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '' }); // ghEnv
      mockExeca.mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify(checksPayload),
      });

      const client = new GhClient('testuser');
      const checks = await client.getPRChecks(42);

      expect(checks).toHaveLength(2);
      expect(checks[0]?.conclusion).toBe('SUCCESS');
    });

    it('returns empty array when gh command fails', async () => {
      mockExeca.mockResolvedValueOnce({ exitCode: 0, stdout: '' }); // ghEnv
      mockExeca.mockResolvedValueOnce({ exitCode: 1, stdout: '' });

      const client = new GhClient('testuser');
      const checks = await client.getPRChecks(42);

      expect(checks).toEqual([]);
    });
  });
});

describe('ghPrToPrStatus', () => {
  it('returns merged for merged PR', () => {
    expect(ghPrToPrStatus({ ...prPayload, mergedAt: '2024-01-01' })).toBe('merged');
  });

  it('returns closed for closed PR', () => {
    expect(ghPrToPrStatus({ ...prPayload, state: 'CLOSED' })).toBe('closed');
  });

  it('returns approved for approved PR', () => {
    expect(ghPrToPrStatus({ ...prPayload, reviewDecision: 'APPROVED' })).toBe('approved');
  });

  it('returns open for draft PR', () => {
    expect(ghPrToPrStatus({ ...prPayload, isDraft: true })).toBe('open');
  });

  it('returns ready for non-draft PR with no review decision', () => {
    expect(ghPrToPrStatus(prPayload)).toBe('ready');
  });
});
