# Image upload and OTA recovery

Research date: 2026-10-05. Scope: explain the six reported issues and propose implementation and acceptance checks. This note records the investigation and the implementation below.

## Evidence and limits

- The live production upload on the affected Task recorded `upload_timeout`. A phone Retry created attempt 3; the captured server logs showed grant issuance but no `submitUploadResult`. A subsequent authenticated Cloudinary resource lookup returned 404 for that attempt. These observations do not identify the original native request failure or prove that no previous attempt ever uploaded.
- The connected phone displayed `Upload received` and `Finishing upload` while its server row was `uploading` with no master or variants. Its About page displayed installed/running 3.0.22. This text differs from the current source and the published OTA bundle.
- GitHub's latest APK release is [mobile-v3.0.22](https://github.com/Snehit70/pravah/releases/tag/mobile-v3.0.22). [OTA workflow 37300544808](https://github.com/Snehit70/pravah/actions/runs/37300544808) succeeded. The production release ledger records OTA 3.0.24 from merge SHA `3d98d7aed5d6043eda96de07269778ae344ac707`, runtime `native-5`, group `5dbbff4d-8e5a-4727-9014-84a406dd01c2`.
- The installed APK has runtime `native-5` and channel `preview`. The phone can obtain the 3.0.24 manifest and download its launch asset when using the manifest's asset authorization headers. The downloaded bundle contains the new preparation copy. A raw CDN request without these required headers returned 403; that was a probe error, not evidence of a broken published asset.
- Native Expo logs report `CheckCompleteUnavailable`, but the available logs do not reveal the reason returned to JavaScript. Selection rejection, a previously failed launch, and a server no-update result remain distinct possibilities. Do not claim a proved selection-policy failure.
- A simple Cloudinary request completed in under one second on the phone. This rules out total reachability failure during the probe, not a failure of a signed multipart transfer.

## Primary sources

