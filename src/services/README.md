# Services Layer

Contains the `ServiceRegistry` singleton (`registry.ts`) and future business-logic facades.

## registry.ts

Single place where concrete provider implementations are instantiated. Commands depend on the
`registry` object and its typed methods — never on concrete client classes directly.

### Methods

| Method | Returns | Description |
|---|---|---|
| `registry.gh()` | `GhClient` | GitHub CLI wrapper (always available) |
| `registry.tickets()` | `TicketsProvider \| null` | Jira or Notion, based on config |
| `registry.ai()` | `AIProvider \| null` | ClaudeClient if API key present |
| `registry.messaging()` | `MessagingProvider \| null` | SlackClient if enabled |

### Usage in commands

```typescript
import { registry } from '../services/registry';

// In a command function:
const gh = await registry.gh();              // always returns a client
const tickets = await registry.tickets();    // may be null — check before use
const ai = await registry.ai();             // may be null — check before use
const messaging = await registry.messaging(); // may be null — check before use
```

### Adding a new integration

1. Create interface in `src/integrations/providers/<domain>/<domain>-provider.ts`
2. Create implementation in `src/integrations/providers/<domain>/implementations/<name>-<domain>-provider.ts`
3. Add a new method to the `Registry` class in this file
4. Add config schemas in `src/config/schemas.ts`
5. Write tests in `tests/integrations/<name>.test.ts`
6. Update `CLAUDE.md`
