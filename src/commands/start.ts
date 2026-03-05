import type { Command } from 'commander';
import { join, basename } from 'path';
import { configManager } from '../config/manager';
import { getCurrentBranch, checkout, branchExists, getRepoRoot, addWorktree } from '../git/index';
import { isTicketId, extractTicketId } from '../utils/ticket';
import { handleDirtyTree } from '../utils/stash';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';
import { JiraClient } from '../integrations/jira/client';

async function runStart(
  input: string,
  options: { base?: string; worktree?: boolean },
): Promise<void> {
  const projectId = await requireTrackedRepo();

  let branchName: string;
  let ticketId: string | null = null;
  let ticketTitle: string | null = null;

  if (isTicketId(input)) {
    ticketId = input.trim().toUpperCase();

    // Try to enrich from Jira if enabled
    try {
      const [globalConfig, projectConfig] = await Promise.all([
        configManager.getGlobalConfig(),
        configManager.getProjectConfig(projectId),
      ]);
      if (globalConfig.integrations.jira?.enabled && projectConfig.integrations.jira?.enabled) {
        const jira = new JiraClient(
          globalConfig.integrations.jira,
          projectConfig.integrations.jira,
        );
        const issue = await withSpinner(`Fetching ${ticketId}...`, () => jira.getIssue(ticketId!));
        ticketTitle = issue.fields.summary;
        branchName = ticketId.toLowerCase();
        console.log(theme.muted(`  ${symbols.arrow} ${ticketTitle}`));
      } else {
        branchName = ticketId.toLowerCase();
      }
    } catch {
      branchName = ticketId.toLowerCase();
    }
  } else {
    branchName = input;
    ticketId = extractTicketId(input);
  }

  const [currentBranch, projectConfig] = await Promise.all([
    getCurrentBranch(),
    configManager.getProjectConfig(projectId),
  ]);
  const base = options.base ?? projectConfig.defaultBranch;

  let worktreePath: string | null = null;

  if (options.worktree) {
    const repoRoot = await getRepoRoot();
    const repoName = basename(repoRoot);
    const branchSlug = branchName.replace(/\//g, '-');
    worktreePath = join(repoRoot, '..', `${repoName}-worktrees`, branchSlug);

    const exists = await branchExists(branchName);
    if (exists) {
      await withSpinner(`Creating worktree for ${branchName}...`, () =>
        addWorktree(worktreePath!, branchName),
      );
    } else {
      await withSpinner(`Creating branch ${branchName} and worktree...`, () =>
        addWorktree(worktreePath!, branchName, base),
      );
    }
    console.log(
      theme.success(`\n${symbols.success} Worktree created at ${theme.primaryBold(worktreePath)}`),
    );
    console.log(theme.muted(`  ${symbols.arrow} cd ${worktreePath}`));
  } else {
    if (currentBranch !== base) {
      await handleDirtyTree(currentBranch, branchName);
    }

    const exists = await branchExists(branchName);
    if (exists) {
      await withSpinner(`Switching to ${branchName}...`, () => checkout(branchName));
    } else {
      await withSpinner(`Creating branch ${branchName} from ${base}...`, () =>
        checkout(branchName, true, base),
      );
    }
    console.log(theme.success(`\n${symbols.success} On branch ${theme.primaryBold(branchName)}`));
  }

  // Create task entry if it doesn't exist
  const now = new Date().toISOString();
  const tasks = await configManager.getTasks(projectId);
  const existing = tasks.tasks.find((t) => t.branchName === branchName);
  if (!existing) {
    tasks.tasks.push({
      id: `task_${Date.now()}`,
      branchName,
      ticketId,
      ticketTitle,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      prNumber: null,
      prUrl: null,
      prStatus: null,
      worktreePath,
      lastAccessedAt: now,
    });
  } else {
    existing.lastAccessedAt = now;
    if (worktreePath) existing.worktreePath = worktreePath;
  }
  await configManager.saveTasks(projectId, tasks);

  if (ticketId) console.log(theme.muted(`  Ticket: ${ticketId}`));
}

export function registerStartCommand(program: Command): void {
  program
    .command('start <branch-or-ticket>')
    .description('Start work on a branch or ticket')
    .option('--base <branch>', 'Base branch to create from (default: repo default branch)')
    .option('-w, --worktree', 'Create a git worktree instead of checking out')
    .action(runStart);
}
