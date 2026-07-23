import type { ExpoConfig } from "expo/config";

const IS_DEV = process.env.APP_VARIANT === "dev";

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
  version: "3.0.0",
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
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    url: "https://u.expo.dev/0bafd3f9-d42e-426a-8662-08828e4e9f00",
  },
};

export default config;
