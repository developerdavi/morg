import { homedir } from 'os';
import { join } from 'path';

export const MORG_DIR = join(homedir(), '.morg');
export const CONFIG_FILE = join(MORG_DIR, 'config.json');
export const PROJECTS_FILE = join(MORG_DIR, 'projects.json');

export function projectDir(id: string): string {
  return join(MORG_DIR, 'projects', id);
}

export function projectConfigFile(id: string): string {
  return join(projectDir(id), 'config.json');
}

export function projectTasksFile(id: string): string {
  return join(projectDir(id), 'tasks.json');
}
