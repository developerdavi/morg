import type { Command } from 'commander';
import { execa } from 'execa';
import { configManager } from '../config/manager';
import { getCurrentBranch, getDiffWithBase, pushBranch, getCommitsOnBranch } from '../git/index';
import { ghClient, ghPrToPrStatus } from '../integrations/providers/github/github-client';
import {
  prDescriptionPrompt,
  SYSTEM_PR_DESCRIPTION,
  prReviewPrompt,
  SYSTEM_PR_REVIEW,
} from '../integrations/providers/ai/prompts';
import { requireTrackedRepo } from '../utils/detect';
import { findBranchCaseInsensitive } from '../utils/ticket';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';
import { intro, outro, text } from '../ui/prompts';
import { registry } from '../services/registry';

async function runPrCreate(options: {
  ai: boolean;
  draft?: boolean;
  yes?: boolean;
  title?: string;
  body?: string;
}): Promise<void> {
  const projectId = await requireTrackedRepo();

  const [currentBranch, projectConfig] = await Promise.all([
    getCurrentBranch(),
    configManager.getProjectConfig(projectId),
  ]);
  const defaultBranch = projectConfig.defaultBranch;
  const gh = await registry.gh();

  const [branchesFile, commits] = await Promise.all([
    configManager.getBranches(projectId),
    getCommitsOnBranch(defaultBranch),
  ]);
  const trackedBranch = findBranchCaseInsensitive(branchesFile.branches, currentBranch);

  let defaultTitle: string;
  if (commits.length === 1 && commits[0]) {
    defaultTitle = commits[0];
  } else {
    defaultTitle = currentBranch.replace(/-/g, ' ');
  }
  if (trackedBranch?.ticketId)
    defaultTitle = `${trackedBranch.ticketId}: ${trackedBranch.ticketTitle ?? defaultTitle}`;

  intro(theme.primaryBold('morg pr create'));

  const title = options.yes
    ? (options.title ?? defaultTitle)
    : await text({
        message: 'PR title',
        initialValue: options.title ?? defaultTitle,
        validate: (v) => (v.trim() ? undefined : 'Required'),
      });

  let bodyDefault = options.body ?? '';
  if (options.ai && !options.body) {
    const ai = await registry.ai();
    if (ai) {
      try {
        const diff = await withSpinner('Getting diff...', () => getDiffWithBase(defaultBranch));
        bodyDefault = await withSpinner('Generating PR description with Claude...', () =>
          ai.complete(
            prDescriptionPrompt(diff, currentBranch, trackedBranch?.ticketTitle ?? undefined),
            SYSTEM_PR_DESCRIPTION,
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(
          theme.warning(`  ${symbols.warning} Could not generate AI description: ${msg}`),
        );
      }
    }
  }

  const body = options.yes
    ? bodyDefault
    : await text({
        message: 'PR body (optional)',
        initialValue: bodyDefault,
        placeholder: 'Leave blank to skip',
      });

  const remoteHasBase =
    (await execa('git', ['ls-remote', '--exit-code', 'origin', defaultBranch], { reject: false }))
      .exitCode === 0;
  if (!remoteHasBase) {
    console.error(theme.error(`Base branch "${defaultBranch}" has not been pushed to GitHub.`));
    console.error(theme.muted(`Fix: git push -u origin ${defaultBranch}`));
    process.exit(1);
  }

  await withSpinner(`Pushing ${currentBranch}...`, () => pushBranch(currentBranch));

  const pr = await withSpinner('Creating PR...', () =>
    gh.createPR({ title, body, base: defaultBranch, draft: options.draft }),
  );

  if (trackedBranch) {
    trackedBranch.prNumber = pr.number;
    trackedBranch.prUrl = pr.url;
    trackedBranch.prStatus = ghPrToPrStatus(pr);
    trackedBranch.status = 'pr_open';
    trackedBranch.updatedAt = new Date().toISOString();
    await configManager.saveBranches(projectId, branchesFile);
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
        const ai = await registry.ai();
        if (!ai) continue;
        const diff = await withSpinner(`  Getting diff for #${pr.number}...`, () =>
          ghClient.getPRDiff(pr.number),
        );
        const summary = await withSpinner(`  Summarizing #${pr.number}...`, () =>
          ai.complete(prReviewPrompt(diff, pr.title), SYSTEM_PR_REVIEW),
        );
        console.log(theme.muted(`\n  ${symbols.info} ${summary.replace(/\n/g, '\n  ')}`));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(
          theme.warning(
            `  ${symbols.warning} Could not generate AI summary for #${pr.number}: ${msg}`,
          ),
        );
      }
    }
  }
  console.log('');
}

