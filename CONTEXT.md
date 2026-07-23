# Pravah — Domain Context

## Glossary

### Backdrop
The visual layer behind a modal/sheet that separates it from the content underneath. Composed of two independent layers in Pravah:

- **Blur** — gaussian blur via `expo-blur` `BlurView`. Creates depth/focus. Tuned by `intensity` (0–100) and `tint` (color cast).
- **Dim** — solid color overlay (historically `rgba(0,0,0,0.72)`). Creates contrast for the sheet to read against.

Design decision: Dim layers are removed in favour of stronger blur. The warm palette (`colors.backdrop = rgba(39,30,22,0.32)`) conflicts with pure black dimming. Sheets now rely on blur intensity alone for separation.

### Sheet
A bottom-sheet modal surfaced via React Native's built-in `<Modal>` with `transparent` + `animationType="slide"`. Used for Capture (AddTaskSheet), Edit, QuickSchedule, Overdue, and Confirm interactions.

### Capture
The primary task/goal creation surface. Renders as a full-height bottom sheet with "New task" / "New goal" tabs. Component: `AddTaskSheet.tsx`.

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
