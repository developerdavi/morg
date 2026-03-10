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
(Jira or Notion) and GitHub PRs.

## MANDATORY WORKFLOW — Always Follow This

**CRITICAL**: When asked to implement tickets (e.g. "implement MORG-52"), you MUST use the full
morg lifecycle. Never make code changes directly on `main` or without a branch.

### Required steps for every ticket:

```bash
# 1. Get context
morg ticket MORG-XX --plain

# 2. Start the branch (BEFORE making any code changes)
morg start MORG-XX

# 3. Make your code changes

# 4. Commit (git add + git commit)

# 5. Create the PR
morg pr create --title "type(MORG-XX): description" --body "..." --yes
```

**If asked to implement multiple tickets in sequence**:
- In sequence means: not in parallel, not in worktrees
- Do the full lifecycle (start → code → commit → PR) for ticket 1
- Do the full lifecycle for ticket 2
- Repeat until all tickets are implemented

**If asked to implement one or more tickets in parallel**:
- In parallel means: in worktrees, in parallel branches
- Spawn agents to work on the tickets in parallel
- Do the full lifecycle for each ticket, using worktree branches

**Never**:
- Edit files before running `morg start`
- Work directly on `main`
- Skip `morg pr create` after finishing a ticket
- Use `git checkout -b`, `gh pr create`, or `git checkout main` directly

## Always Use morg (Never Raw git/gh)

| Task | ❌ Never | ✓ Always |
|------|---------|----------|
| Switch branches | `git checkout`, `git switch` | `morg switch MORG-42` |
| Create PR | `gh pr create` | `morg pr create` |
| View PR | `gh pr view` | `morg pr view` |
| Switch + stash | `git stash && git checkout` | `morg switch` (handles stash automatically) |

## Non-TTY Usage (--plain / --json)

Claude Code runs without a TTY. Commands that are interactive by default need flags:

| Command | Non-interactive flag | Notes |
|---------|---------------------|-------|
| `morg ticket MORG-42` | `--plain` or `--json` | **Always required** |
| `morg tickets` | `--plain` or `--json` | **Always required** |
| `morg pr view` | `--json` | For structured output |
| `morg pr create` | `--yes --title "..." --body "..."` | **Always required** |
| `morg status` | `--json` | Default output works in non-TTY |
| `morg switch MORG-42` | *(no flag needed)* | Works non-interactively with explicit branch |
| `morg switch` | *(no --plain; interactive)* | Prompts for branch selection — requires TTY |
| `morg start` | *(auto-detects TTY)* | Works non-interactively |

**Rule**: When reading ticket/PR data programmatically, always use `--plain` or `--json`.
When creating PRs, always pass `--yes --title --body`.

## Getting Ticket Details

```bash
# View current branch's linked ticket
morg ticket --plain

# View a specific ticket
morg ticket MORG-42 --plain

# Output as JSON (for scripting)
morg ticket MORG-42 --json
```

**IMPORTANT**: Always use `--plain` or `--json` — the default mode is interactive
(requires a TTY) and will fail when run by Claude Code.

**Parent tickets**: When `morg ticket MORG-42 --plain` shows a `Parent:` field,
fetch the parent for full epic/story context:
```bash
morg ticket PARENT-42 --plain
```

The ticket detail view shows:
- Issue type, status, parent, assignee, URL
- Child issues (subtasks + epic children) — select "View child issues" to navigate
- Issue links with correct direction ("is blocked by" vs "blocks")
- Description rendered as Markdown with clickable links

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

## Worktrees

`morg` has full worktree support. Worktrees are created at `../morg-worktrees/<branch>/`
relative to the main repo (e.g. `~/www/devdavi/morg-worktrees/morg-42/`).

```bash
# Create worktree for a ticket
morg start MORG-42 --worktree

# Switch to an existing worktree branch
morg switch MORG-42

# List all morg-tracked worktrees with status (exists/missing)
morg worktree list

# Remove worktrees for done/abandoned branches
morg worktree clean
```

**Shell wrapper requirement**: `morg switch` and `morg start --worktree` automatically
move the shell to the worktree directory **only if the shell wrapper is installed**
(`morg shell-init`). If not set up, morg outputs a hint — check the output and follow it.

