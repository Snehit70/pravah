import { useCallback, useState } from "react";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";

import type { UpdateAvailableResult } from "../lib/appUpdate";

export type InstallStatus =
  | "idle"
  | "downloading"
  | "verifying"
  | "installing"
  | "corrupt"
  | "cant-install"
  | "offline";

export type AppUpdateInstaller = {
  status: InstallStatus;
  progress: number;
  install: (update: UpdateAvailableResult) => Promise<void>;
};

const APK_DIR = `${FileSystem.cacheDirectory ?? ""}app-updates`;
const APK_PATH = `${APK_DIR}/pravah-update.apk`;
const PACKAGE_ARCHIVE_MIME = "application/vnd.android.package-archive";

async function ensureUpdateDir() {
  const info = await FileSystem.getInfoAsync(APK_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(APK_DIR, { intermediates: true });
  }
}

async function clearPreviousDownload() {
  const info = await FileSystem.getInfoAsync(APK_PATH);
  if (info.exists) {
    await FileSystem.deleteAsync(APK_PATH, { idempotent: true });
  }
}

function parseMd5(value: string): string {
  return value.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

async function openUnknownSourcesSettings() {
  const packageName = Application.applicationId;
  await IntentLauncher.startActivityAsync(
    "android.settings.MANAGE_UNKNOWN_APP_SOURCES",
    packageName ? { data: `package:${packageName}` } : undefined,
  );
}

export function useAppUpdateInstaller(): AppUpdateInstaller {
  const [status, setStatus] = useState<InstallStatus>("idle");
  const [progress, setProgress] = useState(0);

  const install = useCallback(async (update: UpdateAvailableResult) => {
    try {
      setStatus("downloading");
      setProgress(0);
      await ensureUpdateDir();
      await clearPreviousDownload();

      const download = FileSystem.createDownloadResumable(
        update.apkUrl,
        APK_PATH,
        {},
        ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
          if (totalBytesExpectedToWrite > 0) {
            setProgress(totalBytesWritten / totalBytesExpectedToWrite);
          }
        },
      );
      const downloaded = await download.downloadAsync();
      if (!downloaded?.uri) {
        setStatus("offline");
        return;
      }

      setStatus("verifying");
      const [checksumResponse, fileInfo] = await Promise.all([
        fetch(update.md5Url),
        FileSystem.getInfoAsync(downloaded.uri, { md5: true }),
      ]);
      if (!checksumResponse.ok || !fileInfo.exists || !fileInfo.md5) {
        setStatus("offline");
        return;
      }

      const expectedMd5 = parseMd5(await checksumResponse.text());
      if (fileInfo.md5.toLowerCase() !== expectedMd5) {
        setStatus("corrupt");
        return;
      }

      setStatus("installing");
      const contentUri = await FileSystem.getContentUriAsync(downloaded.uri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: 1,
        type: PACKAGE_ARCHIVE_MIME,
      });
    } catch {
      setStatus("cant-install");
      try {
        await openUnknownSourcesSettings();
      } catch {
        // The visible CantInstall state is the useful recovery path.
      }
    }
  }, []);

  return { status, progress, install };
}
