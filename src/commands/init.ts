import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { getRepoRoot, getRemote, getDefaultBranch } from '../git/index';
import { theme, symbols } from '../ui/theme';
import { intro, outro, text, confirm } from '../ui/prompts';

async function runInit(): Promise<void> {
  intro(theme.primaryBold('morg init'));

  if (!(await configManager.hasGlobalConfig())) {
    console.error(theme.error('No global config found.'), theme.muted('Run: morg config first.'));
    process.exit(1);
  }

  const globalConfig = await configManager.getGlobalConfig();
  const repoRoot = await getRepoRoot();
  const remote = await getRemote();

  // Infer default repo name from remote or directory name
  let defaultRepo = `${globalConfig.githubUsername}/${repoRoot.split('/').pop() ?? 'repo'}`;
  if (remote) {
    const match = /github\.com[:/]([^/]+\/[^/.]+)/.exec(remote);
    if (match?.[1]) defaultRepo = match[1];
  }

  const projectId =
    repoRoot
      .split('/')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9-]/g, '-') ?? 'project';

  const projects = await configManager.getProjects();
  const existing = projects.projects.find((p) => p.path === repoRoot);
  if (existing) {
    console.log(theme.warning(`This repo is already initialized as "${existing.id}".`));
    const reinit = await confirm({ message: 'Re-initialize?', initialValue: false });
    if (!reinit) {
      outro(theme.muted('Cancelled.'));
      return;
    }
  }

  const githubRepo = await text({
    message: 'GitHub repo (owner/name)',
    initialValue: defaultRepo,
    validate: (v) => (v.includes('/') ? undefined : 'Format: owner/repo'),
  });

  const detectedBranch = await getDefaultBranch();
  const defaultBranch = await text({
    message: 'Default branch (used as PR base and branch creation base)',
    initialValue: detectedBranch,
    validate: (v) => (v.trim() ? undefined : 'Required'),
  });

  const jiraEnabled =
    globalConfig.integrations.jira?.enabled === true &&
    (await confirm({ message: 'Enable Jira for this project?', initialValue: true }));

  let jiraProjectKey: string | undefined;
  if (jiraEnabled) {
    const raw = await text({
      message: 'Jira project key (e.g. MORG)',
      validate: (v) => (/^[A-Z][A-Z0-9]+$/i.test(v.trim()) ? undefined : 'e.g. MORG'),
    });
    jiraProjectKey = raw.trim().toUpperCase();
  }

  const now = new Date().toISOString();
  await configManager.saveProjects({
    version: 1,
    projects: [
      ...projects.projects.filter((p) => p.path !== repoRoot),
      { id: projectId, name: projectId, path: repoRoot, createdAt: now },
    ],
  });

  await configManager.saveProjectConfig(projectId, {
    version: 1,
    projectId,
    githubUsername: globalConfig.githubUsername,
    githubRepo,
    defaultBranch,
    integrations: {
      github: { enabled: true },
      jira: jiraEnabled && jiraProjectKey
        ? { enabled: true, projectKey: jiraProjectKey, defaultTransitions: { start: 'In Progress', done: 'Done' } }
        : undefined,
    },
  });

  outro(theme.success(`${symbols.success} Initialized "${projectId}" at ${repoRoot}`));
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize morg for the current repository')
    .action(runInit);
}
