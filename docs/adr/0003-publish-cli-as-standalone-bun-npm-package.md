# Publish the Pravah CLI as a standalone bun-targeted npm package

The automation CLI is being extracted from the private monorepo root into its own publishable `packages/cli` workspace and published to npm as the unscoped package **`pravah`**. The bundle is built with `bun build` into a single JS file that keeps a `#!/usr/bin/env bun` shebang — the CLI **requires bun at runtime**, not Node. Versioning is independent (a new `cli` component in release-please-config), and a publish job in the release workflow runs on the `cli` release with `npm publish --provenance`.

## Considered options

- **Publish the root package.** Rejected: the root is `private: true` and carries the entire web app's dependency tree (React, Vite, Convex); publishing it would ship the wrong thing.
- **Re-target the CLI to Node so `npm i -g` / `npx` work for everyone.** Rejected for now: the CLI's audience is agents and local automation that already run under bun, and keeping bun avoids reworking the bun-shebang TS entry. Accepted consequence: on a Node-only machine `npm i -g pravah` installs but fails at runtime, so the package declares `engines.bun` and the failure is made explicit rather than cryptic.
- **Ship raw TS instead of a bundle.** Rejected: the entry imports `../lib` helpers, so raw TS would force shipping/duplicating those modules and dragging transitive web deps (clsx, tailwind-merge); a bundle tree-shakes them out.
- **Tie the CLI version to the web root version, or publish manually.** Rejected: an independent release-please component decouples CLI releases from unrelated web/mobile changes while staying automated.

## Consequences

- `automationHttpClient` (CLI-only) moves into the CLI package; the single shared `getLocalDateString` helper is copied into the package rather than importing web `src/lib/utils`.
- Existing in-repo entry points (`bin` in root package.json, the `bun run pravah` script, the `pravah-cli` skill's `bun run pravah --` fallback, README references) must be repointed at the new location.
- Help is generated from the existing `capabilities` command registry + arg schemas so published help cannot drift from the real command set.
- First-run setup is an interactive `pravah setup` that captures the per-deployment HTTP URL (it cannot be baked into a published package) plus a bootstrap token, with flags/env preserved for non-interactive agent use.
