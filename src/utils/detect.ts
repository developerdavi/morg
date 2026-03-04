import { execa } from 'execa';
import { configManager } from '../config/manager';
import { getRepoRoot } from '../git/index';
import { ConfigError } from './errors';

export async function requireConfig(): Promise<void> {
  const has = await configManager.hasGlobalConfig();
  if (!has) throw new ConfigError('morg is not configured.', 'Run: morg config');
}

export async function requireTrackedRepo(): Promise<string> {
  const root = await getRepoRoot();
  const projects = await configManager.getProjects();
  const project = projects.projects.find((p) => p.path === root);
  if (!project) {
    throw new ConfigError('This repository is not initialized with morg.', 'Run: morg init');
  }
  return project.id;
}

export async function detectTools(): Promise<{ hasGh: boolean; hasGit: boolean }> {
  const [gh, git] = await Promise.all([
    execa('which', ['gh'], { reject: false }),
    execa('which', ['git'], { reject: false }),
  ]);
  return { hasGh: gh.exitCode === 0, hasGit: git.exitCode === 0 };
}
