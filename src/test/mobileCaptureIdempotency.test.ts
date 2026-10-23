import { describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../../convex/schema";
import { api } from "../../convex/_generated/api";

const modules = import.meta.glob("../../convex/**/*.ts");
vi.unmock("../../convex/writeServer");

describe("mobile capture replay", () => {
  it("acknowledges the same task after replay and rejects changed input", async () => {
    const root = convexTest(schema, modules);
    const client = root.withIdentity({ tokenIdentifier: "capture-owner" });
    const request = { title: "Offline capture", idempotencyKey: "mobile-capture-1" };
    const id = await client.mutation(api.tasks.addTask, request);
    expect(await client.mutation(api.tasks.addTask, request)).toBe(id);
    expect(await client.query(api.tasks.listTasks, { status: "inbox" })).toHaveLength(1);
    await expect(client.mutation(api.tasks.addTask, { ...request, title: "Different" })).rejects.toThrow("different request");
  });
});
