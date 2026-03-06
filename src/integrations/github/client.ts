import { execa } from 'execa';
import { z } from 'zod';
import type { PrStatus } from '../../config/schemas';
import { IntegrationError } from '../../utils/errors';

const GhPrSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  state: z.string(),
  isDraft: z.boolean(),
  headRefName: z.string(),
  baseRefName: z.string(),
  author: z.object({ login: z.string() }),
  reviewDecision: z.string().nullable().optional(),
  statusCheckRollup: z.array(z.unknown()).nullable().optional(),
  mergedAt: z.string().nullable().optional(),
});

export type GhPr = z.infer<typeof GhPrSchema>;

const PR_FIELDS =
  'number,title,url,state,isDraft,headRefName,baseRefName,author,reviewDecision,statusCheckRollup,mergedAt';

export class GhClient {
  constructor(private readonly githubUsername?: string) {}

  private async ghEnv(): Promise<Record<string, string | undefined>> {
    if (!this.githubUsername) return {};
    const tokenResult = await execa('gh', ['auth', 'token', '--user', this.githubUsername], {
      reject: false,
    });
    if (tokenResult.exitCode !== 0 || !tokenResult.stdout.trim()) return {};
    return { GH_TOKEN: tokenResult.stdout.trim() };
  }

  async listPRs(state: 'open' | 'closed' | 'merged' = 'open'): Promise<GhPr[]> {
    const result = await execa('gh', ['pr', 'list', '--state', state, '--json', PR_FIELDS], {
      reject: false,
      env: await this.ghEnv(),
    });
    if (result.exitCode !== 0) return [];
    return z.array(GhPrSchema).parse(JSON.parse(result.stdout));
  }

  async createPR(opts: {
    title: string;
    body: string;
    base?: string;
    draft?: boolean;
  }): Promise<GhPr> {
    const env = await this.ghEnv();
    const args = ['pr', 'create', '--title', opts.title, '--body', opts.body];
    if (opts.base) args.push('--base', opts.base);
    if (opts.draft) args.push('--draft');
    const result = await execa('gh', args, { reject: false, env });
    if (result.exitCode !== 0)
      throw new IntegrationError(`gh pr create failed: ${result.stderr}`, 'github');
    // gh pr create outputs the PR URL — fetch structured data with a follow-up view call
    const url = result.stdout.trim();
    const view = await execa('gh', ['pr', 'view', url, '--json', PR_FIELDS], {
      reject: false,
      env,
    });
    if (view.exitCode !== 0)
      throw new IntegrationError(`gh pr view failed: ${view.stderr}`, 'github');
    return GhPrSchema.parse(JSON.parse(view.stdout));
  }

  async getPRForBranch(branch: string): Promise<GhPr | null> {
    const env = await this.ghEnv();
    // Fast path: exact case match
    const result = await execa('gh', ['pr', 'view', branch, '--json', PR_FIELDS], {
      reject: false,
      env,
    });
    if (result.exitCode === 0) return GhPrSchema.parse(JSON.parse(result.stdout));

    // Fallback: case-insensitive search (handles pre-MORG-28 lowercase branch names
    // where the remote PR headRefName may be uppercase)
    const lower = branch.toLowerCase();
    const prs = await this.listPRs('open');
    return prs.find((pr) => pr.headRefName.toLowerCase() === lower) ?? null;
  }

  async getPRDiff(prNumber: number): Promise<string> {
    const result = await execa('gh', ['pr', 'diff', String(prNumber)], {
      reject: false,
      env: await this.ghEnv(),
    });
    return result.stdout;
  }

  async getPRChecks(
    prNumber: number,
  ): Promise<{ name: string; state: string; conclusion: string | null }[]> {
    const result = await execa(
      'gh',
      ['pr', 'checks', String(prNumber), '--json', 'name,state,conclusion'],
      { reject: false, env: await this.ghEnv() },
    );
    if (result.exitCode !== 0 || !result.stdout.trim()) return [];
    try {
      return JSON.parse(result.stdout) as {
        name: string;
        state: string;
        conclusion: string | null;
      }[];
    } catch {
      return [];
    }
  }
}

export const ghClient = new GhClient();

export function ghPrToPrStatus(pr: GhPr): PrStatus {
  if (pr.mergedAt) return 'merged';
  if (pr.state === 'CLOSED') return 'closed';
  switch (pr.reviewDecision) {
    case 'APPROVED':
      return 'approved';
    case 'CHANGES_REQUESTED':
      return 'changes_requested';
    case 'REVIEW_REQUIRED':
      return 'needs_review';
    default:
      return pr.isDraft ? 'open' : 'ready';
  }
}
