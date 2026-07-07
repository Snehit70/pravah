import { useState } from "react";
import * as Application from "expo-application";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { checkForAppUpdate, type UpdateAvailableResult, type UpdateCheckResult } from "../lib/appUpdate";
import { useAppUpdateInstaller } from "../hooks/useAppUpdateInstaller";
import { colors, radii, spacing, typography } from "../theme/tokens";
import AppUpdatesIconAsset from "../assets/icons/about-app-updates.svg";

const CANONICAL_PACKAGE = "com.pravah.mobile";

function statusCopy(result: UpdateCheckResult | null): string {
  if (!result) return "Manual check only. OTA updates still arrive automatically.";
  switch (result.status) {
    case "up-to-date":
      return "You're up to date.";
    case "update-available":
      return `APK ${result.version} is available. Installed APK is ${
        Application.nativeApplicationVersion ?? "unknown"
      }.`;
    case "offline":
      return "Could not reach GitHub. Check your connection and try again.";
    case "rate-limited":
      return result.retryAfter
        ? `GitHub rate limited this device. Try again after ${result.retryAfter}.`
        : "GitHub rate limited this device. Try again later.";
    case "malformed-metadata":
      return "The release metadata could not be read safely.";
    case "missing-asset":
      return `Version ${result.version} is missing its APK or checksum.`;
  }
}

function installerCopy(status: ReturnType<typeof useAppUpdateInstaller>["status"]): string | null {
  switch (status) {
    case "downloading":
      return "Downloading APK…";
    case "verifying":
      return "Verifying download…";
    case "installing":
      return "Opening Android installer…";
    case "corrupt":
      return "Download corrupted. Try again.";
    case "cant-install":
      return "Android needs install-from-unknown-sources permission for Pravah.";
    case "offline":
      return "Download failed. Check your connection and try again.";
    case "idle":
      return null;
  }
}

export function AppUpdateSection() {
  const [checkState, setCheckState] = useState<UpdateCheckResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const installer = useAppUpdateInstaller();

  if (Platform.OS !== "android" || Application.applicationId !== CANONICAL_PACKAGE) {
    return null;
  }

  const update =
    checkState?.status === "update-available" ? (checkState as UpdateAvailableResult) : null;
  const busy =
    isChecking ||
    installer.status === "downloading" ||
    installer.status === "verifying" ||
    installer.status === "installing";
  const installStatus = installerCopy(installer.status);

  return (
    <View style={styles.group}>
      <View style={styles.divider} />
      <View style={styles.headerRow}>
        <View style={styles.iconTile}>
          <AppUpdatesIconAsset color={colors.textPrimary} width={18} height={18} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.label}>App updates</Text>
          <Text style={styles.help}>{statusCopy(checkState)}</Text>
        </View>
      </View>
      {update ? (
        <View style={styles.notesBox}>
          <Text style={styles.notesTitle}>Release notes</Text>
          <Text style={styles.notesText}>{update.releaseNotes}</Text>
        </View>
      ) : null}
      {installStatus ? (
        <Text accessibilityLiveRegion="polite" style={styles.statusText}>
          {installStatus}
          {installer.status === "downloading"
            ? ` ${Math.round(installer.progress * 100)}%`
            : ""}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Pressable
          onPress={async () => {
            setIsChecking(true);
            try {
              setCheckState(await checkForAppUpdate(Application.nativeApplicationVersion));
            } finally {
              setIsChecking(false);
            }
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Check for app updates"
          accessibilityState={{ disabled: busy }}
          style={({ pressed }) => [
            styles.button,
            styles.secondaryButton,
            pressed && { opacity: 0.6 },
            busy && styles.disabled,
          ]}
        >
          <Text style={styles.buttonText}>{isChecking ? "Checking…" : "Check for updates"}</Text>
        </Pressable>
        {update ? (
          <Pressable
            onPress={() => void installer.install(update)}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Install Pravah ${update.version}`}
            accessibilityState={{ disabled: busy }}
            style={({ pressed }) => [
              styles.button,
              styles.primaryButton,
              pressed && { opacity: 0.6 },
              busy && styles.disabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>Install update</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  // Mirrors SettingsSheet's full-bleed sectionDivider; lives here so the
  // divider disappears with the section on non-canonical builds.
  divider: {
    height: 1,
    backgroundColor: colors.bgInput,
    marginHorizontal: -spacing.lg,
    marginVertical: spacing.xs,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  label: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontFamily: "Geist_600SemiBold",
  },
  help: {
    ...typography.bodyMd,
    color: colors.textMuted,
    lineHeight: 18,
  },
  notesBox: {
    backgroundColor: colors.bgSurface,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  notesTitle: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  notesText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  statusText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  button: {
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  primaryButton: {
    backgroundColor: colors.textPrimary,
    borderColor: colors.textPrimary,
  },
  secondaryButton: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.borderSubtle,
  },
  buttonText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  primaryButtonText: {
    ...typography.bodyMd,
    color: colors.textInverse,
    fontFamily: "Geist_600SemiBold",
  },
  disabled: {
    opacity: 0.5,
  },
});
