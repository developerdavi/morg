---
name: morg
description: |
  Use morg CLI to handle the full task lifecycle: starting tickets, switching
  branches, creating PRs, changing ticket statuses, syncing, and completing tasks.
  Triggers: "start working on", "implement MORG-XX", "create a PR", "switch to",
  "sync branches", "current ticket", "complete this task", "move ticket to",
  "get ticket details", "delete branch", "worktree", "standup", "profile"
---

# morg — Task Lifecycle Skill

`morg` is a developer productivity CLI that connects git branches with tickets
(Jira or Notion) and GitHub PRs.

## MANDATORY WORKFLOW — Always Follow This

**CRITICAL**: When asked to implement tickets (e.g. "implement MORG-52"), you MUST use the full
morg lifecycle. Never make code changes directly on `main` or without a branch.

### Required steps for every ticket:

```bash
# 1. Get context (fetch parent ticket if Parent: field is shown)
morg ticket MORG-XX --plain

# 2. Start the branch (BEFORE making any code changes)
morg start MORG-XX

# 3. Make your code changes

# 4. Commit (git add + git commit)

# 5. Create the PR
morg pr create --title "type(MORG-XX): description" --body "..." --yes
```

If already on the correct feature branch, skip `morg start`.

**Sequential tickets**: Complete the full lifecycle (start → code → commit → PR) for each ticket before moving to the next.

**Parallel tickets**: Spawn agents to work on tickets in parallel using worktree branches.

## Non-TTY Rules

Claude Code runs without a TTY. These flags are **mandatory**:

| Command | Non-interactive flag | Notes |
|---------|---------------------|-------|
| `morg ticket MORG-42` | `--plain` or `--json` | **Always required** |
| `morg tickets` | `--plain` or `--json` | **Always required** |
| `morg pr view` | `--json` | For structured output |
| `morg pr create` | `--yes --title "..." --body "..."` | **Always required** |
| `morg status` | `--json` | Default output works in non-TTY |
| `morg switch MORG-42` | *(no flag needed)* | Works non-interactively with explicit branch |
| `morg switch` | *(interactive — requires TTY)* | Prompts for branch selection |
| `morg start` | *(auto-detects TTY)* | Works non-interactively |

**Parent tickets**: When `morg ticket --plain` shows a `Parent:` field, fetch the parent for full epic/story context: `morg ticket PARENT-XX --plain`.

## Command Quick Reference

| I need to... | Command | Key flags |
|---|---|---|
| Get ticket context | `morg ticket MORG-XX --plain` | `--json` |
| List my tickets | `morg tickets --plain` | `--json` |
| Start a ticket | `morg start MORG-XX` | `--worktree`, `--base` |
| Switch branches | `morg switch MORG-XX` | |
| View current status | `morg status` | `--json` |
| List all branches | `morg ls` | |
| Create a PR | `morg pr create --title "..." --body "..." --yes` | `--draft` |
| View a PR | `morg pr view` | `--json`, `--wait`, `--web` |
| Review open PRs | `morg pr review` | `--ai` |
| Sync with main | `morg sync` | `--all` |
| Complete & merge | `morg complete` | `--yes`, `--no-delete` |
| Delete branch | `morg delete` | `-f` |
| Clean merged | `morg clean` | |
| Track/untrack | `morg track [branch] [TICKET]` / `morg untrack` | |
| Standup | `morg standup` | `--post` (Slack) |
| Worktree mgmt | `morg worktree list` / `morg worktree clean` | |
| Show config | `morg config --show` | |
| Shell integration | `eval "$(morg shell-init zsh)"` | bash/zsh |

Run `morg <command> --help` for full option details.

## PR Creation Rules

**Title convention**: `type(TICKET-ID): short description`
Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`

**Standardized PR body template** — always use heredoc syntax:
```bash
morg pr create --title "feat(MORG-42): add feature X" --body "$(cat <<'EOF'
## Ticket
[MORG-42](https://url-to-ticket.com/...): Ticket title here

## Summary
- What changed and why

## Test plan
- How to verify
EOF
)" --yes
```

Get the ticket URL from `morg ticket MORG-42 --plain` output (not "Closes MORG-42").

## Worktree Essentials

Worktrees are created at `../morg-worktrees/<branch>/` relative to the main repo.

- **Create**: `morg start MORG-42 --worktree`
- **Shell wrapper required**: `morg switch` and `morg start --worktree` auto-cd to the worktree only if `morg shell-init` is installed. Check output for hints.
- **Dependencies in worktrees**: Run `pnpm install` in the worktree directory. pnpm's content-addressable store means installs are fast — dependencies are symlinked from the store, not downloaded again.
- **Manage**: `morg worktree list` / `morg worktree clean`

## NEVER List

- **Never use raw git/gh** for operations morg handles (`git checkout` → `morg switch`, `gh pr create` → `morg pr create`, `git checkout -b` → `morg start`)
- **Never edit files before `morg start`** — always create the branch first
- **Never work directly on `main`**
- **Never skip `morg pr create`** after finishing a ticket
- **Never omit `--plain`/`--json`/`--yes`** on interactive commands (they fail without a TTY)
- **Never manually symlink `node_modules`** in worktrees — run `pnpm install` instead (pnpm's store makes it fast)
- **Never edit `~/.morg/` files directly** — use `configManager` or morg commands
- **Never `git stash` manually** — `morg switch` handles stashing automatically

## Profiles

**Priority order**: `MORG_PROFILE` env var > project-level profile > global `activeProfile`.

```bash
MORG_PROFILE=work morg tickets          # one-off override
morg config profile use work             # set globally
morg config profile use work --project   # set per-project
morg config profile list                 # list available
morg config profile create work          # create from current config
```

## Canonical Workflow Example

```bash
# 1. Get ticket context (fetch parent for epic context if Parent: field is shown)
morg ticket MORG-42 --plain

# 2. Start working (creates branch, pulls main, transitions ticket)
morg start MORG-42

# ... make code changes, commit ...

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