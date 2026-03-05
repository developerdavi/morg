import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { getCurrentBranch, checkout, branchExists } from '../git/index';
import { isTicketId, branchNameFromTicket, extractTicketId } from '../utils/ticket';
import { handleDirtyTree } from '../utils/stash';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';
import { JiraClient } from '../integrations/jira/client';

async function runStart(input: string, options: { base?: string }): Promise<void> {
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
        const jira = new JiraClient(globalConfig.integrations.jira, projectConfig.integrations.jira);
        const issue = await withSpinner(`Fetching ${ticketId}...`, () => jira.getIssue(ticketId!));
        ticketTitle = issue.fields.summary;
        branchName = branchNameFromTicket(ticketId, ticketTitle);
        console.log(theme.muted(`  ${symbols.arrow} ${ticketTitle}`));
      } else {
        branchName = branchNameFromTicket(ticketId);
      }
    } catch {
      branchName = branchNameFromTicket(ticketId);
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

  await handleDirtyTree(currentBranch, branchName);

  const exists = await branchExists(branchName);
  if (exists) {
    await withSpinner(`Switching to ${branchName}...`, () => checkout(branchName));
  } else {
    await withSpinner(`Creating branch ${branchName} from ${base}...`, () => checkout(branchName, true, base));
  }

  // Create task entry if it doesn't exist
  const tasks = await configManager.getTasks(projectId);
  if (!tasks.tasks.find((t) => t.branchName === branchName)) {
    const now = new Date().toISOString();
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
    });
    await configManager.saveTasks(projectId, tasks);
  }

  console.log(theme.success(`\n${symbols.success} On branch ${theme.primaryBold(branchName)}`));
  if (ticketId) console.log(theme.muted(`  Ticket: ${ticketId}`));
}

export function registerStartCommand(program: Command): void {
  program
    .command('start <branch-or-ticket>')
    .description('Start work on a branch or ticket')
    .option('--base <branch>', 'Base branch to create from (default: repo default branch)')
    .action(runStart);
}
