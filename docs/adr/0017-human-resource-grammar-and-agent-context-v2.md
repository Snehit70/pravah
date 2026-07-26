---
status: accepted
---

# Human resource grammar and Agent context v2

Pravah's canonical v2 CLI uses `pravah <resource> <verb> [target] [filters]`, with target positionals such as `tasks show <task-id>` and collection filters such as `tasks list --goal <goal>`. The current API-shaped commands are removed in v2; this is an intentional major-contract migration rather than a compatibility-alias cycle.

The existing `agent context --json` command is replaced by its compact, task-planning-only v2 payload in the same release that advances the CLI contract to v2. A second context command or a default/compact split is rejected because automation callers need one authoritative briefing contract.

## Considered options

- **Keep API-shaped commands as compatibility aliases.** Rejected because v2 is the explicit boundary for one coherent grammar rather than a permanent dual command surface.
- **Create a separate compact context command.** Rejected because it leaves the existing noisy one-call agent entrypoint in place and splits discovery.
