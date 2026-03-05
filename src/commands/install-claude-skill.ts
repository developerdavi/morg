import type { Command } from 'commander';
import { mkdir, copyFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { theme, symbols } from '../ui/theme';
import { confirm } from '../ui/prompts';

async function runInstallClaudeSkill(options: { yes?: boolean }): Promise<void> {
  // Resolve skill source relative to the package root (dist/../.claude/skills/morg/skill.md)
  const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const skillSrc = join(pkgRoot, '.claude', 'skills', 'morg', 'skill.md');

  if (!existsSync(skillSrc)) {
    console.error(theme.error('Skill file not found in package. Try reinstalling morg.'));
    process.exit(1);
  }

  const destDir = join(homedir(), '.claude', 'skills', 'morg');
  const destFile = join(destDir, 'skill.md');

  if (existsSync(destFile) && !options.yes) {
    const overwrite = await confirm({
      message: 'Skill already installed. Overwrite with latest version?',
      initialValue: true,
    });
    if (!overwrite) {
      console.log(theme.muted('Cancelled.'));
      return;
    }
  }

  await mkdir(destDir, { recursive: true });
  await copyFile(skillSrc, destFile);

  console.log(
    theme.success(`${symbols.success} Skill installed to ~/.claude/skills/morg/skill.md`),
  );
  console.log(theme.muted(`  Invoke it with /morg in any Claude Code session.`));
}

export function registerInstallClaudeSkillCommand(program: Command): void {
  program
    .command('install-claude-skill')
    .description('Install the morg Claude Code skill to ~/.claude/skills/')
    .option('-y, --yes', 'Overwrite existing skill without prompting')
    .action(runInstallClaudeSkill);
}
