# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm build          # bundle with tsup → dist/index.js
pnpm dev            # tsx watch (no rebuild between changes)
pnpm dev -- start MORG-42   # run a specific command in watch mode
pnpm typecheck      # tsc --noEmit
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
src/utils/errors.ts       — error classes only (MorgError, ConfigError, IntegrationError, GitError)
src/config/paths.ts       — ~/.morg path constants only
src/config/schemas.ts     — all Zod schemas + inferred TS types
src/config/manager.ts     — ConfigManager singleton: reads/writes JSON state, nothing else
src/git/index.ts          — pure git primitives via execa, no business logic
src/utils/detect.ts       — requireConfig(), requireTrackedRepo(), detectTools()
src/ui/                   — rendering only (theme, prompts, spinner, output panel)
src/integrations/*/       — pure API clients (GhClient, JiraClient, SlackClient, ClaudeClient)
src/commands/             — orchestration: imports from all layers, owns all business logic
src/index.ts              — Commander wiring + preAction hook
```

The key constraint: **`config/manager.ts` and `git/index.ts` are leaf nodes** — they import nothing from the rest of `src/`. Circular dependencies are prevented by keeping all orchestration in `src/commands/`.

### State files (all under `~/.morg/`)
- `config.json` — global config (API keys, integration tokens)
- `projects.json` — registry of morg-initialized repos
- `projects/<id>/config.json` — per-project config (GitHub repo, Jira project key)
- `projects/<id>/tasks.json` — task tracking (branch → ticket, PR status)

All JSON state is read/written exclusively through `configManager` (never direct `fs` calls in commands). All external data is parsed through Zod schemas at the boundary.

### Adding a new command
1. Create `src/commands/<name>.ts` with a `register<Name>Command(program: Command)` export
2. Implement the logic in a private `async function run<Name>()` in the same file
3. Add static import + `register<Name>Command(program)` call in `src/index.ts`

Commands that require a tracked repo call `requireTrackedRepo()` to get the `projectId`, then use `configManager.getTasks(projectId)` etc.

### execa convention
Always `{ reject: false }` — check `result.exitCode` instead of catching exceptions.

### Integration clients
All clients are instantiated per-call with config from `configManager.getGlobalConfig()`. There are no global integration singletons (except `ghClient` which wraps the `gh` CLI and needs no credentials directly).

### `preAction` hook
All commands except `config` require a valid `~/.morg/config.json`. The hook in `src/index.ts` calls `requireConfig()` before every action except `config`.
