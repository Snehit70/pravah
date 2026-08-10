# Pravah — Domain Context

## Glossary

### CLI output

### Human output
The concise, terminal-readable result format shown by default for Pravah CLI commands. It prioritizes planning information over record metadata.
_Avoid_: Pretty JSON, default JSON

### JSON envelope
The versioned `{ ok, version, command, data | error }` machine contract emitted only when a Pravah CLI caller explicitly requests `--json`.
_Avoid_: Human output, debug output

### Inbox task
An active task without a scheduled date. It is visible in the Inbox rather than on the Timeline.
_Avoid_: Unscheduled, backlog

### Priority group
The Inbox collection of active Inbox tasks sharing one priority level. Priority groups are visible sections that may be opened or collapsed while their task count remains available.
_Avoid_: Priority filter, priority task type

### No-priority view
The dedicated Inbox view for active Inbox tasks that have no priority. It is reached from the Inbox summary rather than behaving like a collapsible priority group.
_Avoid_: Unprioritized group, no-priority filter

### Timeline task
An active task with a scheduled date. It is visible on the Timeline and may be overdue, due today, or upcoming.
_Avoid_: Scheduled task

### Completed task
A task whose planned work is finished and retained as completion history.
_Avoid_: Done task

### Cancelled task
A task removed from active planning without being completed.
_Avoid_: Deleted task

### Attention view
A top-level CLI shortcut that answers an immediate planning question, such as `inbox`, `today`, `overdue`, or `upcoming`. An attention view is a task query, not a new task type.
_Avoid_: Resource, status

### Compact list
The default human CLI list showing only due information, priority, and task title. It omits record metadata and extended task details.
_Avoid_: Short JSON, summary payload

### Expanded list
The explicit long human CLI list that supplements a compact row with contextual task details such as goal, time, tags, estimate, description, and ID.
_Avoid_: Default list, debug output

### Task horizon
The scheduled task window used by `pravah tasks list`: overdue work, work due today, and the next 14 calendar days. Inbox work is reported as a count and listed only through `pravah inbox`.
_Avoid_: All active tasks, timeline dump

### Active task
A task still in planning: either an Inbox task or a Timeline task. Completed and Cancelled tasks are not active.
_Avoid_: Historical task, all task

### Task image
An optional static visual owned by exactly one Task. It may provide supporting context or carry the Task's primary visual meaning, and may have a caption.
_Avoid_: Attachment, cover image, media file

### Task image collection
The ordered set of zero to five active Task images owned by one Task. Recoverably removed Task images remain associated with the Task but sit outside its active collection.
_Avoid_: Attachment list, media library

### Primary Task image
The first image in a Task image collection and the image that represents the Task when only one image is shown.
_Avoid_: Cover image, featured attachment

### Image-led Task
A Task whose Task images carry its dominant visual identity while its text title remains required. It is a presentation characteristic, not a separate Task type.
_Avoid_: Image Task, photo Task

### Image upload
An owner-scoped image undergoing preparation, upload, verification, or cleanup. It may exist before a Task is saved and can become exclusively associated with one Task image, but it is not itself a Task image.
_Avoid_: Task image draft, reusable asset, media-library item

### Image upload grant
A short-lived, owner-authorized capability allowing one Provider upload attempt under an exact upload policy. It contains no reusable provider secret and cannot authorize another upload identity.
_Avoid_: Upload credential, API key, upload token

### Provider upload attempt
A single provider-specific attempt to fulfill an Image upload under one opaque provider identity. An Image upload may receive successive non-overlapping attempts after definitive failure, but its first verified success seals it against replacement.
_Avoid_: Image upload, upload retry, replacement upload

### Image delivery URL
A transient secret capability that allows a prepared Task-image variant to be fetched after Pravah authorizes access. It is neither Task metadata nor a durable image identity.
_Avoid_: Public URL, image address, manifest URL

### Normalized Task-image master
The bounded, metadata-stripped, upright source retained for one Image upload after local and provider verification. It is never delivered directly and is not the originally selected image.
_Avoid_: Original image, full-resolution image, delivery image

