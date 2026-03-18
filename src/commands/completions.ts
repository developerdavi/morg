import type { Command } from 'commander';
import { requireTrackedRepo } from '../utils/detect';
import { configManager } from '../config/manager';

async function runCompletions(type: string | undefined): Promise<void> {
  try {
    const projectId = await requireTrackedRepo();
    const { branches } = await configManager.getBranches(projectId);

    if (type === 'branches') {
      for (const b of branches) {
        if (b.status === 'active' || b.status === 'pr_open') {
          console.log(b.branchName);
        }
      }
    } else if (type === 'tickets') {
      const seen = new Set<string>();
      for (const b of branches) {
        if (b.ticketId && !seen.has(b.ticketId)) {
          seen.add(b.ticketId);
          console.log(b.ticketId);
        }
      }
    }
  } catch {
    // Silent — no output on error (repo not tracked, file missing, etc.)
  }
}

export function registerCompletionsCommand(program: Command): void {
  program
    .command('_completions [type]')
    .description('Output completion candidates (internal)')
    .action((type: string | undefined) => runCompletions(type));
}
