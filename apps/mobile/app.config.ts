import type { ExpoConfig } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "dev";
const IS_RELEASE_BUILD = Boolean(process.env.CI || process.env.EAS_BUILD_PROFILE);
const releaseVersion = process.env.EXPO_PUBLIC_MOBILE_RELEASE_VERSION;
const nativeRuntime = process.env.MOBILE_NATIVE_RUNTIME;
if (IS_RELEASE_BUILD && (!releaseVersion || !nativeRuntime)) {
  throw new Error("Mobile release builds require injected version and runtime");
}
const MOBILE_RELEASE_VERSION = releaseVersion ?? "0.0.0-dev";
const MOBILE_NATIVE_RUNTIME = nativeRuntime ?? "native-dev";
const androidVersionCode = process.env.MOBILE_ANDROID_VERSION_CODE
  ? Number(process.env.MOBILE_ANDROID_VERSION_CODE)
  : undefined;
if (
  androidVersionCode !== undefined &&
  (!Number.isInteger(androidVersionCode) || androidVersionCode < 1)
) {
  throw new Error("MOBILE_ANDROID_VERSION_CODE must be a positive integer");
}

const getPackageName = (): string => {
  if (IS_DEV) return "com.pravah.mobile.dev";
  return "com.pravah.mobile";
};

const getAppName = (): string => {
  if (IS_DEV) return "Pravah Dev";
  return "Pravah";
};

const config: ExpoConfig = {
  name: getAppName(),
  slug: "pravah-mobile",
  scheme: "pravah",
  version: MOBILE_RELEASE_VERSION,
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  plugins: [
    "expo-dev-client",
    [
      "expo-notifications",
      {
        icon: "./assets/notification-icon.png",
        color: "#6753c7",
      },
    ],
    "expo-font",
    "expo-secure-store",
    [
      "expo-audio",
      {
        microphonePermission: false,
        recordAudioAndroid: false,
        enableBackgroundPlayback: false,
      },
    ],
    "expo-image",
    "expo-asset",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#f7f1e8",
        dark: {
          image: "./assets/splash-icon.png",
          backgroundColor: "#151118",
        },
      },
    ],
    "./plugins/withBuildPerformance",
  ],
  ios: {
    supportsTablet: true,
    bundleIdentifier: getPackageName(),
  },
  android: {
    package: getPackageName(),
    versionCode: androidVersionCode,
    permissions: ["REQUEST_INSTALL_PACKAGES"],
    blockedPermissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    ],
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#f7f1e8",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  extra: {
    eas: {
      projectId: "0bafd3f9-d42e-426a-8662-08828e4e9f00",
    },
  },
  runtimeVersion: MOBILE_NATIVE_RUNTIME,
  updates: {
    url: "https://u.expo.dev/0bafd3f9-d42e-426a-8662-08828e4e9f00",
  },
};

export default config;
