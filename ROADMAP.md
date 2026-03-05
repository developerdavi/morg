# Roadmap

This is a living document that tracks the mid/long-term goals and priorities for morg.

## DX improvements

Some changes to namings to make it more clear and avoid confusion would be good. For example, `tasks` (internal name given for tracked branches) can be confusing because we also have `tickets` (name given to the tickets/issues/tasks that come from the configured external provider).

- [ ] rename `tasks` to `branches`

## Architectural improvements

Morg should be modular and extensible, allowing the user to add their own integrations and commands.

- [ ] implement interfaces for providers (TasksProvider, AIProvider, etc)

## New integrations

### Tickets providers

Morg should be able to fetch tickets from different sources, configured at the project level.

- [ ] add notion
- [ ] add github issues

### AI providers

Morg should be able to use different AI providers for the LLM features.

- [ ] add option to use claude cli for ai prompts instead of anthropic api
- [ ] add support for openai api

### Claude code plugin

The idea is to have all the features from morg available as a plugin/skills for claude code and leverage the usage of the tool to provide more context to the agents.

- [ ] add all task management commands to the claude plugin/skill
- [ ] add task context to claude code fetched from the tasks provider
- [ ] implement useful custom hooks to claude code

## New command: `tickets`

The idea is to have an abstraction that allows to fetch tickets from the configured provider (project-level configuration), display them and allow the user to perform actions on them (e.g. create a task from a ticket, mark a ticket as done, etc).

- [ ] add a tickets list view (`morg tickets`)
- [ ] allow user to select a ticket and enter the detail view
- [ ] add a tickets detail view (`morg tickets <id>`, using current branch ticket id by default)
- [ ] add actions to the tickets detail view (e.g. start a branch from the ticket, change ticket status, open on browser, copy ticket url, etc)

## Hooks

The tool should be able to perform some actions (aka hooks) before and after certain commands.

The user should be able to configure these hooks in the config file (at project and global levels).

Morg should have some hooks included by default, and the user should be able to manage them.

The user should be able to:

- [ ] add custom hooks
- [ ] disable/enable hooks (even built-in hooks)

