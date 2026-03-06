import type { Command } from 'commander';

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
  'completion',
];

function generateBashCompletion(commands: string[]): string {
  return `# morg bash completion
# Add to ~/.bashrc: eval "$(morg completion bash)"
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
      COMPREPLY=( $(compgen -W "list create use" -- "\${cur}") )
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
  return `# morg zsh completion
# Add to ~/.zshrc: eval "$(morg completion zsh)"

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
                create|use|list)
                  ;;
                *)
                  local -a profcmds
                  profcmds=('list' 'create' 'use')
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

function runCompletion(shell: string): void {
  if (shell === 'bash') {
    console.log(generateBashCompletion(COMMANDS));
  } else if (shell === 'zsh') {
    console.log(generateZshCompletion(COMMANDS));
  } else {
    console.error(`Unknown shell: ${shell}. Supported: bash, zsh`);
    process.exit(1);
  }
}

export function registerCompletionCommand(program: Command): void {
  program
    .command('completion [shell]')
    .description('Output shell tab-completion script (bash or zsh)')
    .addHelpText(
      'after',
      '\nInstall:\n  bash: eval "$(morg completion bash)"  # add to ~/.bashrc\n  zsh:  eval "$(morg completion zsh)"   # add to ~/.zshrc',
    )
    .action((shell = 'bash') => runCompletion(shell));
}
