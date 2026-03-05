import type { Command } from 'commander';
import { configManager } from '../config/manager';
import type { GlobalConfig } from '../config/schemas';
import { theme, symbols } from '../ui/theme';
import { intro, outro, text, password, confirm, select } from '../ui/prompts';

async function runConfig(options: { show?: boolean }): Promise<void> {
  if (options.show) {
    if (!(await configManager.hasGlobalConfig())) {
      console.log(theme.error('No config found.'), theme.muted('Run: morg config'));
      return;
    }
    const config = await configManager.getGlobalConfig();
    const redact = (s: string) => s.slice(0, 8) + '••••••••';
    console.log(theme.primaryBold('\nmorg config'));
    console.log(theme.muted('─'.repeat(40)));
    console.log(`  githubUsername:  ${theme.primary(config.githubUsername)}`);
    if (config.anthropicApiKey)
      console.log(`  anthropicApiKey: ${theme.muted(redact(config.anthropicApiKey))}`);
    console.log(`  autoStash:       ${theme.primary(config.autoStash)}`);
    if (config.integrations.jira?.enabled) {
      const j = config.integrations.jira;
      console.log(`  jira.baseUrl:    ${theme.primary(j.baseUrl)}`);
      console.log(`  jira.userEmail:  ${theme.primary(j.userEmail)}`);
      console.log(`  jira.apiToken:   ${theme.muted(redact(j.apiToken))}`);
    }
    if (config.integrations.slack?.enabled) {
      const s = config.integrations.slack;
      console.log(`  slack.apiToken:       ${theme.muted(redact(s.apiToken))}`);
      if (s.standupChannel)
        console.log(`  slack.standupChannel: ${theme.primary(s.standupChannel)}`);
    }
    if (config.integrations.notion?.enabled) {
      const n = config.integrations.notion;
      console.log(`  notion.apiToken:  ${theme.muted(redact(n.apiToken))}`);
    }
    console.log('');
    return;
  }

  intro(theme.primaryBold('morg config'));

  const existing = (await configManager.hasGlobalConfig())
    ? await configManager.getGlobalConfig()
    : undefined;

  const githubUsername = await text({
    message: 'GitHub username',
    initialValue: existing?.githubUsername,
    validate: (v) => (v.trim() ? undefined : 'Required'),
  });

  const anthropicApiKeyRaw = await text({
    message: 'Anthropic API key (sk-ant-...) — leave blank to skip',
    initialValue: existing?.anthropicApiKey ?? '',
    validate: (v) => (!v.trim() || v.startsWith('sk-ant-') ? undefined : 'Must start with sk-ant-'),
  });
  const anthropicApiKey = anthropicApiKeyRaw.trim() || undefined;

  const autoStash = await select({
    message: 'Auto-stash dirty working tree on branch switch?',
    options: [
      { value: 'ask', label: 'Ask each time (remember last choice)' },
      { value: 'always', label: 'Always stash automatically' },
      { value: 'never', label: 'Never stash' },
    ],
    initialValue: existing?.autoStash ?? 'ask',
  });

  const enableJira = await confirm({
    message: 'Enable Jira integration?',
    initialValue: existing?.integrations.jira?.enabled ?? false,
  });

  let jiraConfig: GlobalConfig['integrations']['jira'] = undefined;
  if (enableJira) {
    const baseUrl = await text({
      message: 'Jira base URL (e.g. https://yourorg.atlassian.net)',
      initialValue: existing?.integrations.jira?.baseUrl,
      validate: (v) => (v.startsWith('https://') ? undefined : 'Must be an https URL'),
    });
    const userEmail = await text({
      message: 'Jira user email',
      initialValue: existing?.integrations.jira?.userEmail,
      validate: (v) => (v.includes('@') ? undefined : 'Enter a valid email'),
    });
    const apiToken = await password({
      message: 'Jira API token',
      validate: (v) => (v.trim() ? undefined : 'Required'),
    });
    jiraConfig = { enabled: true, baseUrl, userEmail, apiToken };
  }

  const enableSlack = await confirm({
    message: 'Enable Slack integration?',
    initialValue: existing?.integrations.slack?.enabled ?? false,
  });

  let slackConfig: GlobalConfig['integrations']['slack'] = undefined;
  if (enableSlack) {
    const apiToken = await password({
      message: 'Slack bot token (xoxb-...)',
      validate: (v) => (v.startsWith('xoxb-') ? undefined : 'Must start with xoxb-'),
    });
    const standupChannel = await text({
      message: 'Standup channel ID (e.g. C01234567) — leave blank to skip',
      initialValue: existing?.integrations.slack?.standupChannel ?? '',
    });
    slackConfig = { enabled: true, apiToken, standupChannel: standupChannel.trim() || undefined };
  }

  const enableNotion = await confirm({
    message: 'Enable Notion integration?',
    initialValue: existing?.integrations.notion?.enabled ?? false,
  });

  let notionConfig: GlobalConfig['integrations']['notion'] = undefined;
  if (enableNotion) {
    const apiToken = await password({
      message: 'Notion integration token (secret_...)',
      validate: (v) => (v.trim() ? undefined : 'Required'),
    });
    notionConfig = { enabled: true, apiToken };
  }

  await configManager.saveGlobalConfig({
    version: 1,
    githubUsername,
    anthropicApiKey,
    autoStash,
    lastStashChoice: existing?.lastStashChoice,
    syncPull: existing?.syncPull ?? 'ask',
    autoDeleteMerged: existing?.autoDeleteMerged ?? 'ask',
    autoUpdateTicketStatus: existing?.autoUpdateTicketStatus ?? 'ask',
    integrations: { jira: jiraConfig, slack: slackConfig, notion: notionConfig },
  });

  outro(theme.success(`${symbols.success} Config saved to ~/.morg/config.json`));
}

export function registerConfigCommand(program: Command): void {
  program
    .command('config')
    .description('Configure morg (API keys, integrations)')
    .option('--show', 'Show current config (tokens redacted)')
    .action((options: { show?: boolean }) => runConfig(options));
}
