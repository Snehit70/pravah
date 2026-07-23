import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

const convexUrl = process.env.CONVEX_URL;
if (!convexUrl) {
  throw new Error("CONVEX_URL is required");
}

const client = new ConvexHttpClient(convexUrl);
const state = await client.query(api.mobileReleases.getState, {});
if (!state) {
  throw new Error("Mobile release control is not seeded");
}

process.stdout.write(`${JSON.stringify(state)}\n`);
