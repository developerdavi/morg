# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm build          # bundle with tsup → dist/index.js
pnpm dev            # tsx watch (no rebuild between changes)
pnpm dev -- start MORG-42   # run a specific command in watch mode
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint src
pnpm lint --fix     # eslint src --fix (auto-fix formatting and lint errors)
pnpm test           # vitest run (all tests)
pnpm test:watch     # vitest (interactive)
```

Run a single test file:
```bash
pnpm test tests/ticket.test.ts
```

After changing `src/`, rebuild and test the linked binary:
```bash
pnpm build && morg <command>
```

Package manager is **pnpm**. Never use npm or yarn.

## Architecture

### Module system
ESM-native (`"type": "module"`). `"moduleResolution": "Bundler"` — no `.js` extensions on imports, no `await import()` inside functions. All imports are static and at the top of each file.

### Layer responsibilities

```
src/utils/errors.ts                          — error classes only (MorgError, ConfigError, IntegrationError, GitError)
src/config/paths.ts                          — ~/.morg path constants only
src/config/schemas.ts                        — all Zod schemas + inferred TS types
src/config/manager.ts                        — ConfigManager singleton: reads/writes JSON state, nothing else
src/git/index.ts                             — pure git primitives via execa, no business logic
src/utils/detect.ts                          — requireConfig(), requireTrackedRepo(), detectTools()
src/ui/                                      — rendering only (theme, prompts, spinner, output panel)
src/integrations/providers/<domain>/         — provider interfaces (tickets-provider.ts, ai-provider.ts, etc.)
src/integrations/providers/<domain>/implementations/  — concrete clients (JiraClient, GhClient, ClaudeClient, SlackClient)
src/services/registry.ts                     — ServiceRegistry singleton: only place clients are instantiated
src/commands/                                — orchestration: imports from all layers, owns all business logic
src/index.ts                                 — Commander wiring + preAction hook
```

The key constraint: **`config/manager.ts` and `git/index.ts` are leaf nodes** — they import nothing from the rest of `src/`. Circular dependencies are prevented by keeping all orchestration in `src/commands/`.

## Service Registry (DI Pattern)

All integration clients are instantiated via the `registry` singleton in `src/services/registry.ts`.
**Commands MUST NOT import integration clients (JiraClient, GhClient, ClaudeClient, SlackClient) directly.**

Instead:
```typescript
import { registry } from '../services/registry';

const gh = await registry.gh();           // GhClient — always present
const tickets = await registry.tickets(); // TicketsProvider | null — check before use
const ai = await registry.ai();          // AIProvider | null — check before use
const messaging = await registry.messaging(); // MessagingProvider | null
```

`projectId` is resolved internally by the registry via `requireTrackedRepo()`. Commands still call
`requireTrackedRepo()` directly when they need `projectId` for `configManager.getBranches()` etc.

## Adding a New Integration

1. Create `src/integrations/providers/<domain>/implementations/<name>-<domain>-provider.ts`
   and implement `TicketsProvider`, `AIProvider`, or `MessagingProvider`
2. Add one async method to the `Registry` class in `src/services/registry.ts`
3. Add config schemas in `src/config/schemas.ts`
4. Write tests in `tests/integrations/<name>.test.ts`
5. Update this file

## Jira Integration Notes

- `listTickets` always includes `assignee = currentUser()` — never returns all project tickets
- `getTicket` fetches epic children via a secondary JQL `parent = <key>` query, because
  `fields.subtasks` only contains Sub-task type issues (not regular Features/Stories under an Epic)
- Issue link direction: uses `type.inward` for `inwardIssue` and `type.outward` for `outwardIssue`
  (e.g. "is blocked by" vs "blocks"), never `type.name` which has no direction
- ADF descriptions are rendered to Markdown via `adfToMarkdown()` with link preservation

## Testing

- Unit tests: pure functions, mock all I/O
- Service tests (`tests/services/`): mock `configManager` and `requireTrackedRepo` with `vi.mock()`
- Provider tests (`tests/utils/`): mock `registry` and UI helpers
- Integration tests (`tests/integrations/`): stub `fetch` or `execa` to test client parsing/errors
- Run all: `pnpm test`  |  Single file: `pnpm test tests/integrations/jira.test.ts`

### State files (all under `~/.morg/`)
- `config.json` — global config (API keys, integration tokens)
- `projects.json` — registry of morg-initialized repos
- `projects/<id>/config.json` — per-project config (GitHub repo, Jira project key)
- `projects/<id>/branches.json` — branch tracking (branch → ticket, PR status)

All JSON state is read/written exclusively through `configManager` (never direct `fs` calls in commands). All external data is parsed through Zod schemas at the boundary.

### Adding a new command
1. Create `src/commands/<name>.ts` with a `register<Name>Command(program: Command)` export
2. Implement the logic in a private `async function run<Name>()` in the same file
3. Add static import + `register<Name>Command(program)` call in `src/index.ts`

Commands that require a tracked repo call `requireTrackedRepo()` to get the `projectId`, then use `configManager.getBranches(projectId)` etc.

### execa convention
Always `{ reject: false }` — check `result.exitCode` instead of catching exceptions.

### Integration clients
All clients are instantiated exclusively via `registry` in `src/services/registry.ts`. Commands never call `new JiraClient(...)` or `new ClaudeClient(...)` directly.

### `preAction` hook
All commands except `config`, `install-claude-skill`, and `completion` require a valid `~/.morg/config.json`. The hook in `src/index.ts` calls `requireConfig()` before every action not in `NO_CONFIG_COMMANDS`.

### Error exit codes
- `MorgError` → exit 1 (generic)
- `IntegrationError` → exit 3
- `GitError` → exit 4
- `ConfigError` → exit 5
