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
  async listPRs(state: 'open' | 'closed' | 'merged' = 'open'): Promise<GhPr[]> {
    const result = await execa('gh', ['pr', 'list', '--state', state, '--json', PR_FIELDS], {
      reject: false,
    });
    if (result.exitCode !== 0) return [];
    return z.array(GhPrSchema).parse(JSON.parse(result.stdout));
  }

  async createPR(opts: { title: string; body: string; base?: string; draft?: boolean }): Promise<GhPr> {
    const args = ['pr', 'create', '--title', opts.title, '--body', opts.body];
    if (opts.base) args.push('--base', opts.base);
    if (opts.draft) args.push('--draft');
    const result = await execa('gh', args, { reject: false });
    if (result.exitCode !== 0) throw new IntegrationError(`gh pr create failed: ${result.stderr}`, 'github');
    // gh pr create outputs the PR URL — fetch structured data with a follow-up view call
    const url = result.stdout.trim();
    const view = await execa('gh', ['pr', 'view', url, '--json', PR_FIELDS], { reject: false });
    if (view.exitCode !== 0) throw new IntegrationError(`gh pr view failed: ${view.stderr}`, 'github');
    return GhPrSchema.parse(JSON.parse(view.stdout));
  }

  async getPRForBranch(branch: string): Promise<GhPr | null> {
    const result = await execa('gh', ['pr', 'view', branch, '--json', PR_FIELDS], {
      reject: false,
    });
    if (result.exitCode !== 0) return null;
    return GhPrSchema.parse(JSON.parse(result.stdout));
  }

  async getPRDiff(prNumber: number): Promise<string> {
    const result = await execa('gh', ['pr', 'diff', String(prNumber)], { reject: false });
    return result.stdout;
  }
}

export const ghClient = new GhClient();

export function ghPrToPrStatus(pr: GhPr): PrStatus {
  if (pr.mergedAt) return 'merged';
  if (pr.state === 'CLOSED') return 'closed';
  switch (pr.reviewDecision) {
    case 'APPROVED': return 'approved';
    case 'CHANGES_REQUESTED': return 'changes_requested';
    case 'REVIEW_REQUIRED': return 'needs_review';
    default: return pr.isDraft ? 'open' : 'ready';
  }
}
