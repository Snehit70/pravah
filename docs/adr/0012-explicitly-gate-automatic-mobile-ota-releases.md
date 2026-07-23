---
status: accepted
---

# Explicitly gate automatic mobile OTA releases

Pravah will assign a mobile release version only after a deployment succeeds.
OTA releases will run automatically after merge only when the pull request has
the `mobile-ota` label, and the workflow will independently reject changes to
native-sensitive files. Native releases will continue through the manually
triggered APK workflow. The explicit label prevents accidental publication,
while validation keeps human misclassification from delivering
native-incompatible JavaScript.

Every mobile-affecting pull request requires exactly one classification:
`mobile-ota` for an automatic OTA release, `mobile-native` for inclusion in the
next manual APK release, or `mobile-no-release` for tests, documentation, and
development tooling that cannot affect a shipped bundle. CI rejects missing,
contradictory, or unsafe classifications so unlabelled changes cannot
hitchhike into a later release.

Backend changes that alter mobile behavior are classified `mobile-ota` and
publish a fresh bundle with the new embedded release version even when its
JavaScript is unchanged. `mobile-no-release` is limited to changes that cannot
alter shipped behavior, such as tests, documentation, and development tooling.

An automatic OTA release starts only when a `mobile-ota`-labelled pull request
is merged into `main`, and it checks out that pull request's exact merge commit.
Mobile release workflows are serialized without cancelling an in-progress
release. A failed workflow retries the same commit and release candidate rather
than allocating another candidate, so later merges cannot leak into or reorder
an earlier release.

Within one release, the backward-compatible Convex deployment and isolated
artifact staging run in parallel after candidate preparation. Promotion,
publication, and ledger finalization wait for both. Separate releases remain
globally serialized because they share version allocation and the live channel.

At execution, an OTA workflow gathers every merged, included, unreleased
`mobile-ota` pull request since the latest successful release. Closely queued
pull requests therefore collapse to only those still unreleased, while a later
source may safely include a predecessor whose attempt failed before
publication. Notes and pull-request identities are aggregated and finalized
together; failed attempts consume no version.

OTA safety validation fails closed. A native-sensitive or unclassifiable change
is not published through Expo Updates and must use the manual native-release
path. There is no force-OTA override, because bypassing validation would defeat
the compatibility boundary.

The validator compares the release source's Expo native fingerprint with the
fingerprint recorded for the currently supported native runtime. Comparing only
the pull request base and merge commit is insufficient because both may already
contain an unreleased native change. Explicit hard blocks for native-critical
paths—including app configuration, config plugins, native project directories,
and native dependency changes—supplement that authoritative comparison.
Fingerprint generation failure blocks publication. A rejection must identify
the native inputs that changed so the pull request can be reclassified without
guesswork.

OTA and native releases share one SemVer sequence. Each successful deployment
increments PATCH (`3.0.9` to `3.0.10`); an APK rebuild does not itself imply a
MINOR or MAJOR change. Those components move only through an explicit product
decision.

Convex is the authoritative release ledger. A workflow reads the latest
successful version, calculates and embeds the next PATCH as a release candidate,
then records it only after deployment succeeds. Workflow-level concurrency and
a Convex compare-and-set against the previously observed version prevent
concurrent deployments from claiming the same version. `package.json` is not
the mobile release-version authority.

Release metadata—including history, latest release, supported runtime, and
emergency minimum runtime—is publicly readable so compatibility can be
determined before app authentication. All release-state mutations require a
dedicated deployment secret held by GitHub Actions; user sessions cannot
reserve, publish, finalize, fail, or reconcile releases, and the secret is never
exposed through an `EXPO_PUBLIC_` variable.

Convex stores a singleton release-control record with the latest successful
version, supported runtime and fingerprint, emergency minimum runtime, and a
compare-and-set revision. Separate release-attempt records move through
`pending`, `staged`, `published`, or `failed`. Published attempts are immutable
apart from reconciliation metadata and form the public release history;
pending and failed attempts remain visible only to deployment tooling.

OTA publication is two-phase. The workflow reserves a pending candidate in
Convex, publishes and verifies it on an isolated non-live EAS branch, records
its EAS update identity, and only then promotes that exact artifact to the live
channel. After promotion it marks the ledger entry successful. A retry resumes
the same candidate, and if final acknowledgement fails after promotion, the
workflow reconciles from the recorded update identity instead of allocating a
new version.

The existing EAS `preview` channel remains Pravah's live OTA channel because the
app is distributed as a sideloaded internal APK rather than through app stores.
Candidates are promoted to `preview`; the inherited name does not describe a
pre-production audience. Channel naming is revisited only if distinct staging
and production audiences are introduced.

