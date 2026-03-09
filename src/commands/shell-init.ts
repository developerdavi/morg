import type { Command } from 'commander';
import { tmpdir } from 'os';
import { join } from 'path';

const COMMANDS = [
  'config',
  'init',
  'start',
  'track',
  'untrack',
  'switch',
  'pr',
  'sync',
  'status',
  'standup',
  'prompt',
  'update',
  'complete',
  'delete',
  'clean',
  'tickets',
  'ticket',
  'worktree',
  'shell-init',
];

/**
 * Shell function wrapper shared by bash and zsh.
 * Sets MORG_SHELL_INIT=1 so the CLI knows the wrapper is active, then
 * reads the temp file written by `morg switch` to cd into worktree paths.
 */
function wrapperFunction(): string {
  const cdFile = join(tmpdir(), 'morg_chdir_');
  return [
    'morg() {',
    '  MORG_SHELL_INIT=1 command morg "$@"',
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

function generateBashCompletion(commands: string[]): string {
  return `# morg shell integration (tab completion + automatic worktree cd)
# Add to ~/.bashrc: eval "$(morg shell-init bash)"

${wrapperFunction()}

_morg_completion() {
  local cur prev words
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  if [[ \${COMP_CWORD} == 1 ]]; then
    COMPREPLY=( $(compgen -W "${commands.join(' ')}" -- "\${cur}") )
    return
  fi

  case "\${prev}" in
    pr)
      COMPREPLY=( $(compgen -W "create review view" -- "\${cur}") )
      ;;
    worktree)
      COMPREPLY=( $(compgen -W "list clean" -- "\${cur}") )
      ;;
    config)
      COMPREPLY=( $(compgen -W "--show profile" -- "\${cur}") )
      ;;
    profile)
      COMPREPLY=( $(compgen -W "current list create edit use" -- "\${cur}") )
      ;;
    completion)
      COMPREPLY=( $(compgen -W "bash zsh" -- "\${cur}") )
      ;;
    start)
      COMPREPLY=( $(compgen -W "--worktree --base" -- "\${cur}") )
      ;;
    sync)
      COMPREPLY=( $(compgen -W "--all" -- "\${cur}") )
      ;;
    status)
      COMPREPLY=( $(compgen -W "--json --short" -- "\${cur}") )
      ;;
    tickets|ticket)
      COMPREPLY=( $(compgen -W "--plain --json" -- "\${cur}") )
      ;;
    *)
      ;;
  esac
}
complete -F _morg_completion morg`;
}

function generateZshCompletion(commands: string[]): string {
  const commandDefs = commands.map((c) => `  '${c}'`).join('\n');
  return `# morg shell integration (tab completion + automatic worktree cd)
# Add to ~/.zshrc: eval "$(morg shell-init zsh)"

${wrapperFunction()}

_morg() {
  local state

  _arguments \\
    '1: :->command' \\
    '*: :->args'

  case \$state in
    command)
      local -a commands
      commands=(
${commandDefs}
      )
      _describe 'command' commands
      ;;
    args)
      case \$words[2] in
        pr)
          local -a subcmds
          subcmds=('create' 'review' 'view')
          _describe 'subcommand' subcmds
          ;;
        worktree)
          local -a subcmds
          subcmds=('list' 'clean')
          _describe 'subcommand' subcmds
          ;;
        config)
          case \$words[3] in
            profile)
              case \$words[4] in
                current|create|edit|use|list)
                  ;;
                *)
                  local -a profcmds
                  profcmds=('current' 'list' 'create' 'edit' 'use')
                  _describe 'subcommand' profcmds
                  ;;
              esac
              ;;
            *)
              local -a subcmds
              subcmds=('--show' 'profile')
              _describe 'subcommand' subcmds
              ;;
          esac
          ;;
        completion)
          local -a shells
          shells=('bash' 'zsh')
          _describe 'shell' shells
          ;;
        start)
          _arguments '--worktree[Create git worktree]' '--base[Base branch]'
          ;;
        status)
          _arguments '--json[Output as JSON]' '--short[Short output]'
          ;;
        tickets|ticket)
          _arguments '--plain[Plain output]' '--json[Output as JSON]'
          ;;
      esac
      ;;
  esac
}

compdef _morg morg`;
}

function runCompletion(shell: string | undefined): void {
  if (!shell) {
    console.error('Usage: morg shell-init <shell>  (supported: bash, zsh)');
    process.exit(1);
  }
  if (shell === 'bash') {
    console.log(generateBashCompletion(COMMANDS));
  } else if (shell === 'zsh') {
    console.log(generateZshCompletion(COMMANDS));
  } else {
    console.error(`Unknown shell: ${shell}. Supported: bash, zsh`);
    process.exit(1);
  }
}

export function registerShellInitCommand(program: Command): void {
  program
    .command('shell-init [shell]')
    .description('Output shell integration script (tab completion + automatic worktree cd)')
    .addHelpText(
      'after',
      '\nInstall:\n  bash: eval "$(morg shell-init bash)"  # add to ~/.bashrc\n  zsh:  eval "$(morg shell-init zsh)"   # add to ~/.zshrc',
    )
    .action((shell: string | undefined) => runCompletion(shell));
}
