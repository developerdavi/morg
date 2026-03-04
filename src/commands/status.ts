import type { Command } from 'commander';
import { renderStatus } from '../ui/output';

export async function runStatus(): Promise<void> {
  await renderStatus();
}

export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show current task status (default command)')
    .option('--branch <branch>', 'Filter by branch (for shell prompt integration)')
    .option('--short', 'Short output (for shell prompt integration)')
    .action((options: { branch?: string; short?: boolean }) => renderStatus(options));
}
