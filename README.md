# morg

Developer productivity CLI that connects GitHub, Jira, Slack, and Claude to reduce context-switching friction.

## What it does

- Tracks which branch maps to which Jira ticket and PR
- Stashes/restores work when switching between tasks
- Generates AI-written PR descriptions and review summaries via Claude
- Generates standup updates from recent git activity and posts them to Slack
- Shows a live task dashboard (`morg status`) with PR state

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
morg start MORG-42          # fetch ticket, create branch, write task entry
morg start feat/my-feature  # start from a branch name directly
morg switch MORG-42         # stash current work, switch to task's branch
morg switch main            # stash and switch to any branch
morg track [branch] [ticket] # link an existing branch to a ticket
morg untrack [branch]        # stop tracking a branch
```

### Status

```bash
morg             # same as morg status
morg status      # table of active tasks with PR badges
```

### Pull requests

```bash
morg pr create          # create PR (Claude writes the description by default)
morg pr create --no-ai  # create PR with empty description
morg pr create --draft  # create as draft
morg pr review          # list open PRs
morg pr review --ai     # list open PRs with Claude summaries
```

### Sync & standup

```bash
morg sync               # detect merged PRs, update task statuses
morg standup            # generate standup from recent commits + tasks
morg standup --post     # generate and post to configured Slack channel
morg standup --channel C01234567  # post to a specific channel
```

### Shell prompt integration

Displays the current task's ticket ID in your shell prompt:

```bash
# add to ~/.zshrc
eval "$(morg prompt --shell zsh)"

# add to ~/.bashrc
eval "$(morg prompt --shell bash)"
```

### Other

```bash
morg config --show  # display current config (tokens redacted)
morg update         # update to latest version
```

## State

All state lives under `~/.morg/`:

```
~/.morg/
├── config.json               # global config (API keys)
├── projects.json             # registered repos
└── projects/<id>/
    ├── config.json           # per-repo config (GitHub repo, Jira project key)
    └── tasks.json            # task tracking
```

## Development

```bash
pnpm install
pnpm dev -- status           # run a command with live reload (no rebuild needed)
pnpm build                   # bundle to dist/index.js
pnpm typecheck
pnpm test
pnpm test tests/ticket.test.ts  # run a single test file
```
