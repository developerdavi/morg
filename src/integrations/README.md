# Integration Clients

Pure API clients. Each implements one or more provider interfaces from `providers/`.

## Directory structure

```
providers/
  tickets/
    tickets-provider.ts              # TicketsProvider interface + Ticket type
    implementations/
      jira-tickets-provider.ts       # JiraClient
      notion-tickets-provider.ts     # NotionClient
  ai/
    ai-provider.ts                   # AIProvider interface
    implementations/
      claude-ai-provider.ts          # ClaudeClient
  messaging/
    messaging-provider.ts            # MessagingProvider interface
    implementations/
      slack-messaging-provider.ts    # SlackClient
github/
  client.ts                          # GhClient (wraps gh CLI)
```

## Key rule

**Clients are ONLY instantiated in `src/services/registry.ts`** — never import or `new` a client
class in command files. Commands call `await registry.gh()`, `await registry.tickets()`, etc.

The old `src/integrations/jira/client.ts`, `notion/client.ts`, etc. are thin re-exports that
forward to the implementations in `providers/`. They exist for backward compatibility.
