import type { Command } from 'commander';
import { configManager } from '../config/manager';
import type { GlobalConfig } from '../config/schemas';
import { theme, symbols } from '../ui/theme';
import { intro, outro, text, password, confirm, select } from '../ui/prompts';
import { requireTrackedRepo } from '../utils/detect';

async function runConfigWizard(existing: GlobalConfig | undefined): Promise<GlobalConfig> {
  const githubUsername = await text({
    message: 'GitHub username',
    initialValue: existing?.githubUsername,
    validate: (v) => (v?.trim() ? undefined : 'Required'),
  });

  const anthropicApiKeyRaw = await text({
    message: 'Anthropic API key (sk-ant-...) — leave blank to skip',
    initialValue: existing?.anthropicApiKey ?? '',
    validate: (v) =>
      !v?.trim() || v.startsWith('sk-ant-') ? undefined : 'Must start with sk-ant-',
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

  const autoDeleteMerged = await select({
    message: 'Delete local branch after PR is merged?',
    options: [
      { value: 'ask', label: 'Ask each time' },
      { value: 'always', label: 'Always delete automatically' },
      { value: 'never', label: 'Never delete' },
    ],
    initialValue: existing?.autoDeleteMerged ?? 'ask',
  });

  const autoUpdateTicketStatus = await select({
    message: 'Update ticket status on branch start / complete?',
    options: [
      { value: 'ask', label: 'Ask each time' },
      { value: 'always', label: 'Always update automatically' },
      { value: 'never', label: 'Never update' },
    ],
    initialValue: existing?.autoUpdateTicketStatus ?? 'ask',
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
      validate: (v) => (v?.startsWith('https://') ? undefined : 'Must be an https URL'),
    });
    const userEmail = await text({
      message: 'Jira user email',
      initialValue: existing?.integrations.jira?.userEmail,
      validate: (v) => (v?.includes('@') ? undefined : 'Enter a valid email'),
    });
    const existingJiraToken = existing?.integrations.jira?.apiToken;
    const jiraApiTokenRaw = await password({
      message: existingJiraToken
        ? 'Jira API token — leave blank to keep existing'
        : 'Jira API token',
      validate: (v) => (!v?.trim() && !existingJiraToken ? 'Required' : undefined),
    });
    const apiToken = jiraApiTokenRaw.trim() || existingJiraToken!;
    jiraConfig = { enabled: true, baseUrl, userEmail, apiToken };
  }

  const enableSlack = await confirm({
    message: 'Enable Slack integration?',
    initialValue: existing?.integrations.slack?.enabled ?? false,
  });

  let slackConfig: GlobalConfig['integrations']['slack'] = undefined;
  if (enableSlack) {
    const existingSlackToken = existing?.integrations.slack?.apiToken;
    const slackApiTokenRaw = await password({
      message: existingSlackToken
        ? 'Slack bot token (xoxb-...) — leave blank to keep existing'
        : 'Slack bot token (xoxb-...)',
      validate: (v) => {
        if (!v?.trim()) return existingSlackToken ? undefined : 'Required';
        return v.startsWith('xoxb-') ? undefined : 'Must start with xoxb-';
      },
    });
    const apiToken = slackApiTokenRaw.trim() || existingSlackToken!;
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
    const existingNotionToken = existing?.integrations.notion?.apiToken;
    const notionApiTokenRaw = await password({
      message: existingNotionToken
        ? 'Notion integration token (secret_...) — leave blank to keep existing'
        : 'Notion integration token (secret_...)',
      validate: (v) => (!v?.trim() && !existingNotionToken ? 'Required' : undefined),
    });
    const apiToken = notionApiTokenRaw.trim() || existingNotionToken!;
    notionConfig = { enabled: true, apiToken };
  }

  return {
    version: 1,
    githubUsername,
    anthropicApiKey,
    autoStash,
    lastStashChoice: existing?.lastStashChoice,
    autoDeleteMerged,
    autoUpdateTicketStatus,
    integrations: { jira: jiraConfig, slack: slackConfig, notion: notionConfig },
  };
}

async function runConfig(options: { show?: boolean }): Promise<void> {
  if (options.show) {
    if (!(await configManager.hasGlobalConfig())) {
      console.log(theme.error('No config found.'), theme.muted('Run: morg config'));
      return;
    }
    const redact = (s: string) => s.slice(0, 8) + '••••••••';
    const envProfile = process.env.MORG_PROFILE;
    const projectId = await requireTrackedRepo().catch(() => undefined);
    const projectConfig = projectId
      ? await configManager.getProjectConfig(projectId).catch(() => undefined)
      : undefined;
    const projectProfile = projectConfig?.profile;
    const config = await configManager.getGlobalConfig(projectId);
    const globalProfile = config.activeProfile;
    console.log(theme.primaryBold('\nmorg config'));
    console.log(theme.muted('─'.repeat(40)));
    if (envProfile) {
      console.log(`  profile:         ${theme.success(envProfile)} ${theme.muted('(env)')}`);
    } else if (projectProfile) {
      console.log(
        `  profile:         ${theme.success(projectProfile)} ${theme.muted('(project)')}`,
      );
    } else if (globalProfile) {
      console.log(`  profile:         ${theme.success(globalProfile)} ${theme.muted('(global)')}`);
    }
    console.log(`  githubUsername:  ${theme.primary(config.githubUsername)}`);
    if (config.anthropicApiKey)
      console.log(`  anthropicApiKey: ${theme.muted(redact(config.anthropicApiKey))}`);
    console.log(`  autoStash:            ${theme.primary(config.autoStash)}`);
    console.log(`  autoDeleteMerged:     ${theme.primary(config.autoDeleteMerged)}`);
    console.log(`  autoUpdateTicketStatus: ${theme.primary(config.autoUpdateTicketStatus)}`);
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

  const updated = await runConfigWizard(existing);
  await configManager.saveGlobalConfig(updated);

  outro(theme.success(`${symbols.success} Config saved to ~/.morg/config.json`));
}

export function registerConfigCommand(program: Command): void {
  const config = program
    .command('config')
    .description('Configure morg (API keys, integrations)')
    .option('--show', 'Show current config (tokens redacted)')
    .action((options: { show?: boolean }) => runConfig(options));

  const profile = config.command('profile').description('Manage configuration profiles');

  profile
    .command('current')
    .description('Show the active profile')
    .action(async () => {
      if (process.env.MORG_PROFILE) {
        console.log(theme.success(process.env.MORG_PROFILE) + theme.muted(' (env)'));
        return;
      }
      const projectId = await requireTrackedRepo().catch(() => undefined);
      if (projectId) {
        const projectConfig = await configManager
          .getProjectConfig(projectId)
          .catch(() => undefined);
        if (projectConfig?.profile) {
          console.log(theme.success(projectConfig.profile) + theme.muted(' (project)'));
          return;
        }
      }
      const globalProfile = (await configManager.getGlobalConfig().catch(() => null))
        ?.activeProfile;
      if (globalProfile) {
        console.log(theme.success(globalProfile) + theme.muted(' (global)'));
      } else {
        console.log(theme.muted('none (using base config)'));
      }
    });

  profile
    .command('list')
    .description('List available profiles')
    .action(async () => {
      const profiles = await configManager.listProfiles();
      const current = (await configManager.getGlobalConfig().catch(() => null))?.activeProfile;
      if (profiles.length === 0) {
        console.log(
          theme.muted('No profiles found. Create one with: morg config profile create <name>'),
        );
        return;
      }
      console.log(theme.primaryBold('\n  Profiles'));
      for (const p of profiles) {
        const active = p === current ? theme.success(' (active)') : '';
        console.log(`  ${theme.primary(p)}${active}`);
      }
      console.log('');
    });

  profile
    .command('create <name>')
    .description('Create a new profile from current config')
    .action(async (name: string) => {
      const config = await configManager.getGlobalConfig();
      await configManager.saveProfileConfig(name, config);
      console.log(
        theme.success(
          `${symbols.success} Profile "${name}" created at ~/.morg/profiles/${name}/config.json`,
        ),
      );
      console.log(theme.muted(`  Use: MORG_PROFILE=${name} morg <command>`));
      console.log(theme.muted(`  Or activate: morg config profile use ${name}`));
    });

  profile
    .command('edit <name>')
    .description('Edit an existing profile with the interactive wizard')
    .action(async (name: string) => {
      const profiles = await configManager.listProfiles();
      if (!profiles.includes(name)) {
        console.error(theme.error(`Profile "${name}" not found. Run: morg config profile list`));
        process.exit(1);
      }
      intro(theme.primaryBold(`morg config profile edit ${name}`));
      const existing = await configManager.getProfileConfig(name);
      const updated = await runConfigWizard(existing);
      await configManager.saveProfileConfig(name, updated);
      outro(theme.success(`${symbols.success} Profile "${name}" updated`));
    });

  profile
    .command('use <name>')
    .description('Activate a named profile globally, or for the current project with --project')
    .option('--project', 'Set profile for the current project only')
    .action(async (name: string, options: { project?: boolean }) => {
      const profiles = await configManager.listProfiles();
      if (!profiles.includes(name)) {
        console.error(theme.error(`Profile "${name}" not found. Run: morg config profile list`));
        process.exit(1);
      }
      if (options.project) {
        const projectId = await requireTrackedRepo();
        const projectConfig = await configManager.getProjectConfig(projectId);
        projectConfig.profile = name;
        await configManager.saveProjectConfig(projectId, projectConfig);
        console.log(theme.success(`${symbols.success} Project profile set to "${name}"`));
      } else {
        const config = await configManager.getGlobalConfig();
        config.activeProfile = name;
        await configManager.saveGlobalConfig(config);
        console.log(theme.success(`${symbols.success} Switched to profile "${name}" globally`));
      }
    });
}
