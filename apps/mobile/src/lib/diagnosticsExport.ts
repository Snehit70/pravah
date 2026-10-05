import * as Application from "expo-application";
import * as Device from "expo-device";
import * as FileSystem from "expo-file-system/legacy";
import * as Updates from "expo-updates";
import { sanitizeDiagnosticContext } from "./diagnostics";
import * as Sharing from "expo-sharing";
import { getDiagnosticsSnapshot } from "./diagnostics";

const DIR = `${FileSystem.documentDirectory ?? ""}diagnostics`;

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
  }
}

export async function writeDiagnosticsBundle(): Promise<string> {
  await ensureDir();
  const now = Date.now();
  const events = await getDiagnosticsSnapshot();
  const payload = {
    exportedAt: now,
    app: {
      applicationId: Application.applicationId,
      nativeBuildVersion: Application.nativeBuildVersion,
      nativeApplicationVersion: Application.nativeApplicationVersion,
    },
    updates: sanitizeDiagnosticContext({
      runningVersion: process.env.EXPO_PUBLIC_MOBILE_RELEASE_VERSION,
      updateId: Updates.updateId, runtime: Updates.runtimeVersion, channel: Updates.channel,
      embeddedLaunch: Updates.isEmbeddedLaunch, emergencyLaunch: Updates.isEmergencyLaunch,
      // Keep codes and timestamps; native messages can contain asset URLs.
      recentLogs: Updates.isEnabled ? await Updates.readLogEntriesAsync(24 * 60 * 60 * 1000)
        .then(logs => logs.slice(-40).map(log => ({ code: log.code, level: log.level, timestamp: log.timestamp })))
        .catch(() => []) : [],
    }),
    device: {
      brand: Device.brand,
      manufacturer: Device.manufacturer,
      modelName: Device.modelName,
      osName: Device.osName,
      osVersion: Device.osVersion,
      totalMemory: Device.totalMemory,
    },
    counts: {
      events: events.length,
    },
    events,
  };
  const path = `${DIR}/diagnostics-${now}.json`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(payload));
  return path;
}

export async function shareDiagnosticsBundle(): Promise<string> {
  const path = await writeDiagnosticsBundle();
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) return path;
  await Sharing.shareAsync(path, {
    dialogTitle: "Share Pravah diagnostics",
    mimeType: "application/json",
  });
  return path;
}
