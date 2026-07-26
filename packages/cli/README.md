# Pravah CLI v2

Pravah CLI is a human-first terminal interface for one person's task planning.
Commands print concise text by default; pass `--json` for the versioned machine
envelope.

```sh
pravah auth login --url https://your-deployment.convex.site --bootstrap-token <token>
pravah tasks list
pravah tasks show "Prepare review"
pravah tasks add "Prepare review" --priority p1
pravah tasks complete "Prepare review"
pravah goals list
pravah agent context --json
```

## v1 migration

CLI v2 is intentionally breaking. API-shaped commands and held integrations
are removed from the public contract.

| v1 | v2 |
| --- | --- |
| `tasks get --task-id ID` | `tasks show ID` |
| `tasks update --task-id ID` | `tasks edit ID` |
| `tasks move --task-id ID --target-date DATE` | `tasks schedule ID --date DATE` |
| `tasks delete --task-id ID --confirm-task-delete` | `tasks remove ID --confirm` |
| `goals create --text TITLE` | `goals add TITLE` |
| `goals get --goal-id ID` | `goals show ID` |
| `goals delete --goal-id ID --confirm-goal-delete` | `goals remove ID --confirm` |
| `operations get --operation-id ID` | `operations show ID` |
| `operations undo --operation-id ID` | `operations undo ID` |
| `auth whoami` / `auth list-scopes` | `auth status` |
| `agent task` | `tasks show TARGET --json` |

`sync` and `review` are not part of v2 while their integrations are on hold.
