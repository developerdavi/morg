import type { Command } from 'commander';
import { configManager } from '../config/manager';
import { getRepoRoot, getRemote, getDefaultBranch } from '../git/index';
import { theme, symbols } from '../ui/theme';
import { intro, outro, text, confirm } from '../ui/prompts';
import { withSpinner } from '../ui/spinner';

const NOTION_ID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})/i;
const NOTION_HEADERS = (apiToken: string) => ({
  Authorization: `Bearer ${apiToken}`,
  'Notion-Version': '2022-06-28',
});

async function resolveNotionDatabaseId(apiToken: string, url: string): Promise<string> {
  const match = NOTION_ID_RE.exec(url.split('?')[0] ?? url);
  if (!match) throw new Error('No Notion ID found in that URL.');
  const id = match[1]!;
  const headers = NOTION_HEADERS(apiToken);

  // If the URL points to a page inside a database, get the parent database ID
  const pageRes = await fetch(`https://api.notion.com/v1/pages/${id}`, { headers });
  if (pageRes.ok) {
    const page = (await pageRes.json()) as { parent?: { type: string; database_id?: string } };
    if (page.parent?.type === 'database_id' && page.parent.database_id) {
      return page.parent.database_id;
    }
  }

  // Otherwise treat the ID as the database itself
  const dbRes = await fetch(`https://api.notion.com/v1/databases/${id}`, { headers });
  if (dbRes.ok) return id;

  const err = (await dbRes.json().catch(() => ({}))) as { message?: string };
  throw new Error(err.message ?? `Could not find a database at that URL.`);
}

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

  const notionEnabled =
    globalConfig.integrations.notion?.enabled === true &&
    (await confirm({ message: 'Enable Notion for this project?', initialValue: true }));

  let notionDatabaseId: string | undefined;
  if (notionEnabled) {
    const notionUrl = await text({
      message: 'Notion database URL (or URL of any page inside it)',
      placeholder: 'https://www.notion.so/My-Database-8a4b8c3d2e1f4a5b9c6d7e8f9a0b1c2d',
      validate: (v) => {
        if (!v.trim()) return 'Required';
        if (!NOTION_ID_RE.test(v.split('?')[0] ?? v))
          return 'Could not find a Notion ID in that URL.';
        return undefined;
      },
    });
    notionDatabaseId = await withSpinner('Resolving database...', () =>
      resolveNotionDatabaseId(globalConfig.integrations.notion!.apiToken, notionUrl),
    );
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
    syncPull: 'ask',
    integrations: {
      github: { enabled: true },
      jira:
        jiraEnabled && jiraProjectKey
          ? {
              enabled: true,
              projectKey: jiraProjectKey,
              defaultTransitions: { start: 'In Progress', done: 'Done' },
            }
          : undefined,
      notion:
        notionEnabled && notionDatabaseId
          ? {
              enabled: true,
              databaseId: notionDatabaseId,
              titleProperty: 'Task name',
              statusProperty: 'Status',
              idProperty: 'ID',
            }
          : undefined,
    },
  });

  outro(theme.success(`${symbols.success} Initialized "${projectId}" at ${repoRoot}`));
}

export function registerInitCommand(program: Command): void {
  program.command('init').description('Initialize morg for the current repository').action(runInit);
}
