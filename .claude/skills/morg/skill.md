---
name: morg
description: |
  Use morg CLI to handle the full task lifecycle: starting tickets, switching
  branches, creating PRs, changing ticket statuses, syncing, and completing tasks.
  Triggers: "start working on MORG-XX", "create a PR for this branch",
  "switch to ticket", "sync branches", "what's my current ticket", "complete this task",
  "move ticket to In Progress", "get ticket details", "delete this branch"
allowed-tools: Bash
---

# morg — Task Lifecycle Skill

`morg` is a developer productivity CLI that connects git branches with tickets
(Jira or Notion) and GitHub PRs. Always use `morg` commands for the operations
below — never fall back to raw `gh` or manual git for anything morg covers.

## Getting Ticket Details

```bash
# View current branch's linked ticket
morg ticket --plain

# View a specific ticket
morg ticket MORG-42 --plain

# Output as JSON (for scripting)
morg ticket MORG-42 --json
```

**IMPORTANT**: Always use `--plain` — the default mode is interactive (requires
a TTY) and will fail when run by Claude Code.

## Starting a New Task

```bash
# From a ticket ID (creates branch named morg-42, links ticket, offers status transition)
morg start MORG-42

# From a branch name
morg start feat/my-feature

# From a ticket with a custom base branch
morg start MORG-42 --base develop

# Create a git worktree instead of checking out
morg start MORG-42 --worktree
```

`morg start` handles:
- Stashing dirty working tree if needed
- Pulling the base branch before creating
- Transitioning the ticket to "In Progress" (respects `autoUpdateTicketStatus` config)
- Tracking the branch in `~/.morg/projects/<id>/branches.json`

## Switching Between Tasks

```bash
# Interactive branch picker
morg switch

# Switch to a specific branch or ticket
morg switch morg-42
morg switch MORG-42
```

`morg switch` handles dirty working tree (stash/skip) automatically.

## Viewing Status

```bash
# Show all tracked branches, their tickets, and PR statuses
morg status

# Output as JSON
morg status --json
```

## Managing Tickets

```bash
# List tickets assigned to you (interactive picker)
morg tickets

# List tickets without interactive prompt
morg tickets --plain

# Output as JSON
morg tickets --json

# Show recently accessed tickets (Jira only)
morg tickets --history

# View a specific ticket (interactive actions: start branch, change status, open URL)
morg ticket MORG-42

# View without interactive prompt (for reading details programmatically)
morg ticket MORG-42 --plain

# View current branch's ticket
morg ticket --plain
```

The ticket detail view shows:
- Issue type, status, parent, assignee, URL
- Child issues (subtasks + epic children) — select "View child issues" to navigate
- Issue links with correct direction ("is blocked by" vs "blocks")
- Description rendered as Markdown with clickable links

## Creating Pull Requests

```bash
# Interactive (AI-generated description)
morg pr create

# Non-interactive with explicit title and body (use this when running without a TTY)
morg pr create --title "feat(MORG-42): add feature X" --body "Description here" --yes

# Skip AI description, use defaults
morg pr create --yes

# Draft PR
morg pr create --draft

# View the PR for current branch
morg pr view

# View PR for a specific branch or ticket
morg pr view feat/my-feature
morg pr view MORG-42

# Open PR in browser
morg pr view --web

# Output PR as JSON
morg pr view --json

# Wait for all CI checks to pass (polls until done or timeout)
morg pr view --wait
morg pr view --wait --timeout 300
```

**PR title convention**: `type(TICKET-ID): short description`
- `feat`, `fix`, `chore`, `refactor`, `docs`, `test`

**PR body should include**:
- What changed and why
- Link to ticket (closes MORG-XX)
- Any notable implementation details

## Syncing Branches

```bash
# Sync current branch with latest main (default)
# Flow: pull main → sync PR statuses → delete merged → offer rebase/merge for current branch
morg sync

# Also offer rebase/merge for ALL active branches
morg sync --all
```

`morg sync` always pulls the default branch without prompting. It then updates
PR statuses, deletes merged branches (per config), and offers to rebase/merge
the current branch (or all with `--all`).

## Completing a Task

```bash
# Merge current branch into default branch and mark done
morg complete

# Skip confirmation
morg complete --yes

# Complete without deleting the branch
morg complete --no-delete
```

`morg complete` merges into the default branch, optionally transitions the
ticket to "Done", and deletes the branch.

## Deleting a Branch

```bash
# Delete current branch (only if fully merged)
morg delete

# Delete a specific branch
morg delete morg-42

# Force delete even with unmerged commits
morg delete -f
```

## Tracking / Untracking Branches

```bash
# Track current branch (link it to morg's registry)
morg track

# Track a specific branch and link to a ticket
morg track my-branch MORG-42

# Stop tracking current branch
morg untrack

# Stop tracking a specific branch
morg untrack my-branch
```

## Managing Worktrees

```bash
# List all worktrees tracked by morg
morg worktree list

# Remove worktrees for done or abandoned branches
morg worktree clean
```

## Configuration Profiles

Profiles let you switch between GitHub accounts, Jira instances, or Slack
workspaces. Each profile is a full copy of the global config stored at
`~/.morg/profiles/<name>/config.json`.

```bash
# Show the active profile (and its source: env / project / global)
morg config profile current

# List available profiles
morg config profile list

# Create a new profile from current config
morg config profile create work

# Edit an existing profile
morg config profile edit work

# Activate a profile globally
morg config profile use work

# Activate a profile for the current project only
morg config profile use work --project
```

**Priority order**: `MORG_PROFILE` env var > project-level profile > global `activeProfile`.

```bash
# Use a profile for a single command
MORG_PROFILE=work morg tickets
```

## Configuration

```bash
# Show current config (tokens redacted, shows active profile source)
morg config --show

# Reconfigure (prompts pre-filled with existing values — leave blank to keep)
morg config

# Initialize morg for the current repo
morg init
```

## Shell Completions

```bash
# Install tab completions
eval "$(morg completion zsh)"   # zsh
eval "$(morg completion bash)"  # bash
```

## Typical Workflows

### Starting a ticket and creating a PR

```bash
# 1. Get ticket context
morg ticket MORG-42 --plain

# 2. Start working (creates branch, pulls main, transitions ticket)
morg start MORG-42

# ... make code changes ...

# 3. Create PR
morg pr create --title "feat(MORG-42): description" --body "$(cat <<'EOF'
Closes MORG-42

## Summary
- What changed

## Test plan
- How to verify
EOF
)" --yes
```

### Switching tasks mid-work

```bash
# Switch away (stashes automatically if dirty)
morg switch MORG-99

# ... do some work ...

# Switch back
morg switch MORG-42
```

### Daily sync routine

```bash
# Pull main, sync PR statuses, clean up merged, update current branch
morg sync
```

### Checking in on all work

```bash
morg status
```

## Notes

- `morg ticket --plain` is the right way to get ticket context for Claude Code
- All interactive commands have non-interactive equivalents via flags (`--yes`, `--plain`, `--title`, `--body`)
- Jira and Notion are both supported; morg detects which is configured per project
- Branch names are derived from ticket IDs: `MORG-42` → branch `morg-42`
- `morg tickets` (plural) always lists; `morg ticket` (singular) defaults to current branch's ticket
- State is stored in `~/.morg/` — never edit these files directly