**After creating a worktree**, symlink the dependency folder so you don't need to reinstall:
```bash
ln -s /path/to/main-repo/node_modules /path/to/worktree/node_modules
```

## Switching Between Tasks

```bash
# Interactive branch picker (requires TTY)
morg switch

# Switch to a specific branch or ticket (works without TTY)
morg switch morg-42
morg switch MORG-42
```

`morg switch` handles dirty working tree (stash/skip) automatically. When the
shell wrapper is installed, it also changes the shell's working directory to the
worktree (if applicable).

## Viewing Status

```bash
# Show detail for the current branch: ticket info, GitHub PR status, CI checks,
# recent git commits, diff to main
morg status

# Show all tracked branches as a JSON array (for scripting)
morg status --json

# Show detail for a specific branch
morg status <branch>
```

## Managing Tickets

```bash
# List your recently viewed tickets (ordered by most recently accessed)
# Jira: last viewed date; Notion: last edited date
morg tickets --plain

# Output as JSON for scripting
morg tickets --json

# View a specific ticket (use --plain or --json always in non-TTY)
morg ticket MORG-42 --plain
morg ticket MORG-42 --json

# View current branch's ticket
morg ticket --plain
```

`morg tickets` shows tickets ordered by most recently accessed. This is useful
for getting a history of what the user was recently checking or working on.

## Creating Pull Requests

```bash
# Interactive (AI-generated description) — requires TTY
morg pr create

# Non-interactive — always use this in Claude Code
morg pr create --title "feat(MORG-42): add feature X" --body "$(cat <<'EOF'
## Ticket
[MORG-42](https://url-to-ticket.com/...): Ticket title here

## Summary
- What changed and why

## Test plan
- How to verify
EOF
)" --yes

# Draft PR
morg pr create --draft --title "..." --body "..." --yes
```

**PR title convention**: `type(TICKET-ID): short description`
- `feat`, `fix`, `chore`, `refactor`, `docs`, `test`

**Standardized PR body template** — always include a `## Ticket` section at the top:
```
## Ticket
[MORG-42](https://url-to-ticket.com/...): Ticket title here

## Summary
- What changed and why

## Test plan
- How to verify
```

Use the ticket URL from `morg ticket MORG-42 --plain` output (not "Closes MORG-42").

## Viewing PRs

```bash
# View the PR for current branch
morg pr view

# View PR for a specific branch or ticket
morg pr view feat/my-feature
morg pr view MORG-42

# Open PR in browser
morg pr view --web

# Output PR as JSON (for scripting)
morg pr view --json

# Poll until all CI checks complete (600s default timeout)
morg pr view --wait
morg pr view --wait --timeout 300

# List all open PRs (optionally with AI summaries)
morg pr review
morg pr review --ai
```

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

## Bulk Cleanup

```bash
# Delete all fully-merged tracked branches
morg clean
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

## Standup

```bash
# AI-generated standup summary from recent branch activity
morg standup

# Generate and post to Slack
morg standup --post
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
# 1. Get ticket context (fetch parent for epic context if Parent: field is shown)
morg ticket MORG-42 --plain

# 2. Start working (creates branch, pulls main, transitions ticket)
morg start MORG-42

# ... make code changes ...

# 3. Create PR with standardized body
morg pr create --title "feat(MORG-42): description" --body "$(cat <<'EOF'
## Ticket
[MORG-42](https://url-to-ticket.com/...): Ticket title here

## Summary
- What changed and why

## Test plan
- How to verify
EOF
)" --yes
```

### Starting a ticket with a worktree

```bash
# 1. Create worktree
morg start MORG-42 --worktree

# 2. Symlink dependencies (adjust path as needed)
ln -s /Users/devdavi/www/myproject/node_modules \
      /Users/devdavi/www/myproject-worktrees/morg-42/node_modules

# 3. Check the morg output for cd instructions if shell wrapper isn't set up
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
- All interactive commands have non-interactive equivalents via flags (`--yes`, `--plain`, `--json`, `--title`, `--body`)
- Jira and Notion are both supported; morg detects which is configured per project
- Branch names are derived from ticket IDs: `MORG-42` → branch `morg-42`
- `morg tickets` (plural) always lists; `morg ticket` (singular) defaults to current branch's ticket
- State is stored in `~/.morg/` — never edit these files directly
