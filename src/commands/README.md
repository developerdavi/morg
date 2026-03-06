# Commands Layer

Thin orchestration. Each command file owns all business logic for one feature area.

## Command file structure

```typescript
// 1. Call requireTrackedRepo() or requireConfig() for guards
const projectId = await requireTrackedRepo();

// 2. Load config/state via configManager (for project-scoped data)
const branchesFile = await configManager.getBranches(projectId);

// 3. Get integration clients via registry — projectId is resolved internally
const gh = await registry.gh();
const tickets = await registry.tickets();  // may be null

// 4. Call utility functions (from src/utils/) or git helpers (src/git/)
// 5. Handle UI: prompts, spinners, output
```

## Rules

- **Never** import integration clients (JiraClient, GhClient, etc.) directly in commands
- **Never** read `~/.morg/` files directly — always go through `configManager`
- **Never** put business logic outside of command files (the commands layer owns it)
- `requireTrackedRepo()` is still called directly in commands when `projectId` is needed for
  `configManager.getBranches()` / `configManager.saveBranches()` calls

## Adding a new command

1. Create `src/commands/<name>.ts` with a `register<Name>Command(program: Command)` export
2. Implement logic in a private `async function run<Name>()` in the same file
3. Add static import + `register<Name>Command(program)` call in `src/index.ts`
4. If the command should work without `~/.morg/config.json`, add it to `NO_CONFIG_COMMANDS` in `index.ts`
