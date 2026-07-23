import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

const convexUrl = process.env.CONVEX_URL;
const argsJson = process.env.BASELINE_ARGS;
if (!convexUrl || !argsJson) {
  throw new Error("CONVEX_URL and BASELINE_ARGS are required");
}

const client = new ConvexHttpClient(convexUrl);
const result = await client.mutation(
  api.mobileReleases.seed,
  JSON.parse(argsJson),
);
process.stdout.write(`${JSON.stringify(result)}\n`);
