const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve("react-native-svg-transformer/expo"),
};
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== "svg");
config.resolver.sourceExts = [...config.resolver.sourceExts, "svg"];

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get: (_, name) => path.join(projectRoot, "node_modules", name),
  }
);

// The fixture transport is compiled only into an isolated, non-updating CI
// package. Production bundles always resolve the real auth and Convex modules.
if (process.env.PRAVAH_E2E === "1") {
  if (process.env.APP_VARIANT !== "e2e" || !process.env.CI || process.env.EAS_BUILD_PROFILE) {
    throw new Error("Fixture transport requires the CI-only E2E variant");
  }
  const replacements = new Map([
    [path.join(projectRoot, "src/lib/auth-client.ts"), "auth.js"],
    [path.join(projectRoot, "src/lib/convex.tsx"), "provider.js"],
  ]);
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (moduleName === "convex/react") {
      return { type: "sourceFile", filePath: path.join(projectRoot, "e2e/convex.js") };
    }
    const resolved = context.resolveRequest(context, moduleName, platform);
    const replacement = replacements.get(resolved.filePath);
    return replacement
      ? { type: "sourceFile", filePath: path.join(projectRoot, "e2e", replacement) }
      : resolved;
  };
}

module.exports = config;
