import * as Application from "expo-application";
import * as Device from "expo-device";
import * as FileSystem from "expo-file-system/legacy";
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
