# morg

Developer productivity CLI that connects GitHub, Jira, Slack, and Claude to reduce context-switching friction.

## What it does

- Tracks which branch maps to which Jira/Notion ticket and PR
- Allows actions to be performed on Jira/Notion from CLI and automatically transitions tickets
- Stashes/restores work when switching between tasks
- Generates AI-written PR descriptions and review summaries via Claude
- Generates standup updates from recent git activity and posts them to Slack
- Shows a live task dashboard (`morg status`) with PR and CI state
- Rich ticket detail view: parent, child issues, issue links, Markdown description

## Prerequisites

- Node.js ≥ 20
- [pnpm](https://pnpm.io)
- [gh CLI](https://cli.github.com) (authenticated)
- `git`

## Installation

```bash
pnpm add -g @devdavi/morg
```

Or link from source:

```bash
git clone https://github.com/developerdavi/morg
cd morg
pnpm install && pnpm build && pnpm link:local
```

## Setup

```bash
morg config   # set API keys and enable integrations
morg init     # initialize the current repo
```

`morg config` stores credentials in `~/.morg/config.json`. You'll need:

| Integration | Credential |
|-------------|-----------|
| Claude | Anthropic API key (`sk-ant-...`) |
| Jira | Base URL + user email + API token |
| Slack | Bot token (`xoxb-...`) with `chat:write` scope |

## Commands

### Task workflow

```bash
morg start MORG-42              # fetch ticket, create branch, transition to In Progress
morg start feat/my-feature      # start from a branch name directly
morg start MORG-42 --worktree   # create a git worktree instead of checking out
morg switch MORG-42             # stash current work, switch to task's branch
morg track [branch] [ticket]    # link an existing branch to a ticket
morg untrack [branch]           # stop tracking a branch
morg complete                   # merge into default branch, mark ticket done
morg complete --yes             # skip confirmation
morg delete [branch]            # delete a fully-merged branch
morg delete -f                  # force-delete even with unmerged commits
morg clean                      # bulk-delete all fully-merged branches
```

### Status

```bash
morg status                     # table of active tasks with PR and CI badges
morg status --json              # output as JSON
```

### Tickets

```bash
morg tickets                    # list your recently viewed tickets (interactive picker)
morg tickets --plain            # non-interactive table output
morg tickets --json             # output as JSON
morg ticket MORG-42             # view ticket detail with action menu
morg ticket MORG-42 --plain     # non-interactive detail view
morg ticket --plain             # current branch's linked ticket
```

The detail view shows issue type, parent, child issues (including epic children),
issue links with correct direction ("is blocked by" vs "blocks"), and the
description rendered as Markdown with clickable links.

### Pull requests

```bash
morg pr create                  # create PR (Claude writes the description by default)
morg pr create --no-ai          # create PR with empty description
morg pr create --draft          # create as draft
morg pr create --title "..." --body "..." --yes  # non-interactive
morg pr view                    # view PR for current branch (shows CI status)
morg pr view MORG-42            # view PR for a specific branch or ticket
morg pr view --web              # open in browser
morg pr view --json             # output as JSON
morg pr view --wait             # poll until all CI checks pass or fail
morg pr review                  # list open PRs
morg pr review --ai             # list open PRs with Claude summaries
```

### Sync

```bash
morg sync                       # pull default branch, sync PR statuses, clean merged
morg sync --all                 # also offer rebase/merge for all active branches
```

### Standup

```bash
morg standup                    # generate standup from recent commits + tasks
morg standup --post             # generate and post to configured Slack channel
morg standup --channel C01234567  # post to a specific channel
```

### Worktrees

```bash
morg worktree list              # list all worktrees tracked by morg
morg worktree clean             # remove worktrees for done/abandoned branches
```

### Configuration profiles

Profiles let you switch between GitHub accounts, Jira instances, etc. Each profile
is a full copy of the global config at `~/.morg/profiles/<name>/config.json`.

```bash
morg config profile current             # show active profile and its source
morg config profile list                # list all profiles
morg config profile create work         # create a profile from current config
morg config profile edit work           # edit a profile with the interactive wizard
morg config profile use work            # activate a profile globally
morg config profile use work --project  # activate for current project only
MORG_PROFILE=work morg tickets          # use a profile for a single command
```

**Priority**: `MORG_PROFILE` env > project-level profile > global `activeProfile`.

### Shell prompt integration

Displays the current task's ticket ID in your shell prompt:

```bash
# add to ~/.zshrc
eval "$(morg prompt --shell zsh)"

# add to ~/.bashrc
eval "$(morg prompt --shell bash)"
```

### Tab completions

```bash
# add to ~/.zshrc
eval "$(morg completion zsh)"

# add to ~/.bashrc
eval "$(morg completion bash)"
```

### Other

```bash
morg config --show              # display current config (tokens redacted)
morg update                     # update to latest version
morg install-claude-skill       # install the morg skill into ~/.claude/skills/
```

## State

All state lives under `~/.morg/`:

```
~/.morg/
├── config.json                   # global config (API keys, active profile)
├── projects.json                 # registered repos
├── projects/<id>/
│   ├── config.json               # per-repo config (GitHub repo, Jira project key, profile)
│   └── branches.json             # branch tracking (branch → ticket, PR status)
└── profiles/
    └── <name>/
        └── config.json           # named profile (full GlobalConfig overlay)
```

## Development

```bash
pnpm install
pnpm dev -- status              # run a command with live reload (no rebuild needed)
pnpm build                      # bundle to dist/index.js
pnpm typecheck
pnpm lint --fix
pnpm test
pnpm test tests/integrations/jira.test.ts  # run a single test file
```