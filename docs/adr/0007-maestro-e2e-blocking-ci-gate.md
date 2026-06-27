# Maestro E2E as a blocking, build-every-PR CI gate

Every pull request must pass a Maestro end-to-end suite running on a freshly built Android dev-client against a cold emulator, in addition to lint, typechecks, unit tests, and the web build — all enforced as required status checks on `main`. A fast `expo-doctor` pre-gate runs first to fail on native-dependency / `app.json` config drift before the expensive build. This is the only layer that can catch the native/runtime class of bug (keyboard covering the submit button, Modal windowing, native-module regressions) that the react-native-web unit seam ([[0006-react-native-web-for-mobile-component-tests]]) structurally cannot.

## Considered Options

- **Blocking, fresh build every PR, single attempt, broad flow suite (chosen)** — maximum reproducibility and safety; nothing native-runtime can regress unnoticed. Accepts ~15–20 min per PR and emulator flakiness with no retry, deliberately trading CI speed for determinism (no cache staleness, no flake-masking retries).
- **expo-doctor on PR + Maestro nightly/manual** — cheaper and flake-free on PRs, but lets a runtime regression merge and surface only on a later run.
- **Detox instead of Maestro** — heavier gray-box harness and more maintenance than Maestro's YAML flows for a single maintainer.

## Consequences

- The blocking suite is broad (launch/tab-nav smoke, add-task and edit-task with explicit "submit button reachable above the keyboard" assertions, goals, timeline, completed, settings, kairo). The keyboard assertion is the executable acceptance test for issue #123.
- The `kairo` flow calls an LLM; the network call is mocked at the boundary so the gate stays deterministic and needs no live API key.
- Coverage posture is informational: vitest v8 coverage is collected and uploaded every run, with a no-drop ratchet on `src/lib/**` and `src/hooks/**` only; components/screens are report-only because their meaningful behavior is asserted by this E2E gate.
