import type { Command } from 'commander';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Generate the shell wrapper function for bash.
 *
 * The wrapper calls the real `morg` binary, then checks for a temp file
 * written by `morg switch` when the target branch lives in a worktree.
 * If found, it changes the shell's working directory to the worktree path.
 */
function shellInitBash(): string {
  const cdFile = join(tmpdir(), 'morg_chdir_');
  return [
    '# morg shell integration — automatic worktree cd on `morg switch`',
    '# Add to ~/.bashrc: eval "$(morg shell-init bash)"',
    'morg() {',
    '  command morg "$@"',
    '  local _morg_exit=$?',
    `  local _morg_cd="${cdFile}$$"`,
    '  if [[ -f "$_morg_cd" ]]; then',
    '    local _morg_target',
    '    _morg_target=$(cat "$_morg_cd")',
    '    rm -f "$_morg_cd"',
    '    if [[ -n "$_morg_target" && -d "$_morg_target" ]]; then',
    '      cd "$_morg_target" || true',
    '    fi',
    '  fi',
    '  return $_morg_exit',
    '}',
  ].join('\n');
}

/**
 * Generate the shell wrapper function for zsh.
 */
function shellInitZsh(): string {
  const cdFile = join(tmpdir(), 'morg_chdir_');
  return [
    '# morg shell integration — automatic worktree cd on `morg switch`',
    '# Add to ~/.zshrc: eval "$(morg shell-init zsh)"',
    'morg() {',
    '  command morg "$@"',
    '  local _morg_exit=$?',
    `  local _morg_cd="${cdFile}$$"`,
    '  if [[ -f "$_morg_cd" ]]; then',
    '    local _morg_target',
    '    _morg_target=$(cat "$_morg_cd")',
    '    rm -f "$_morg_cd"',
    '    if [[ -n "$_morg_target" && -d "$_morg_target" ]]; then',
    '      cd "$_morg_target" || true',
    '    fi',
    '  fi',
    '  return $_morg_exit',
    '}',
  ].join('\n');
}

function runShellInit(shell: string): void {
  if (shell === 'bash') {
    console.log(shellInitBash());
  } else if (shell === 'zsh') {
    console.log(shellInitZsh());
  } else {
    console.error(`Unknown shell: ${shell}. Supported: bash, zsh`);
    process.exit(1);
  }
}

export function registerShellInitCommand(program: Command): void {
  program
    .command('shell-init [shell]')
    .description('Output shell integration script (enables automatic cd into worktree on switch)')
    .addHelpText(
      'after',
      '\nInstall:\n  bash: eval "$(morg shell-init bash)"  # add to ~/.bashrc\n  zsh:  eval "$(morg shell-init zsh)"   # add to ~/.zshrc',
    )
    .action((shell = 'bash') => runShellInit(shell));
}
