import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { getRecentCommits } from '../git/index';
import { standupPrompt, SYSTEM_STANDUP } from '../integrations/claude/prompts';
import { requireTrackedRepo } from '../utils/detect';
import { registry } from '../services/registry';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';

async function runStandup(options: { post?: boolean; channel?: string }): Promise<void> {
  const projectId = await requireTrackedRepo();

  const [globalConfig, branchesFile, recentCommits] = await Promise.all([
    configManager.getGlobalConfig(),
    configManager.getBranches(projectId),
    getRecentCommits(20),
  ]);

  const activeBranches = branchesFile.branches
    .filter((b) => ['active', 'pr_open'].includes(b.status))
    .map((b) => (b.ticketId ? `${b.ticketId}: ${b.ticketTitle ?? b.branchName}` : b.branchName));

  const recentPRs = branchesFile.branches
    .filter((b) => b.prNumber !== null)
    .map((b) => `PR #${b.prNumber} (${b.prStatus ?? 'open'}) — ${b.ticketTitle ?? b.branchName}`);

  const ai = await registry.ai();
  if (!ai) {
    console.error(
      theme.error('Anthropic API key is required for standup.'),
      theme.muted('Run: morg config'),
    );
    process.exit(1);
  }

  const standup = await withSpinner('Generating standup...', () =>
    ai.complete(
      standupPrompt({ recentCommits, activeTasks: activeBranches, recentPRs }),
      SYSTEM_STANDUP,
    ),
  );

  console.log('\n' + theme.primaryBold('  Standup'));
  console.log(theme.muted('  ' + '─'.repeat(50)));
  console.log(
    standup
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n'),
  );
  console.log('');

  if (options.post) {
    const slackConfig = globalConfig.integrations.slack;
    if (!slackConfig?.enabled) {
      console.error(theme.error('Slack is not enabled.'), theme.muted('Run: morg config'));
      process.exit(1);
    }
    const channel = options.channel ?? slackConfig.standupChannel;
    if (!channel) {
      console.error(
        theme.error('No standup channel configured.'),
        theme.muted('Run: morg config or use --channel <id>'),
      );
      process.exit(1);
    }
    const messaging = await registry.messaging();
    if (!messaging) {
      console.error(theme.error('Slack messaging not available.'), theme.muted('Run: morg config'));
      process.exit(1);
    }
    await withSpinner(`Posting to ${channel}...`, () => messaging.sendMessage(channel, standup));
    console.log(theme.success(`${symbols.success} Posted to Slack!`));
  }
}

export function registerStandupCommand(program: Command): void {
  program
    .command('standup')
    .description('Generate a standup update from recent activity')
    .option('--post', 'Post to Slack standup channel')
    .option('--channel <id>', 'Override Slack channel ID')
    .action((options: { post?: boolean; channel?: string }) => runStandup(options));
}
