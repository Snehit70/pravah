# React Native Web as the render substrate for mobile component tests

Mobile component tests (`apps/mobile/src/test/*.tsx`) render React Native components by aliasing `react-native` → `react-native-web` under vitest + happy-dom, rather than adopting `@testing-library/react-native` + `jest-expo`. This keeps a single test runner (vitest, shared with pure-logic tests), renders real RN primitives through the official web translation instead of per-file hand-rolled mocks, and avoids `react-test-renderer`, which is deprecated under React 19 (RN 0.85). Queries use `@testing-library/react` semantic queries (`getByRole`/`getByText`/`getByLabelText`).

## Considered Options

- **react-native-web alias (chosen)** — one runner, real RN primitives, lowest long-term maintenance. Fidelity stops at the web translation: `Platform.OS === "web"`, and `<Modal>`/keyboard/native windowing are not modeled. That runtime class is deliberately delegated to the Maestro E2E gate ([[0007-maestro-e2e-blocking-ci-gate]]).
- **@testing-library/react-native + jest-expo** — ecosystem-standard, higher component-tree fidelity, but introduces jest as a second runner and depends on the deprecated `react-test-renderer`.
- **Shared hand-rolled RN mock module** — cheapest, but keeps a low-fidelity fake RN.

## Consequences

- The structural reason the keyboard bug (issue #123) was invisible to unit tests is now explicit and owned: native/runtime behavior is not a unit-test responsibility; it is covered by E2E.
- A shared `src/test/test-utils` module centralizes the remaining unavoidable mocks (`react-native-reanimated`, `react-native-svg`, `expo-blur`), a `renderWithProviders` helper, and a `setPlatform("ios"|"android")` override for the rare platform-specific assertion.
- Per-file `vi.mock("react-native", …)` (15 files) is removed.
