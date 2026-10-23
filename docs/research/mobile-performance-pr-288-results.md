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

## Release requirements

The SDK upgrade requires a new native binary. Deploy the updated Convex `tasks.addTask` signature to the canonical deployment before publishing the candidate mobile app, because the app now sends an optional idempotency key. The APK release workflow already waits for its backend deployment job before publishing. This PR does not trigger that release.

## Remaining measurements

The native fixture workflow must pass before native startup and frame results can be reported. Physical-device ADB checks have not detected a connected phone. No overall app-performance percentage is established. The native suite's fixture boundaries, conservative budgets and artifacts are documented in [native-ci.md](../mobile/native-ci.md).
