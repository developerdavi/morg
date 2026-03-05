import { z } from 'zod';

// ─── Global Config (~/.morg/config.json) ─────────────────────────────────────

export const JiraGlobalConfigSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().url(),
  userEmail: z.string().email(),
  apiToken: z.string().min(1),
});

export const SlackGlobalConfigSchema = z.object({
  enabled: z.boolean(),
  apiToken: z.string().min(1),
  standupChannel: z.string().optional(),
});

export const GlobalIntegrationsSchema = z.object({
  jira: JiraGlobalConfigSchema.optional(),
  slack: SlackGlobalConfigSchema.optional(),
});

export const GlobalConfigSchema = z.object({
  version: z.literal(1),
  githubUsername: z.string().min(1),
  anthropicApiKey: z.string().min(1).optional(),
  autoStash: z.enum(['always', 'ask', 'never']).default('ask'),
  lastStashChoice: z.enum(['stash', 'skip']).optional(),
  integrations: GlobalIntegrationsSchema.default({}),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;
export type JiraGlobalConfig = z.infer<typeof JiraGlobalConfigSchema>;
export type SlackGlobalConfig = z.infer<typeof SlackGlobalConfigSchema>;

// ─── Projects Registry (~/.morg/projects.json) ───────────────────────────────

export const ProjectEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const ProjectsFileSchema = z.object({
  version: z.literal(1),
  projects: z.array(ProjectEntrySchema),
});

export type ProjectEntry = z.infer<typeof ProjectEntrySchema>;
export type ProjectsFile = z.infer<typeof ProjectsFileSchema>;

// ─── Project Config (~/.morg/projects/[id]/config.json) ──────────────────────

export const JiraProjectConfigSchema = z.object({
  enabled: z.boolean(),
  projectKey: z.string().min(1),
  defaultTransitions: z
    .object({
      start: z.string(),
      done: z.string(),
    })
    .default({ start: 'In Progress', done: 'Done' }),
});

export const GithubProjectConfigSchema = z.object({
  enabled: z.boolean(),
});

export const ProjectIntegrationsSchema = z.object({
  github: GithubProjectConfigSchema.default({ enabled: true }),
  jira: JiraProjectConfigSchema.optional(),
});

export const ProjectConfigSchema = z.object({
  version: z.literal(1),
  projectId: z.string().min(1),
  githubUsername: z.string().min(1),
  githubRepo: z.string().min(1),
  defaultBranch: z.string().min(1).default('main'),
  syncPull: z.enum(['always', 'ask', 'never']).default('ask'),
  integrations: ProjectIntegrationsSchema.default({}),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;
export type JiraProjectConfig = z.infer<typeof JiraProjectConfigSchema>;

// ─── Branches (~/.morg/projects/[id]/branches.json) ──────────────────────────

export const BranchStatusSchema = z.enum(['active', 'pr_open', 'pr_merged', 'done', 'abandoned']);

export const PrStatusSchema = z
  .enum(['open', 'ready', 'needs_review', 'changes_requested', 'approved', 'merged', 'closed'])
  .nullable();

export const BranchSchema = z.object({
  id: z.string().min(1),
  branchName: z.string().min(1),
  ticketId: z.string().nullable(),
  ticketTitle: z.string().nullable(),
  status: BranchStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  prNumber: z.number().nullable(),
  prUrl: z.string().url().nullable(),
  prStatus: PrStatusSchema,
  worktreePath: z.string().nullable().default(null),
  lastAccessedAt: z.string().datetime().optional(),
});

export const BranchesFileSchema = z.object({
  version: z.literal(1),
  branches: z.array(BranchSchema),
});

export type Branch = z.infer<typeof BranchSchema>;
export type BranchStatus = z.infer<typeof BranchStatusSchema>;
export type PrStatus = z.infer<typeof PrStatusSchema>;
export type BranchesFile = z.infer<typeof BranchesFileSchema>;