### Task-image delivery variant
One member of Pravah's fixed, versioned set of prepared image representations authorized for mobile display. It is derived from the Normalized Task-image master and is not created dynamically from client parameters.
_Avoid_: Thumbnail, arbitrary transformation, resized original

### Task-image variant set
The complete versioned group of Task-image delivery variants required before an Image upload is ready. A Task image retains its assigned variant-set version until an explicit migration replaces it.
_Avoid_: Responsive sizes, dynamic variants, transformation preset

### Active Task image
A Task image currently participating in its Task image collection, including one whose Image upload is pending or failed. Active Task images count toward the collection limit.
_Avoid_: Uploaded image, available image

### Recoverably removed Task image
A Task image outside the active collection but restorable during its recovery window. It does not count toward the active collection limit.
_Avoid_: Deleted image, archived image

### Task-image manifest
The provider-neutral serialized metadata describing a Task image collection without embedding image binaries, delivery URLs, provider identifiers, or device-local paths.
_Avoid_: Image backup, media payload, signed-URL list

### Task metadata export
A portable JSON snapshot of the Tasks currently loaded by the mobile workspace, including Task-image manifests but excluding restorable image content.
_Avoid_: Backup, full account export, image archive

### Workspace snapshot
The bounded device-local cache of last-known Task presentation metadata used while the authenticated mobile workspace refreshes. It is neither an offline workspace nor a backup.
_Avoid_: Offline database, local backup

### CLI resource grammar
The canonical human command shape `pravah <resource> <verb> [target] [filters]`. A resource names the object being operated on, a verb states the operation, a target identifies one object when needed, and filters narrow a collection.
_Avoid_: API-shaped option target, nested resource chain

### Target reference
The ID or exact unique title/name used to address one Task or Goal in a canonical v2 CLI command. An ambiguous title/name must return the matching candidates and their IDs; fuzzy lookup belongs to Search.
_Avoid_: Silent fuzzy match, option-only ID

### Goal progress
The completed count over active linked Tasks for a Goal. Cancelled linked Tasks are excluded from the denominator.
_Avoid_: All-time linked count, cancelled-task progress

### Today view
The attention view containing only Timeline tasks scheduled for the current local day. Overdue work belongs exclusively to the Overdue view.
_Avoid_: Overdue-and-today view

### CLI doctor
A read-only setup diagnostic that checks whether the local Bun runtime, stored credential, endpoint configuration, and credential scopes can support Pravah CLI commands.
_Avoid_: Repair command, auth reset

### Agent context
A compact, ranked machine briefing for an automation agent. It is distinct from human CLI lists and is introduced after the human CLI foundation as Phase 3 of the CLI redesign; the current redesign excludes held integrations and their review queues.
_Avoid_: Full database dump, human output

### Agent task summary
The minimal task representation used in Agent context: ID, title, due date when present, priority, and linked Goal when present. Inbox is represented as a count rather than embedded task records.
_Avoid_: Full task, duplicated priority section

### Operation receipt
The concise result of a successful CLI write: its action and target, plus a ready-to-run Undo command and expiry when the operation is recoverable.
_Avoid_: Raw operation record, success-only message

### Caller-stable idempotency key
An optional key supplied by a CLI caller when it may retry the same write across invocations. Pravah generates an idempotency key for every write when the caller does not supply one.
_Avoid_: Required user key, missing idempotency

### Local CLI logout
Removal of the credential stored on the current machine. It does not revoke the remote automation credential.
_Avoid_: Credential revocation, account sign-out

### CLI local day
The calendar day in the CLI host's local timezone. It defines Today, date rendering, and the default planning horizon.
_Avoid_: UTC day, account timezone

### Task filter
A composable constraint on a Task collection. Multi-priority and multi-tag filters are OR matches; date bounds are strict, while `--date` is an exact match.
_Avoid_: Implicit fuzzy filter, status resource

### Backdrop
The visual layer behind a modal/sheet that separates it from the content underneath. Composed of two independent layers in Pravah:

- **Blur** — gaussian blur via `expo-blur` `BlurView`. Creates depth/focus. Tuned by `intensity` (0–100) and `tint` (color cast).
- **Dim** — solid color overlay (historically `rgba(0,0,0,0.72)`). Creates contrast for the sheet to read against.