Native publication follows the same transaction shape. A manually selected
exact source reserves a candidate and the next `native-N`, builds the APK,
uploads and verifies it in a draft GitHub Release, then publishes that release
before finalizing the ledger and advancing the supported runtime and
fingerprint. A failed final acknowledgement reconciles from the immutable
GitHub tag and assets.

Only native releases create `mobile-v<version>` GitHub Releases, and each must
contain installable APK and checksum assets. OTA releases are represented by
their Convex ledger entry, exact Git source, and EAS update identity; they do
not create GitHub Releases or tags. The in-app APK resolver therefore continues
to see only installable native releases, while `What's new` reads the unified
Convex history.

A native APK's user-visible Expo version equals that native release's unified
release version, and its embedded JavaScript starts with the same running
release. Android `versionCode` advances automatically as an independent
installation-order integer, while `native-N` remains the separate compatibility
lineage. `package.json` is not synchronized merely to make these values match.

Release versions are immutable and forward-only. Reverting a defective release
creates a new PATCH release that restores the earlier artifact or source state
and records which release it reverses; an older version number is never
reactivated.

Rollback and minimum-runtime changes are separate manual workflow-dispatch
operations available only to the deployment authority. Rollback names both the
defective release and restoration target; a minimum-runtime change names the
exact runtime and requires typed confirmation. Neither accepts an implicit
`latest` target, and both write permanent audit metadata to Convex.

An OTA-eligible pull request must contain a `Mobile release notes` section. Its
user-facing title and release notes are stored with the successful ledger entry
and shown in the app's `What's new` surface; raw commit messages are not release
notes. The manual native workflow requires the same release-note input.

A native workflow gathers every merged, unreleased `mobile-native` pull request
included between the supported runtime source and its manually selected target
ref. It requires and aggregates their mobile release notes, permits only an
additional dispatcher introduction, and records every included pull-request
number at finalization so none can be released twice.

The app's primary user-facing version is the release version embedded in the
code currently running on that device. The latest ledger version indicates
update availability and must not be presented as though it is already running.
APK version and native runtime are diagnostic details rather than the main app
version.

OTA releases download automatically in the background but do not force the app
to reload while the user may be editing. A downloaded update is presented as
ready to restart and otherwise activates on the next cold launch. The displayed
running release changes only after the new bundle starts.

Native compatibility uses a separate monotonic `native-N` lineage. OTA releases
retain the current native runtime; a manually triggered native release advances
it. The native workflow must reject native-sensitive changes when the lineage
has not advanced. Native runtime identifiers have no SemVer meaning and are not
the primary version shown to users.

Only the latest native runtime receives new OTA releases. Pravah does not
maintain parallel OTA backport lines for older APKs; users on an older runtime
remain on their last compatible release until they install the latest APK
through the existing in-app update path.

An older APK remains usable by default and shows a persistent notice that an
APK upgrade is required for future updates. Convex may declare an emergency
minimum runtime only when continued use risks data integrity, authentication,
or backend-contract failure. A newer APK alone is not grounds to block the app.

Convex contracts remain backward-compatible with every runtime at or above the
minimum runtime, not only the latest OTA-supported runtime. Schema and API
evolution is additive; old behavior is removed only after deliberately
advancing the emergency compatibility floor. Ordinary cleanup does not strand
older APKs, so compatibility paths may remain indefinitely.

Release identities are injected at workflow time rather than committed as
version bumps. Production workflows receive
`EXPO_PUBLIC_MOBILE_RELEASE_VERSION` and `MOBILE_NATIVE_RUNTIME` from the
reserved candidate and fail when either is absent. Local development uses
explicit `0.0.0-dev` and `native-dev` fallbacks that cannot be published or
recorded in the ledger.

Mobile releases deploy Convex from the exact release source before staging an
OTA or APK artifact. Failure stops the mobile release, and backend contracts
must remain compatible with clients already in use. Mobile rollback does not
roll Convex back. The release-ledger schema and deployment-authority functions
are deployed once as a migration prerequisite before `3.0.2` can be allocated.

The migration baseline is the `3.0.1` APK from the dark-appearance release,
recorded as native runtime `native-1` after that APK is published through the
existing manual workflow. The new release system starts with `3.0.2`; older
deployments are not reconstructed with metadata that did not exist when they
were published.

This supersedes ADR 0008 only where that decision couples the mobile app version
to the OTA runtime and avoids per-release OTA versions. Its decisions about
manual APK builds, GitHub Release distribution, and in-app APK installation
remain in force.
