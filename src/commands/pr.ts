import type { Command } from 'commander';
import { execa } from 'execa';
import { configManager } from '../config/manager';
import { getCurrentBranch, getDefaultBranch, getDiffWithBase, pushBranch } from '../git/index';
import { ghClient, ghPrToPrStatus } from '../integrations/github/client';
import { ClaudeClient } from '../integrations/claude/client';
import { prDescriptionPrompt, SYSTEM_PR_DESCRIPTION, prReviewPrompt, SYSTEM_PR_REVIEW } from '../integrations/claude/prompts';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';
import { intro, outro, text } from '../ui/prompts';

async function runPrCreate(options: { ai: boolean; draft?: boolean }): Promise<void> {
  const projectId = await requireTrackedRepo();

  const [currentBranch, defaultBranch] = await Promise.all([
    getCurrentBranch(),
    getDefaultBranch(),
  ]);

  const tasks = await configManager.getTasks(projectId);
  const task = tasks.tasks.find((t) => t.branchName === currentBranch);

  let defaultTitle = currentBranch.replace(/^(feat|fix|chore|docs)\//, '').replace(/-/g, ' ');
  if (task?.ticketId) defaultTitle = `${task.ticketId}: ${task.ticketTitle ?? defaultTitle}`;

  intro(theme.primaryBold('morg pr create'));

  const title = await text({
    message: 'PR title',
    initialValue: defaultTitle,
    validate: (v) => (v.trim() ? undefined : 'Required'),
  });

  let body = '';
  if (options.ai) {
    try {
      const globalConfig = await configManager.getGlobalConfig();
      if (!globalConfig.anthropicApiKey) {
        console.log(theme.warning('No Anthropic API key — skipping AI description. Run: morg config'));
        options.ai = false;
        throw new Error('skip');
      }
      const diff = await withSpinner('Getting diff...', () => getDiffWithBase(defaultBranch));
      const claude = new ClaudeClient(globalConfig.anthropicApiKey);
      body = await withSpinner('Generating PR description with Claude...', () =>
        claude.complete(
          prDescriptionPrompt(diff, currentBranch, task?.ticketTitle ?? undefined),
          SYSTEM_PR_DESCRIPTION,
        ),
      );
      console.log(theme.muted('\nGenerated description:'));
      console.log(theme.dim(body.slice(0, 400) + (body.length > 400 ? '...' : '')));
    } catch {
      console.log(theme.warning('Could not generate AI description — creating with empty body.'));
    }
  }

  const remoteHasBase = (await execa('git', ['ls-remote', '--exit-code', 'origin', defaultBranch], { reject: false })).exitCode === 0;
  if (!remoteHasBase) {
    console.error(theme.error(`Base branch "${defaultBranch}" has not been pushed to GitHub.`));
    console.error(theme.muted(`Fix: git push -u origin ${defaultBranch}`));
    process.exit(1);
  }

  await withSpinner(`Pushing ${currentBranch}...`, () => pushBranch(currentBranch));

  const pr = await withSpinner('Creating PR...', () =>
    ghClient.createPR({ title, body, base: defaultBranch, draft: options.draft }),
  );

  if (task) {
    task.prNumber = pr.number;
    task.prUrl = pr.url;
    task.prStatus = ghPrToPrStatus(pr);
    task.status = 'pr_open';
    task.updatedAt = new Date().toISOString();
    await configManager.saveTasks(projectId, tasks);
  }

  outro(theme.success(`${symbols.success} PR #${pr.number} created: ${theme.primary(pr.url)}`));
}

async function runPrReview(options: { ai?: boolean }): Promise<void> {
  const prs = await withSpinner('Fetching open PRs...', () => ghClient.listPRs('open'));

  if (prs.length === 0) {
    console.log(theme.muted('No open pull requests.'));
    return;
  }

  console.log(theme.primaryBold(`\n  Open PRs (${prs.length})`));
  console.log(theme.muted('  ' + '─'.repeat(50)));

  for (const pr of prs) {
    const draft = pr.isDraft ? theme.muted(' [draft]') : '';
    const review = pr.reviewDecision ? theme.muted(` · ${pr.reviewDecision}`) : '';
    console.log(`\n  ${theme.primaryBold(`#${pr.number}`)} ${pr.title}${draft}${review}`);
    console.log(`  ${theme.muted(pr.url)}`);
    console.log(`  ${theme.muted(`${pr.author.login} → ${pr.baseRefName}`)}`);

    if (options.ai) {
      try {
        const globalConfig = await configManager.getGlobalConfig();
        if (!globalConfig.anthropicApiKey) throw new Error('No API key');
        const diff = await withSpinner(`  Getting diff for #${pr.number}...`, () =>
          ghClient.getPRDiff(pr.number),
        );
        const claude = new ClaudeClient(globalConfig.anthropicApiKey);
        const summary = await withSpinner(`  Summarizing #${pr.number}...`, () =>
          claude.complete(prReviewPrompt(diff, pr.title), SYSTEM_PR_REVIEW),
        );
        console.log(theme.muted(`\n  ${symbols.info} ${summary.replace(/\n/g, '\n  ')}`));
      } catch {
        // Best-effort — skip AI summary for this PR
      }
    }
  }
  console.log('');
}

export function registerPrCommand(program: Command): void {
  const pr = program.command('pr').description('Pull request commands');

  pr.command('create')
    .description('Create a pull request for the current branch')
    .option('--no-ai', 'Skip AI-generated PR description')
    .option('--draft', 'Create as draft PR')
    .action((options: { ai: boolean; draft?: boolean }) => runPrCreate(options));

  pr.command('review')
    .description('List and review open pull requests')
    .option('--ai', 'Include AI summaries')
    .action((options: { ai?: boolean }) => runPrReview(options));
}