Design decision: Dim layers are removed in favour of stronger blur. The warm palette (`colors.backdrop = rgba(39,30,22,0.32)`) conflicts with pure black dimming. Sheets now rely on blur intensity alone for separation.

### Sheet
A bottom-sheet modal surfaced via React Native's built-in `<Modal>` with `transparent` + `animationType="slide"`. Used for Capture (AddTaskSheet), Edit, QuickSchedule, Overdue, and Confirm interactions.

### Capture
The primary task/goal creation surface. Renders as a full-height bottom sheet with "New task" / "New goal" tabs. Component: `AddTaskSheet.tsx`.

### Recoverable deletion
A task is removed from active planning surfaces but remains restorable through Undo during the recovery window. Use this as the canonical product term for the user-facing behavior commonly called a soft delete.
_Avoid_: Permanent deletion, hard delete

### Recovery window
The 30-minute period after recoverable deletion during which a task is eligible for restoration. The Undo control is only visible briefly, but the recovery guarantee lasts for the full window.
_Avoid_: Toast window, purge schedule

### Permanent deletion
A task is erased and cannot be restored through the product. This is distinct from recoverable deletion and must not be implied by a routine bulk action without explicit confirmation.
_Avoid_: Recoverable deletion, soft delete

### Dark appearance
Pravah's low-light visual identity: deep aubergine-charcoal surfaces, warm
light text, and restrained purple, teal, amber, and red color used to preserve
hierarchy and communicate meaning. It is intentionally colored rather than
pure black or neutral gray.

### System appearance
An appearance preference that follows the device's current light or dark
setting. It is the default for both new installations and installations
migrated from the legacy light-only release.

### Accent
A user-selected color applied to interactive emphasis such as active
navigation, selected controls, focus states, and primary actions. An accent
does not recolor appearance surfaces or override semantic task-state colors.

### Appearance
The complete visual treatment of the mobile application, including every
screen, sheet, modal, loading state, error state, Kairo surface, and adjacent
system chrome. An appearance change is incomplete if any of these surfaces
remain styled for another appearance.

### Mobile release
A successfully deployed mobile change delivered either as an OTA update or a
new APK. A merged change or failed deployment is not a mobile release and does
not receive a release version.
_Avoid_: Build, merge, commit

### Release version
The SemVer identity of a successful mobile release. Every OTA or native release
increments PATCH; MAJOR and MINOR change only through an explicit product
decision.
_Avoid_: APK version, runtime version, build number

### Release ledger
The authoritative history of successful mobile releases in Convex. A release
candidate becomes a ledger entry only after its deployment succeeds.
_Avoid_: Version file, package version

### Release control
The singleton Convex state containing the latest successful release, supported
runtime and fingerprint, emergency minimum runtime, and concurrency revision.
_Avoid_: Release ledger, version record

### Release attempt
The deployment record for a release candidate as it moves through pending,
staged, published, or failed states. Only published attempts appear in public
release history.
_Avoid_: Mobile release, workflow run

### Deployment authority
The GitHub workflow identity permitted to transition release candidates and
mobile releases using a dedicated secret. App users cannot mutate release state.
_Avoid_: Owner, authenticated user

### Release operation
An explicitly targeted, audited manual workflow action that rolls back a release
or advances the emergency minimum runtime.
_Avoid_: App action, direct mutation

### Release candidate
The next release version calculated from the ledger and embedded into a pending
deployment. It is not a mobile release unless that deployment succeeds.
_Avoid_: Draft release, prerelease

### Release promotion
Making a verified release candidate available on the live OTA channel. A
candidate published only to an isolated branch is not a mobile release.
_Avoid_: Publish, deploy

### Live OTA channel
The EAS `preview` channel used by Pravah's sideloaded APK audience. Its inherited
name does not mean it is a pre-production environment.
_Avoid_: Preview environment, production store channel

### Native publication
Making a verified draft GitHub Release and its APK assets available to users.
Only native publication advances the supported runtime.
_Avoid_: APK build, artifact upload

