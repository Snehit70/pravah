---
status: accepted
---

# Human output by default; JSON by explicit opt-in

Pravah CLI commands render concise human output by default and retain the versioned JSON envelope only when invoked with `--json`. This intentionally separates the terminal experience from the agent contract: pipe detection may remove terminal decoration but must never silently switch formats. The existing JSON envelope, error codes, and exit semantics remain stable for explicit machine callers.

## Considered options

- **Always emit JSON.** Rejected because normal terminal use becomes an API dump and makes the CLI's planning model hard to scan.
- **Switch automatically based on TTY detection.** Rejected because an invisible format change makes scripts and agents unreliable.
