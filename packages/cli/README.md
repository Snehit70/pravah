# Pravah CLI v2

Pravah CLI is a human-first terminal interface for one person's task planning.
Commands print concise text by default; pass `--json` for the versioned machine
envelope.

## Install and authenticate

```sh
bun install --global pravah@latest
pravah --help
```

To upgrade across major versions, install the latest release explicitly (a
plain `bun update -g pravah` follows the previously installed semver range):

```sh
bun install --global pravah@latest
```

To pin a particular release, replace `latest` with that version.

The CLI accepts either an existing admin API-key environment configuration
(`PRAVAH_HTTP_URL` and `CONVEX_HTTP_API_KEY`) or a stored scoped automation
credential. To create the latter, issue a one-time bootstrap token from
Settings → Automation, then exchange it locally:

```sh
pravah auth login --url https://your-deployment.convex.site --bootstrap-token pravah_bootstrap_...
pravah auth status
```

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