### APK release
A native release published as a `mobile-v<version>` GitHub Release containing
the APK and checksum assets consumed by Pravah's in-app installer.
_Avoid_: OTA release, GitHub tag

### APK version
The user-visible Expo version embedded in a native release. It equals that
native release's unified release version.
_Avoid_: Android version code, native runtime, running release

### Android version code
The automatically incremented integer Android uses to order APK installations.
It has no user-facing or SemVer meaning.
_Avoid_: APK version, release version

### Rollback release
A new mobile release that restores a previously successful artifact or source
state after a defective release. It receives a new PATCH version and records
the release it reverses.
_Avoid_: Version rollback, downgrade

### Release source
The exact merge commit from which a mobile release is produced. Later commits on
the default branch are not part of that release.
_Avoid_: Latest main, workflow commit

### Backend-first release
A mobile release whose exact-source Convex changes are deployed successfully
before its OTA or APK artifact is staged.
_Avoid_: Backend release, coupled deployment

### Backend-driven mobile change
A Convex change that alters shipped mobile behavior. It is classified and
published as an OTA release even when the JavaScript source is unchanged.
_Avoid_: Backend-only release, no-release change

### Mobile release notes
The user-facing description authored in a pull request's
`Mobile release notes` section and stored with the resulting release. Raw commit
messages are not mobile release notes.
_Avoid_: Changelog, commit summary

### Mobile release classification
Exactly one declaration on a mobile-affecting pull request: `mobile-ota`,
`mobile-native`, or `mobile-no-release`. It determines delivery intent and must
agree with automated safety validation.
_Avoid_: Release label, change type

### Running release
The release version embedded in the code currently executing on a device. It is
the primary version shown to the user.
_Avoid_: Installed version, current APK version

### Development release
The explicit non-production identity used by local builds when no release
candidate exists. It cannot be published or entered into the release ledger.
_Avoid_: Release candidate, prerelease

### Pending update
A verified OTA release downloaded to a device but not yet activated. It becomes
the running release only after the app restarts into that bundle.
_Avoid_: Running release, available update

### Latest release
The newest successful mobile release in the release ledger. It may be newer than
a device's running release and therefore represents availability, not execution.
_Avoid_: Current version, running version

### Native runtime
A monotonic `native-N` compatibility lineage shared by an APK and the OTA
releases it can execute. It increments only when a native release changes the
native runtime.
_Avoid_: Release version, APK version, runtime version number

### Native fingerprint
The recorded native-compatibility fingerprint of a native runtime. An OTA
release is eligible only when its release source matches the supported
runtime's fingerprint.
_Avoid_: Commit fingerprint, release hash

### Supported runtime
The latest native runtime eligible for new OTA releases. Older runtimes receive
no OTA backports and require an APK upgrade to rejoin the release stream.
_Avoid_: Minimum app version, active version

### Minimum runtime
An emergency compatibility floor below which continuing to use Pravah risks
data integrity, authentication, or backend-contract failure. It is not advanced
merely because a newer APK exists.
_Avoid_: Supported runtime, latest runtime

### Compatible runtime
A native runtime at or above the minimum runtime whose clients retain a valid
backend contract, whether or not that runtime still receives OTA releases.
_Avoid_: Supported runtime, latest runtime

### OTA release
A mobile release delivered through Expo Updates without replacing the installed
APK. It must be explicitly requested with the `mobile-ota` pull-request label
and must pass native-change validation. It may batch multiple included,
unreleased OTA pull requests. An uncertain change is not OTA-safe.
_Avoid_: Hotfix, JavaScript release

### Native release
A mobile release delivered as a new APK because its changes alter the native
runtime. Native releases are started manually and may batch multiple queued
`mobile-native` pull requests.
_Avoid_: APK update, rebuild

### Capability parity
The same user-facing planning capabilities are available on web and mobile, even when each platform presents them through different controls and layouts.
_Avoid_: Pixel parity, identical screens

### Desktop-native web
The web expression of Pravah's product model, optimized for keyboard, pointer, widescreen, and browser conventions rather than reproducing the mobile screen layout.
_Avoid_: Responsive mobile clone, pixel-matched web
