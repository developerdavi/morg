import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { getRecentCommits } from '../git/index';
import { ClaudeClient } from '../integrations/claude/client';
import { standupPrompt, SYSTEM_STANDUP } from '../integrations/claude/prompts';
import { SlackClient } from '../integrations/slack/client';
import { requireTrackedRepo } from '../utils/detect';
import { theme, symbols } from '../ui/theme';
import { withSpinner } from '../ui/spinner';

async function runStandup(options: { post?: boolean; channel?: string }): Promise<void> {
  const projectId = await requireTrackedRepo();

  const [globalConfig, tasks, recentCommits] = await Promise.all([
    configManager.getGlobalConfig(),
    configManager.getTasks(projectId),
    getRecentCommits(20),
  ]);

  const activeTasks = tasks.tasks
    .filter((t) => ['active', 'pr_open'].includes(t.status))
    .map((t) => (t.ticketId ? `${t.ticketId}: ${t.ticketTitle ?? t.branchName}` : t.branchName));

  const recentPRs = tasks.tasks
    .filter((t) => t.prNumber !== null)
    .map((t) => `PR #${t.prNumber} (${t.prStatus ?? 'open'}) — ${t.ticketTitle ?? t.branchName}`);

  if (!globalConfig.anthropicApiKey) {
    console.error(theme.error('Anthropic API key is required for standup.'), theme.muted('Run: morg config'));
    process.exit(1);
  }
  const claude = new ClaudeClient(globalConfig.anthropicApiKey);
  const standup = await withSpinner('Generating standup...', () =>
    claude.complete(standupPrompt({ recentCommits, activeTasks, recentPRs }), SYSTEM_STANDUP),
  );

  console.log('\n' + theme.primaryBold('  Standup'));
  console.log(theme.muted('  ' + '─'.repeat(50)));
  console.log(standup.split('\n').map((l) => `  ${l}`).join('\n'));
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
    const slack = new SlackClient(slackConfig);
    await withSpinner(`Posting to ${channel}...`, () => slack.postMessage(channel, standup));
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
