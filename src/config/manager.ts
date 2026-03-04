import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname } from 'path';
import { z } from 'zod';
import {
  GlobalConfigSchema,
  ProjectConfigSchema,
  ProjectsFileSchema,
  TasksFileSchema,
  type GlobalConfig,
  type ProjectConfig,
  type ProjectsFile,
  type TasksFile,
} from './schemas';
import { CONFIG_FILE, PROJECTS_FILE, projectConfigFile, projectTasksFile } from './paths';
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
    try {
      return await readJson(CONFIG_FILE, GlobalConfigSchema);
    } catch {
      throw new ConfigError('morg is not configured.', 'Run: morg config');
    }
  }

  async saveGlobalConfig(config: GlobalConfig): Promise<void> {
    await writeJson(CONFIG_FILE, config);
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

  async getTasks(id: string): Promise<TasksFile> {
    return readJson(projectTasksFile(id), TasksFileSchema, { version: 1, tasks: [] });
  }

  async saveTasks(id: string, data: TasksFile): Promise<void> {
    await writeJson(projectTasksFile(id), data);
  }
}

export const configManager = new ConfigManager();
