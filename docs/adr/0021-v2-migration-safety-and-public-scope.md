---
status: accepted
---

# V2 migration, safety, and public scope

V2 is released as a CLI SemVer major with a migration guide; removed API-shaped commands are unavailable. `--help` remains human-first and `capabilities --json` becomes the complete v2 machine manifest. Task and Goal removal use one explicit `--confirm` flag, and operation undo uses a positional operation ID or `--group <group-id>`.

Google Calendar, Gmail, sync, and review are removed from the v2 public CLI contract and documentation while integrations are on hold; their backend/code remains untouched. The public auth surface is `auth login`, `auth logout`, and `auth status`.
