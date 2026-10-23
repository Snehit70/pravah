export function ConvexClientProvider({ children }) {
  return children;
}
const sourceTree = process.env.EXPO_PUBLIC_NATIVE_CI_SOURCE;
if (!/^[a-f0-9]{40}$/.test(sourceTree ?? "")) throw new Error("Native fixture source identity is required");
console.info("[PRAVAH_NATIVE_CI_SOURCE]", sourceTree);