async function runPrView(
  branchArg: string | undefined,
  options: { web?: boolean; json?: boolean; wait?: boolean; timeout?: number },
): Promise<void> {
  const projectId = await requireTrackedRepo().catch(() => undefined);
  const projectConfig = projectId
    ? await configManager.getProjectConfig(projectId).catch(() => undefined)
    : undefined;

  let branch: string;
  if (branchArg) {
    if (projectId) {
      const branchesFile = await configManager.getBranches(projectId).catch(() => undefined);
      const found = branchesFile
        ? findBranchCaseInsensitive(branchesFile.branches, branchArg)
        : undefined;
      branch = found?.branchName ?? branchArg;
    } else {
      branch = branchArg;
    }
  } else {
    branch = await getCurrentBranch();
  }

  const gh = await (projectConfig ? registry.gh() : Promise.resolve(ghClient));
  const pr = await withSpinner(`Fetching PR for ${branch}...`, () => gh.getPRForBranch(branch));

  if (!pr) {
    if (options.json) {
      process.stdout.write(JSON.stringify({ pr: null }, null, 2) + '\n');
      return;
    }
    console.log(theme.muted(`No PR found for branch "${branch}".`));
    return;
  }

  if (options.json) {
    process.stdout.write(JSON.stringify({ pr }, null, 2) + '\n');
    return;
  }

  const draft = pr.isDraft ? theme.muted(' [draft]') : '';
  const review = pr.reviewDecision ? `  ${theme.muted('Review:')} ${pr.reviewDecision}` : '';

  console.log('');
  console.log(`  ${theme.primaryBold(`#${pr.number}`)} ${pr.title}${draft}`);
  console.log(`  ${theme.muted('URL:')}    ${theme.primary(pr.url)}`);
  console.log(`  ${theme.muted('Base:')}   ${pr.baseRefName}`);
  console.log(`  ${theme.muted('State:')}  ${pr.state}${pr.mergedAt ? ' (merged)' : ''}`);
  if (review) console.log(review);

  // CI status
  try {
    const checks = await gh.getPRChecks(pr.number);
    if (checks.length > 0) {
      const passing = checks.filter((c) => c.conclusion?.toUpperCase() === 'SUCCESS').length;
      const failing = checks.filter((c) => c.conclusion?.toUpperCase() === 'FAILURE').length;
      const pending = checks.filter((c) => !c.conclusion && c.state !== 'COMPLETED').length;
      let ciLine = `  ${theme.muted('CI:')}     `;
      if (failing > 0) {
        ciLine += theme.error(`✗ ${failing}/${checks.length} failing`);
        if (passing > 0) ciLine += theme.muted(`  |  `) + theme.success(`✓ ${passing} passing`);
      } else if (pending > 0) {
        ciLine += theme.muted(`⏳ ${pending} pending`);
        if (passing > 0) ciLine += ` · ` + theme.success(`✓ ${passing} passing`);
      } else if (passing > 0) {
        ciLine += theme.success(`✓ ${passing}/${checks.length} passing`);
      }
      console.log(ciLine);
    }
  } catch {
    // CI status is non-fatal
  }

  console.log('');

  if (options.web) {
    await execa('open', [pr.url], { reject: false });
  }

  if (options.wait) {
    const timeoutMs = (options.timeout ?? 600) * 1000;
    const start = Date.now();
    process.stdout.write(theme.muted('  Waiting for checks'));
    while (Date.now() - start < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      const checks = await gh.getPRChecks(pr.number);
      if (checks.length === 0) {
        process.stdout.write('.');
        continue;
      }
      if (checks.every((c) => c.conclusion?.toUpperCase() === 'SUCCESS')) {
        console.log('\n' + theme.success(`  ${symbols.success} All checks passed`));
        return;
      }
      if (checks.some((c) => c.conclusion?.toUpperCase() === 'FAILURE')) {
        console.log('\n' + theme.error(`  ${symbols.error ?? symbols.warning} A check failed`));
        process.exit(1);
      }
      process.stdout.write('.');
    }
    console.log('\n' + theme.error('  Timeout waiting for checks'));
    process.exit(1);
  }
}

export function registerPrCommand(program: Command): void {
  const pr = program
    .command('pr')
    .description('Pull request commands')
    .action(() => runPrView(undefined, {}));

  pr.command('create')
    .description('Create a pull request for the current branch')
    .option('--no-ai', 'Skip AI-generated PR description')
    .option('--draft', 'Create as draft PR')
    .option('-y, --yes', 'Skip prompts and use defaults (or --title/--body values)')
    .option('--title <title>', 'PR title (skips title prompt)')
    .option('--body <body>', 'PR body/description (skips AI generation)')
    .action(
      (options: { ai: boolean; draft?: boolean; yes?: boolean; title?: string; body?: string }) =>
        runPrCreate(options),
    );

  pr.command('review')
    .description('List and review open pull requests')
    .option('--ai', 'Include AI summaries')
    .action((options: { ai?: boolean }) => runPrReview(options));

  pr.command('view [branch]')
    .description('View the PR for the current branch (or a specified branch/ticket)')
    .option('--web', 'Open in browser')
    .option('--json', 'Output as JSON')
    .option('--wait', 'Wait for all CI checks to complete')
    .option('--timeout <seconds>', 'Timeout in seconds for --wait (default: 600)', parseInt)
    .action(
      (
        branch: string | undefined,
        options: { web?: boolean; json?: boolean; wait?: boolean; timeout?: number },
      ) => runPrView(branch, options),
    );
}
