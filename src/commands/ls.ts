import type { Command } from 'commander';
import { renderBranches } from '../ui/output';

export function registerLsCommand(program: Command): void {
  program
    .command('ls')
    .aliases(['branches'])
    .description('List all active branches and their statuses')
    .action(() => renderBranches());
}