- [Expo Updates API](https://docs.expo.dev/versions/latest/sdk/updates/): check result reasons, current/downloaded update information, persistent update logs, emergency launch information, fetch and reload APIs. API availability was checked against installed `node_modules/expo-updates/src/Updates.types.ts` and `UseUpdates.types.ts`, rather than assuming the newest documentation exactly matches this repo.
- [EAS Update debugging](https://docs.expo.dev/eas-update/debug/): verify build configuration and delivered update compatibility.
- [Expo error recovery](https://docs.expo.dev/eas-update/error-recovery/): an update failing before content appears can be marked failed locally and avoided on later launches.
- [Cloudinary upload responses](https://cloudinary.com/documentation/upload_images): unsuccessful requests return a non-success HTTP status and an error response body.
- [Cloudinary notifications](https://cloudinary.com/documentation/notifications): upload completion and asynchronous eager completion are separate notifications; documented successful acknowledgement is HTTP 200, with retries after unsuccessful acknowledgement.
- [Cloudinary Admin API](https://cloudinary.com/documentation/admin_api): authenticated resource details and derived representations can support server-side recovery, subject to rate limits.

## 1. Upload timeout and unsafe recovery gaps

Relevant code: `apps/mobile/src/lib/taskImageNative.ts`, `taskImageCoordinator.ts`, `convex/taskImageActions.ts`, `taskImages.ts`, and `http.ts`.

First capture the exact native outcome. The native adapter currently collapses non-2xx responses to `upload_failed`; coordinator failure mapping can also hide an underlying IOException. Record an attempt-scoped event for source resolution, grant issuance, multipart start, byte progress milestones, HTTP completion, result submission, server acceptance and final readiness. Record duration, safe HTTP status, failure category and running release identity. Parse provider errors into an allowlist; do not log raw bodies, signatures, grant parameters, authorization headers, delivery URLs or local file paths. Fix the actual request fault after reproducing it on the release build.

Keep direct upload and retain the durable source until authoritative readiness or explicit removal. Before a destructive retry, distinguish an absent asset from an already received asset and an ambiguous network outcome. The existing reconciliation checks presence but does not reconstruct missing master/variant confirmation. Add a bounded server-side resource-details reconciliation for stalled received/ambiguous attempts. Only the backend may use Admin API credentials; verify exact public ID, active attempt, resource/delivery type, encoding, dimensions, byte limits and exact variant policy before committing results. Coalesce and back off these reads; do not poll the provider on every progress event.

Persist validated eager callback metadata for the active attempt when master metadata is not yet available, then join and verify it when the master arrives. Current `http.ts` discards an early eager success and returns 204. Return 200 after durable acceptance or a deliberately ignored duplicate/obsolete event; return an appropriate failure status for temporary inability to persist. Classify eager processing errors accurately rather than labelling every eager failure `variant_too_large`. Preserve idempotency and prevent late callbacks from changing a newer attempt or a sealed success.

Acceptance: one-image transfer succeeds on the connected release phone and reaches readiness on another installation; cover disconnect/reconnect, app restart, lost upload response, lost result-submission response, eager-before-master, duplicate callbacks, lost callback, late callback from an old attempt, removal during transfer, and retry after each failure. An ambiguous outcome must not delete a successfully received asset or create an untracked duplicate. Existing deadlines remain recovery limits, not proof of a fixed upload path.

## 2. Premature receipt and inconsistent status

Use one attempt-scoped status source for the main preview, thumbnail, notice and Retry availability. Byte progress, including 100%, must not imply provider receipt. Show transfer progress until the HTTP response confirms receipt; after verified server acceptance, show preparation; show success only when validated delivery variants exist. Distinguish locally confirmed receipt awaiting server sync when that response cannot yet be submitted. Keep local previews visible throughout.

The current branch already contains phase-preserving reconciliation and revised status copy from PR #269. Verify those changes on an actually running 3.0.24 bundle before rewriting them. Add tests that couple UI to the full coordinator/server sequence, especially 100% progress with an unresolved HTTP request and foreground reconciliation during active transfer.

Acceptance: all image UI elements agree, no receipt claim precedes its evidence, and reopening a Task preserves the authoritative phase and Retry action.

## 3. Published fixes not running on the phone

Expose separately the installed APK version, running JavaScript release, running update UUID, runtime/channel, downloaded update UUID and latest published compatible release. The latest ledger version is availability, not execution. Match the Android-specific Expo update UUID to release metadata; the ledger currently records an EAS group UUID, so store the platform UUID mapping or embed the release identity in the update manifest. Do not label an arbitrary downloaded bundle with the ledger's latest version. `mobileReleaseState.ts` currently derives pendingVersion from latestVersion plus a boolean, which can mislabel an older downloaded update.

After fetch completes, offer `Restart to apply 3.0.x` for the actual downloaded release. After restart, verify `Updates.updateId` and the embedded release version before testing the upload fix. If this APK cannot receive the diagnostic/recovery OTA, use the normal native release workflow for a recovery build with continuous Android signing and preserved app data. Treat that as a fallback delivery path, not proof that the original OTA fault is understood.

Acceptance: the connected phone's running identity matches the intended published Android update, persists across a cold launch, and shows the new upload behavior. Repeat activation in a release APK, not only a development client.

## 4. Hidden OTA check failure or rejection

Replace the silent catch and discarded check result in `useMobileRelease.ts` with explicit checking, available, downloading, downloaded, failed and unavailable states. Record `result.reason`, `Updates.updateId`, `isEmbeddedLaunch`, channel/runtime, emergency-launch reason and bounded `readLogEntriesAsync()` output. Retry transient checks on explicit user action and controlled foreground/network recovery instead of waiting for another cold launch. Deduplicate concurrent checks.

Branch the fix on actual evidence: server-no-update requires inspecting the real request/channel mapping; selection rejection requires checking timestamps and manifest filters; a previously failed update requires reproducing and fixing the launch crash, then publishing a corrected update; fetch/asset errors require fixing the observed download failure. Preserve Expo recovery safeguards. Do not repeatedly force-launch an update it has marked failed.

Acceptance: every unavailable or failed result has an observable reason; tests cover every installed SDK reason, check/fetch errors, prior launch failure and a corrected release activation.

## 5. Ambiguous update screen

`AppUpdateSection.tsx` uses GitHub APK releases only, by the decision in ADR 0008. Its generic `You're up to date` copy is therefore misleading when an OTA is missing. Give users one update entry point that checks both supported paths and reports each outcome. Show running release and installed APK separately. Use precise copy such as `APK is current; app update is downloading`, `Restart to apply`, or `App-update check failed`. Never turn a failed OTA check or skipped native check into global success. Keep APK checks on explicit user action as the ADR requires; background OTA checks can remain automatic.

Acceptance: test APK-current/OTA-newer, APK-newer/OTA-current, pending older OTA versus newer ledger release, offline checks and malformed metadata. Claim the app is current only after the compatible checks succeed and no update remains pending.

## 6. Missing diagnostics

Extend the existing `logger.ts`, bounded diagnostics buffer and `diagnosticsExport.ts`; do not add an unrelated telemetry system. Include sanitized upload and update timelines correlated by upload ID/attempt and release/update ID, with monotonic elapsed durations so a wall-clock adjustment does not distort latency. Preserve records across restarts. Report retryable terminal failures to the server with the active attempt identifier so a stale client cannot fail a newer attempt; current retryable native failures are not consistently reported to the server, and `markUploadFailed` lacks an attempt guard.

Acceptance: a single exported diagnostic report identifies the failing stage, HTTP status or transport category, attempt, active release and update-check reason. Test redaction, bounded retention and late-event guards. Never include image contents or reusable credentials.

## Implementation order and release gate

1. Capture exact release and upload diagnostics, establish an end-to-end failing reproduction, and recover verified update activation on the phone.
2. Fix the observed transfer fault plus callback ordering/reconciliation gaps; prove the one-image path and failure recovery.
3. Consolidate upload status and update UX, using actual receipt and downloaded-release identity.
4. Run focused regression tests, relevant full checks and a release-mode phone test through the published update channel. CI publication alone is not device validation.

Measure time to HTTP receipt, server acceptance and variant readiness separately. Target less than one second from successful receipt to visible confirmation on a healthy connection; measure it rather than promise subsecond total upload or asynchronous processing. Keep the existing timeout safeguards, but do not present expiry-to-failed as successful recovery of the image.


## Implementation and outstanding verification

The recovery PR persists signed eager notifications and joins them with the master receipt through an idempotent scheduled verifier. Trusted provider recovery inspects the exact authenticated master and fixed variant bytes, with bounded streaming reads, before allowing Retry to delete an asset. A database reservation limits provider recovery to once per upload attempt every 30 seconds. Ambiguous provider responses preserve the image.

Native transfers now record safe HTTP/transport categories, attempt correlation, and monotonic elapsed time. Coordinator phase transitions and server-confirmation duration appear in the existing persisted diagnostic journal. Retryable failures carry an attempt guard; late native completions preserve a newer attempt’s cancellation handle; stale submission responses and network exceptions cannot fail a newer server attempt. Failed uploads retain their durable local source until completion or removal.

The shared OTA checker deduplicates consumers, retains unavailable reasons, retries on manual action and throttled foreground entry, and distinguishes check failures from download failures. The update screen checks APK and OTA together, distinguishes running JavaScript from installed APK, and offers restart for an actually downloaded update. Pending release identity uses Expo's existing downloaded manifest version, so it requires no native configuration change. Diagnostic exports include running update identity, runtime/channel, embedded/emergency launch flags and bounded native log codes without raw native messages or asset URLs.

Automated regressions cover callback order and duplicates, version mismatch, stale failures, recovery throttling, retry while variants are processing, trusted asset mismatch, malformed provider responses, bounded WebP reads, OTA rejection reasons, retries/deduplication, native HTTP and transport failures, receipt after HTTP completion, and pending release identity.

The connected Android phone disconnected during implementation. Its original signed multipart failure and OTA-unavailable reason remain unconfirmed. A successful release-mode transfer and measured confirmation latency on the new bundle remain a release-validation gate. If OTA activation still fails on that APK, publish a normal recovery APK using the existing signing identity; do not bypass Expo's failed-launch safeguards. CI passing alone is not evidence that this installation received the fix.
