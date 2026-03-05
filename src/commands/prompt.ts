import type { Command } from 'commander';
import { theme } from '../ui/theme';

function runPrompt(shell: string): void {
  if (shell === 'zsh') {
    console.log(`# Add to ~/.zshrc:
# eval "$(morg prompt --shell zsh)"
morg_status() {
  local branch
  branch=$(git branch --show-current 2>/dev/null) || return
  [[ -z "$branch" ]] && return
  morg status --branch "$branch" --short 2>/dev/null
}
RPROMPT='$(morg_status)'`);
  } else if (shell === 'bash') {
    console.log(`# Add to ~/.bashrc:
# eval "$(morg prompt --shell bash)"
morg_status() {
  local branch
  branch=$(git branch --show-current 2>/dev/null) || return
  [[ -z "$branch" ]] && return
  morg status --branch "$branch" --short 2>/dev/null
}
PS1="\\u@\\h:\\w \\$(morg_status)\\$ "`);
  } else {
    console.error(
      theme.error(`Unknown shell: ${shell}`),
      theme.muted('Use --shell zsh or --shell bash'),
    );
    process.exit(1);
  }
}

export function registerPromptCommand(program: Command): void {
  program
    .command('prompt')
    .description('Output shell prompt integration snippet')
    .option('--shell <shell>', 'Shell type: zsh or bash', 'zsh')
    .action((options: { shell: string }) => runPrompt(options.shell));
}
