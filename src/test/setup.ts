import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Handler unit contexts use small DB doubles. Real transactional progress
// triggers are covered independently by goalProgressIntegration.test.ts.
vi.mock("../../convex/writeServer", async () => import("../../convex/_generated/server"));

(globalThis as { __DEV__?: boolean }).__DEV__ = false;
