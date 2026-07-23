import { describe, expect, it, vi } from "vitest";

vi.mock("../../convex/_generated/server", () => ({
  mutation: <T>(definition: T) => definition,
  query: <T>(definition: T) => definition,
}));

import { markStaged, publish, reserve } from "../../convex/mobileReleases";

type Handler<TArgs, TResult> = {
  handler: (ctx: unknown, args: TArgs) => Promise<TResult>;
};

describe("mobile release API", () => {
  it("reserves the next patch after the latest successful release", async () => {
    process.env.MOBILE_RELEASE_DEPLOY_SECRET = "deploy-secret";
    const control = {
      _id: "control-1",
      key: "mobile",
      latestVersion: "3.0.1",
      supportedRuntime: "native-1",
      supportedFingerprint: "fingerprint-1",
      revision: 4,
      updatedAt: 100,
    };
    const insert = vi.fn().mockResolvedValue("attempt-1");
    const patch = vi.fn().mockResolvedValue(undefined);
    const db = {
      query: vi.fn((table: string) => {
        if (table === "mobileReleaseControl") {
          return {
            withIndex: vi.fn(() => ({
              unique: vi.fn().mockResolvedValue(control),
            })),
          };
        }
        if (table === "mobileReleaseAttempts") {
          return {
            withIndex: vi.fn(() => ({
              first: vi.fn().mockResolvedValue(null),
            })),
          };
        }
        throw new Error(`unexpected table: ${table}`);
      }),
      insert,
      patch,
    };

    const result = await (
      reserve as unknown as Handler<
        {
          deploymentSecret: string;
          expectedRevision: number;
          delivery: "ota";
          sourceSha: string;
          sourceRef: string;
          title: string;
          releaseNotes: string;
          pullRequests: number[];
          nativeRuntime: string;
          nativeFingerprint: string;
        },
        { attemptId: string; version: string; revision: number }
      >
    ).handler(
      { db },
      {
        deploymentSecret: "deploy-secret",
        expectedRevision: 4,
        delivery: "ota",
        sourceSha: "abc123",
        sourceRef: "refs/pull/180/merge",
        title: "Improve capture",
        releaseNotes: "Capture is faster.",
        pullRequests: [180],
        nativeRuntime: "native-1",
        nativeFingerprint: "fingerprint-1",
      },
    );

    expect(result).toEqual({
      attemptId: "attempt-1",
      version: "3.0.2",
      revision: 5,
    });
    expect(insert).toHaveBeenCalledWith(
      "mobileReleaseAttempts",
      expect.objectContaining({
        version: "3.0.2",
        status: "pending",
        delivery: "ota",
        sourceSha: "abc123",
        pullRequests: [180],
      }),
    );
    expect(patch).toHaveBeenCalledWith(
      "control-1",
      expect.objectContaining({ revision: 5 }),
    );
  });

  it("publishes a staged native release and advances release control", async () => {
    process.env.MOBILE_RELEASE_DEPLOY_SECRET = "deploy-secret";
    const attempt = {
      _id: "attempt-2",
      version: "3.0.2",
      status: "staged",
      delivery: "native",
      sourceSha: "def456",
      nativeRuntime: "native-2",
      nativeFingerprint: "fingerprint-2",
      githubTag: "mobile-v3.0.2",
    };
    const control = {
      _id: "control-1",
      key: "mobile",
      latestVersion: "3.0.1",
      supportedRuntime: "native-1",
      supportedFingerprint: "fingerprint-1",
      revision: 5,
    };
    const patch = vi.fn().mockResolvedValue(undefined);
    const db = {
      get: vi.fn().mockResolvedValue(attempt),
      query: vi.fn(() => ({
        withIndex: vi.fn(() => ({
          unique: vi.fn().mockResolvedValue(control),
        })),
      })),
      patch,
    };

    const result = await (
      publish as unknown as Handler<
        {
          deploymentSecret: string;
          attemptId: string;
          expectedRevision: number;
        },
        { version: string; revision: number }
      >
    ).handler(
      { db },
      {
        deploymentSecret: "deploy-secret",
        attemptId: "attempt-2",
        expectedRevision: 5,
      },
    );

    expect(result).toEqual({ version: "3.0.2", revision: 6 });
    expect(patch).toHaveBeenCalledWith(
      "attempt-2",
      expect.objectContaining({
        status: "published",
        publishedAt: expect.any(Number),
      }),
    );
    expect(patch).toHaveBeenCalledWith(
      "control-1",
      expect.objectContaining({
        latestVersion: "3.0.2",
        supportedRuntime: "native-2",
        supportedFingerprint: "fingerprint-2",
        revision: 6,
      }),
    );
  });

  it("does not expose a staging transition without deployment authority", async () => {
    process.env.MOBILE_RELEASE_DEPLOY_SECRET = "deploy-secret";
    const handler = markStaged as unknown as Handler<
      {
        deploymentSecret: string;
        attemptId: string;
        easUpdateId?: string;
        easBranch?: string;
      },
      unknown
    >;

    await expect(
      handler.handler(
        { db: {} },
        {
          deploymentSecret: "wrong-secret",
          attemptId: "attempt-1",
          easUpdateId: "update-1",
          easBranch: "candidate-3.0.2",
        },
      ),
    ).rejects.toThrow("deployment authority");
  });
});
