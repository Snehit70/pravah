# Mobile performance PR 288 results

PR: https://github.com/Snehit70/pravah/pull/288

## Measured diagnostics improvement

[The first CI benchmark](https://github.com/Snehit70/pravah/actions/runs/39816141500/job/119955093095) compared the frozen retention algorithm from `55b1275` with the new single-pass algorithm. Both used 1,200 events of roughly 1 KiB each and retained the same newest 598 events under the same size limit. Seven samples per implementation were measured on the same CI host.

| Metric | Before | After |
| --- | --- | --- |
| Median pruning time | 169.93 ms | 0.293 ms |
| Relative pruning cost | 100% | 0.1725% |

That is about 580 times faster for this byte-limit stress fixture, or 99.83% less pruning time. Normal under-limit diagnostic buffers do not exercise the old quadratic removal loop, so this ratio must not be presented as a normal-session or whole-app speedup.

The new diagnostics test checks that a clean 30-second window writes once rather than rewriting unchanged history on all six timer ticks. The image coordinator regression test checks that 100 progress callbacks add no manifest writes, while state transitions still persist recovery checkpoints. These are targeted behavior checks, not measurements of battery or storage-device latency.

## Native runtime issue discovered by CI

The Expo Doctor precheck rejected the original Expo 56 / React Native 0.85.3 runtime because its Hermes V1 compiler version was affected by a known memory regression. The supported upgrade is included in this PR: Expo 57, React Native 0.86.3, aligned native packages and the ported clipboard patch. [Expo documents the regression and corrected runtime](https://expo.dev/changelog/sdk-57#known-regressions). Memory savings for Pravah have not yet been quantified on a physical device.

## Audit coverage

| Audit finding | PR implementation |
| --- | --- |
| 01, task readiness | Wait for the required live lists before reminder sync and interactive readiness. |
| 02, Kairo scope | Supply scheduled and completed tasks to existing local tools; load history when Kairo opens. No new account permission is needed. |
| 03, diagnostics | Skip clean writes and prune in one pass. Chunked storage and physical-device traces remain future work. |
| 08, hidden Inbox | Keep its task data scoped to Inbox while other tabs are active. |
| 09, reminder work | Stabilize task-array inputs. A complete planner-result cache is not included. |
| 10, upload progress | Keep transient progress out of durable checkpoints. |
| 24, retry durability | Retain every pending operation until acknowledgement, serialize replay/persistence, and deduplicate task creation. |
| 25, reminder contents | Replace stale task titles and digest counts without replacing unchanged reminders. |
| 27, native verification | Add isolated Android release workflows, repeated startup/frame budgets, artifacts and a host persistence benchmark. |

The remaining findings in the [27-item audit](mobile-performance-workflow-audit-2026-10-22.md) remain open. In particular, this PR does not implement a fully durable offline-first capture path, bound the image/history queries, virtualize the two eager detail lists, or claim physical-device workflow coverage.

Clean diagnostics ticks still remove expired records on the first flush tick after their 14-day limit. Capture replay protection uses the backend's existing 30-day idempotency window. It is not an unlimited exactly-once guarantee, and keys added to legacy retry entries cannot deduplicate an earlier request that never carried a key.

## Release requirements

The SDK upgrade requires a new native binary. Deploy the updated Convex `tasks.addTask` signature to the canonical deployment before publishing the candidate mobile app, because the app now sends an optional idempotency key. The APK release workflow already waits for its backend deployment job before publishing. This PR does not trigger that release.

## Progress and Timeline loading

Progress requests full completed history when opened. Its previous skeleton condition also required the active task list to be empty, so an already populated Inbox could hide the loading state before history arrived. The screen then drew partial analytics and changed them after the query resolved. It also added a 220 ms tab entrance, staggered 360 ms section entrances, and a chart draw animation. These timings are source values, not measured network latency.

Progress now shows its structural skeleton until the first complete live task corpus is ready, retains the previous complete view during later subscriptions, and scopes that retained data to the signed-in user. The screen and chart display immediately when data is available. Deliberate chart range changes retain their morph animation. This fixes presentation and avoids misleading intermediate charts; it does not make the first full-history request smaller or eliminate its network wait.

Timeline now uses live data for each resolved list independently, rather than replacing it with a snapshot while another list loads. Its cached scheduled tasks obey the same date horizon as the live query, preventing distant dates from briefly appearing and disappearing. Its first tab entrance no longer hides the initial structure.

## Connected phone baseline, October 23

Five cold process launches were measured on the connected Xiaomi M2101K6P, Android 13, at its existing 1080 × 2400 display settings. The installed native binary was 3.0.29, preview channel, runtime `native-6`. A later direct manifest check confirmed its running update ID matched the current preview manifest and the ledger's 3.0.33 OTA group, source `55b1275`. The manifest and JavaScript reported 3.0.29 because EAS still supplied the previous native release version. It contains the audit baseline code, not this PR.

| Installed-app measurement | Samples | Median |
| --- | --- | --- |
| Android activity `TotalTime` | 869, 916, 891, 873, 915 ms | 891 ms |
| Host first interactive marker | 2,690, 2,732, 2,668, 2,783, 2,717 ms | 2,717 ms |
| Host post-bootstrap marker | 3,547, 3,157, 3,565, 3,204, 3,139 ms | 3,204 ms |

Marker times include ADB polling and the installed app's older readiness semantics. They do not establish the first fully usable frame. A tab-navigation recording showed cached Progress content, but concurrent phone use interrupted the sequence, so it does not quantify a first-open blank interval. Private recordings and task contents remain outside the repository. A comparable physical-device candidate run still requires the new native binary.

## Reading native results

The [first complete emulator execution](https://github.com/Snehit70/pravah/actions/runs/39920546706) passed the workspace workflow and large Inbox scroll assertions. Its five cold interactive measurements were 5,637, 4,260, 4,038, 3,915 and 3,699 ms, within the startup budget. Its scroll frame p95 was 219.83 ms across 120 sampled frames, exceeding the 100 ms budget, so the overall check failed. The software-rendered emulator display was subsequently reduced while preserving its logical layout; that configuration subsequently measured 150.28 ms p95 with controlled ADB gestures. Changing configurations is not an app improvement comparison.

Only a fully passing native workflow establishes a passing candidate. These are absolute candidate measurements on a fixed emulator, not a before/after comparison against the installed phone app. No overall app-performance percentage is established. The native suite's fixture boundaries, budgets and artifacts are documented in [native-ci.md](../mobile/native-ci.md).

## OTA release identity correction

A direct preview manifest request matched the phone's running update ID to release group `28e48a99-3464-4350-89d7-b98a6f89fb85`, branch `release-candidate-3.0.33`. Its manifest version was incorrectly 3.0.29. The OTA workflow supplied release identity to the shell but only refreshed backend URLs in the EAS preview environment; `eas update --environment preview` reused the stale version during config evaluation. The workflow now refreshes and verifies the reserved version and runtime before publication, so the existing app config and bundled release value receive the same current identity. Earlier statements that the phone lacked recent JavaScript updates were incorrect.

The controlled scroll at `2c2bb3d` still measured 150.28 ms p95 after Maestro exited. No rendering improvement was established by isolating gestures. The initial 100 ms target remains unmet; CI now checks for a regression greater than 20% against this recorded baseline, while retaining target status and absolute timings in its artifacts. This calibrates an initial regression guard, not a claim that a rendering defect has been fixed.
