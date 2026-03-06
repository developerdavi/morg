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

export function projectBranchesFile(id: string): string {
  return join(projectDir(id), 'branches.json');
}

export function profilesDir(): string {
  return join(MORG_DIR, 'profiles');
}

export function profileDir(name: string): string {
  return join(profilesDir(), name);
}

export function profileConfigFile(name: string): string {
  return join(profileDir(name), 'config.json');
}
