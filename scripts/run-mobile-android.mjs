import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

function pickAndroidSdk() {
  if (process.env.ANDROID_HOME) return process.env.ANDROID_HOME;
  if (process.env.ANDROID_SDK_ROOT) return process.env.ANDROID_SDK_ROOT;

  const home = os.homedir();
  const candidates = [
    path.join(home, "Android", "Sdk"),
    path.join(home, "Android", "sdk"),
    path.join(home, "Library", "Android", "sdk"),
    path.join(home, "projects", "dairy", "android-sdk"),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function pickJavaHome() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;

  const candidates = [
    "/usr/lib/jvm/java-21-openjdk",
    "/usr/lib/jvm/jdk-17.0.12-oracle-x64",
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

const androidSdk = pickAndroidSdk();
if (!androidSdk) {
  console.error("Android SDK not found. Set ANDROID_HOME (or ANDROID_SDK_ROOT) and retry.");
  process.exit(1);
}

const javaHome = pickJavaHome();
if (!javaHome) {
  console.error("JDK 21 (or 17) not found. Set JAVA_HOME to a compatible JDK and retry.");
  process.exit(1);
}

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: androidSdk,
  ANDROID_SDK_ROOT: androidSdk,
};

const child = spawn("bun", ["run", "--cwd", "apps/mobile", "android"], {
  env,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
