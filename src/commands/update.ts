import type { Command } from 'commander';
import { execa } from 'execa';
import { theme, symbols } from '../ui/theme';

async function runUpdate(): Promise<void> {
  console.log(theme.muted('Updating morg...'));
  const result = await execa('pnpm', ['add', '-g', '@devdavi/morg@latest'], { reject: false });
  if (result.exitCode === 0) {
    console.log(theme.success(`${symbols.success} morg updated successfully.`));
  } else {
    console.error(theme.error('Update failed:'), result.stderr);
    process.exit(1);
  }
}

export function registerUpdateCommand(program: Command): void {
  program.command('update').description('Update morg to the latest version').action(runUpdate);
}
