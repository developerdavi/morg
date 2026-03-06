import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { z } from 'zod';
import {
  GlobalConfigSchema,
  ProjectConfigSchema,
  ProjectsFileSchema,
  BranchesFileSchema,
  type GlobalConfig,
  type ProjectConfig,
  type ProjectsFile,
  type BranchesFile,
  type Branch,
} from './schemas';
import {
  CONFIG_FILE,
  PROJECTS_FILE,
  projectConfigFile,
  projectBranchesFile,
  projectDir,
  profileConfigFile,
  profilesDir,
} from './paths';
import { ConfigError } from '../utils/errors';

async function readJson<S extends z.ZodTypeAny>(
  path: string,
  schema: S,
  fallback?: z.output<S>,
): Promise<z.output<S>> {
  if (!existsSync(path)) {
    if (fallback !== undefined) return fallback;
    throw new ConfigError(`File not found: ${path}`);
  }
  const raw = await readFile(path, 'utf-8');
  return schema.parse(JSON.parse(raw)) as z.output<S>;
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

class ConfigManager {
  async getGlobalConfig(): Promise<GlobalConfig> {
    let raw: GlobalConfig;
    try {
      raw = await readJson(CONFIG_FILE, GlobalConfigSchema);
    } catch {
      throw new ConfigError('morg is not configured.', 'Run: morg config');
    }

    // Apply profile overlay: env var takes precedence over activeProfile field
    const profileName = process.env.MORG_PROFILE ?? raw.activeProfile;
    if (!profileName) return raw;

    const profilePath = profileConfigFile(profileName);
    if (!existsSync(profilePath)) return raw;

    try {
      const overlay = await readJson(profilePath, GlobalConfigSchema);
      return {
        ...raw,
        ...overlay,
        integrations: { ...raw.integrations, ...overlay.integrations },
        activeProfile: raw.activeProfile,
      };
    } catch {
      return raw;
    }
  }

  async saveGlobalConfig(config: GlobalConfig): Promise<void> {
    await writeJson(CONFIG_FILE, config);
  }

  async saveProfileConfig(name: string, config: GlobalConfig): Promise<void> {
    await writeJson(profileConfigFile(name), config);
  }

  async listProfiles(): Promise<string[]> {
    const dir = profilesDir();
    if (!existsSync(dir)) return [];
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }

  async hasGlobalConfig(): Promise<boolean> {
    return existsSync(CONFIG_FILE);
  }

  async getProjects(): Promise<ProjectsFile> {
    return readJson(PROJECTS_FILE, ProjectsFileSchema, { version: 1, projects: [] });
  }

  async saveProjects(data: ProjectsFile): Promise<void> {
    await writeJson(PROJECTS_FILE, data);
  }

  async getProjectConfig(id: string): Promise<ProjectConfig> {
    try {
      return await readJson(projectConfigFile(id), ProjectConfigSchema);
    } catch {
      throw new ConfigError(`No project config found for "${id}".`, 'Run: morg init');
    }
  }

  async saveProjectConfig(id: string, config: ProjectConfig): Promise<void> {
    await writeJson(projectConfigFile(id), config);
  }

  async hasProjectConfig(id: string): Promise<boolean> {
    return existsSync(projectConfigFile(id));
  }

  async getBranches(id: string): Promise<BranchesFile> {
    const newPath = projectBranchesFile(id);
    const oldPath = join(projectDir(id), 'tasks.json');
    if (!existsSync(newPath) && existsSync(oldPath)) {
      const old = JSON.parse(await readFile(oldPath, 'utf-8')) as { tasks?: unknown[] };
      await writeJson(newPath, { version: 1, branches: old.tasks ?? [] });
    }
    return readJson(newPath, BranchesFileSchema, { version: 1, branches: [] });
  }

  private pruneStale(branches: Branch[]): Branch[] {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return branches.filter(
      (b) => !['done', 'abandoned'].includes(b.status) || new Date(b.updatedAt).getTime() > cutoff,
    );
  }

  async saveBranches(id: string, data: BranchesFile): Promise<void> {
    const pruned = { ...data, branches: this.pruneStale(data.branches) };
    await writeJson(projectBranchesFile(id), pruned);
  }
}

export const configManager = new ConfigManager();
