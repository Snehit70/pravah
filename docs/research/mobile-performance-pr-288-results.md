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

## Remaining measurements

The native fixture workflow must pass before native startup and frame results can be reported. Physical-device ADB checks have not detected a connected phone. No overall app-performance percentage is established. The native suite's fixture boundaries, conservative budgets and artifacts are documented in [native-ci.md](../mobile/native-ci.md).
