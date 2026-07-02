import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import {
  KAIRO_DEFAULTS,
  clearKairoConfig,
  getKairoProviderLabel,
  getKairoSettings,
  hasCustomKairoEndpoint,
  saveKairoSettings,
  type KairoConfig,
  type KairoProviderFormat,
  type KairoSettings,
} from "../lib/kairoConfig";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { KairoSettingsSkeleton } from "./LoadingSkeleton";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { classifyError, mobileLogger } from "../lib/logger";

const PROVIDERS: KairoProviderFormat[] = ["anthropic", "openai", "gemini"];

type SaveState = "idle" | "saving" | "saved" | "cleared";

function toConfig(settings: KairoSettings, provider: KairoProviderFormat): KairoConfig {
  const profile = settings.profiles[provider];
  return {
    providerFormat: provider,
    apiKey: profile.apiKey,
    baseUrl: profile.baseUrl,
    model: profile.model,
  };
}

function isProfileConfigured(profile: KairoSettings["profiles"][KairoProviderFormat]): boolean {
  return Boolean(profile.apiKey && profile.baseUrl && profile.model);
}

export function KairoSettingsSection() {
  const [settings, setSettings] = useState<KairoSettings | null>(null);
  const [activeProvider, setActiveProvider] = useState<KairoProviderFormat>("anthropic");
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    void getKairoSettings()
      .then((next) => {
        if (cancelled) return;
        setSettings(next);
        setActiveProvider(next.defaultProvider);
        setShowAdvanced(hasCustomKairoEndpoint(toConfig(next, next.defaultProvider)));
        setLoaded(true);
      })
      .catch((error) => {
        mobileLogger.warn("kairo_settings_load_failed", { errorType: classifyError(error) });
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeProfile = useMemo(() => {
    if (!settings) {
      return {
        apiKey: "",
        baseUrl: KAIRO_DEFAULTS[activeProvider].baseUrl,
        model: KAIRO_DEFAULTS[activeProvider].model,
      };
    }
    return settings.profiles[activeProvider];
  }, [activeProvider, settings]);

  const status = useMemo(() => {
    if (!settings) return "Not configured";
    const isAnyConfigured = PROVIDERS.some((provider) =>
      isProfileConfigured(settings.profiles[provider]),
    );
    return isAnyConfigured ? "Configured" : "Not configured";
  }, [settings]);

  const configuredCount = useMemo(() => {
    if (!settings) return 0;
    return PROVIDERS.filter((provider) => isProfileConfigured(settings.profiles[provider])).length;
  }, [settings]);

  const flashState = (next: "saved" | "cleared") => {
    setSaveState(next);
    setTimeout(() => {
      setSaveState((current) => (current === next ? "idle" : current));
    }, 1800);
  };

  const updateActiveProfile = (patch: Partial<(typeof activeProfile)>) => {
    setSettings((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        profiles: {
          ...prev.profiles,
          [activeProvider]: {
            ...prev.profiles[activeProvider],
            ...patch,
          },
        },
      };
    });
  };

  const handleSetDefault = () => {
    setSettings((prev) => (prev ? { ...prev, defaultProvider: activeProvider } : prev));
  };

  const handleSelectProvider = (provider: KairoProviderFormat) => {
    setActiveProvider(provider);
    if (!settings) {
      setShowAdvanced(false);
      return;
    }
    setShowAdvanced(hasCustomKairoEndpoint(toConfig(settings, provider)));
  };

  const handleSave = async () => {
    if (!loaded || saveState === "saving" || !settings) return;
    setErrorMessage(null);
    setSaveState("saving");
    try {
      await saveKairoSettings(settings);
      flashState("saved");
    } catch (error) {
      mobileLogger.warn("kairo_settings_save_failed", { errorType: classifyError(error) });
      setSaveState("idle");
      setErrorMessage("Could not save Kairo settings.");
    }
  };

  const handleClear = async () => {
    if (saveState === "saving") return;
    setErrorMessage(null);
    setSaveState("saving");
    try {
      await clearKairoConfig();
      const cleared = await getKairoSettings();
      setSettings(cleared);
      setActiveProvider(cleared.defaultProvider);
      setShowAdvanced(false);
      flashState("cleared");
    } catch (error) {
      mobileLogger.warn("kairo_settings_clear_failed", { errorType: classifyError(error) });
      setSaveState("idle");
      setErrorMessage("Could not clear Kairo settings.");
    }
  };

  if (!loaded) {
    return <KairoSettingsSkeleton />;
  }

  const placeholders = KAIRO_DEFAULTS[activeProvider];
  const providerMeta =
    activeProvider === "anthropic"
      ? "Anthropic format"
      : activeProvider === "gemini"
        ? "Gemini native format"
        : "OpenAI-compatible format";
  const activeIsDefault = settings?.defaultProvider === activeProvider;

  return (
    <View style={styles.block}>
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <View style={styles.providerCard}>
        <View style={styles.providerCardHeader}>
          <View style={styles.providerCardSummary}>
            <Text style={styles.providerCardTitle}>
              Default provider: {getKairoProviderLabel(settings?.defaultProvider ?? "anthropic")}
            </Text>
            <Text style={styles.providerCardSubtext}>
              {configuredCount} of {PROVIDERS.length} providers configured
            </Text>
          </View>
          <View
            style={[
              styles.summaryStatusBadge,
              status === "Configured"
                ? styles.summaryStatusBadgeReady
                : styles.summaryStatusBadgeSetup,
            ]}
          >
            <Text
              style={[
                styles.summaryStatusBadgeText,
                status === "Configured"
                  ? styles.summaryStatusBadgeTextReady
                  : styles.summaryStatusBadgeTextSetup,
              ]}
            >
              {status === "Configured" ? "Ready" : "Needs setup"}
            </Text>
          </View>
        </View>
        {PROVIDERS.map((provider) => {
          const isSelected = provider === activeProvider;
          const isDefault = settings?.defaultProvider === provider;
          const providerConfigured = settings ? isProfileConfigured(settings.profiles[provider]) : false;
          return (
            <View key={provider}>
              <Pressable
                onPress={() => handleSelectProvider(provider)}
                style={({ pressed }) => [
                  styles.providerRow,
                  isSelected && styles.providerRowSelected,
                  pressed && { opacity: 0.8 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${getKairoProviderLabel(provider)} provider profile`}
              >
                <View style={styles.providerIdentity}>
                  <View style={styles.providerTitleRow}>
                    <Text style={styles.providerName}>{getKairoProviderLabel(provider)}</Text>
                    {isDefault ? (
                      <View style={[styles.providerBadge, styles.providerBadgeDefault]}>
                        <Text style={[styles.providerBadgeText, styles.providerBadgeTextDefault]}>
                          Default
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.providerBadges}>
                    <View
                      style={[
                        styles.providerBadge,
                        providerConfigured
                          ? styles.providerBadgeConfigured
                          : styles.providerBadgeIdle,
                      ]}
                    >
                      <Text
                        style={[
                          styles.providerBadgeText,
                          providerConfigured
                            ? styles.providerBadgeTextConfigured
                            : styles.providerBadgeTextIdle,
                        ]}
                      >
                        {providerConfigured ? "Configured" : "Needs key"}
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.providerRowAction}>{isSelected ? "" : "Edit"}</Text>
              </Pressable>

              {isSelected ? (
                <View style={styles.editorInline}>
                  <View style={styles.editorHeader}>
                    <View style={styles.editorHeaderCopy}>
                      <Text style={styles.editorLabel}>
                        {getKairoProviderLabel(activeProvider)} credentials
                      </Text>
                      <Text style={styles.editorHelp}>
                        {activeIsDefault
                          ? "Kairo uses this provider by default."
                          : "You can configure this profile without making it the default."}
                      </Text>
                    </View>
                    {!activeIsDefault ? (
                      <Pressable
                        onPress={handleSetDefault}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={`Make ${getKairoProviderLabel(activeProvider)} the default Kairo provider`}
                        style={({ pressed }) => [styles.defaultAction, pressed && { opacity: 0.7 }]}
                      >
                        <Text style={styles.defaultActionText}>Make default</Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View style={styles.apiKeyRow}>
                    <TextInput
                      value={activeProfile.apiKey}
                      onChangeText={(v) => updateActiveProfile({ apiKey: v })}
                      placeholder="API key"
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry={!apiKeyVisible}
                      editable={loaded}
                      style={[styles.input, styles.apiKeyInput]}
                    />
                    <Pressable
                      onPress={() => setApiKeyVisible((v) => !v)}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={apiKeyVisible ? "Hide API key" : "Show API key"}
                      style={({ pressed }) => [styles.apiKeyToggle, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={styles.apiKeyToggleText}>{apiKeyVisible ? "Hide" : "Show"}</Text>
                    </Pressable>
                  </View>

                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>{providerMeta}</Text>
                    <Pressable
                      onPress={() => setShowAdvanced((v) => !v)}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={
                        showAdvanced
                          ? "Hide advanced Kairo settings"
                          : "Show advanced Kairo settings"
                      }
                      style={({ pressed }) => [styles.advancedToggle, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={styles.advancedToggleText}>
                        {showAdvanced ? "Hide advanced" : "Advanced"}
                      </Text>
                    </Pressable>
                  </View>

                  {showAdvanced ? (
                    <Animated.View
                      entering={reducedMotion ? undefined : FadeIn.duration(180)}
                      exiting={reducedMotion ? undefined : FadeOut.duration(120)}
                      style={styles.advancedWrap}
                    >
                      <Text style={styles.advancedLabel}>Endpoint URL</Text>
                      <TextInput
                        value={activeProfile.baseUrl}
                        onChangeText={(v) => updateActiveProfile({ baseUrl: v })}
                        placeholder={placeholders.baseUrl}
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={loaded}
                        style={styles.input}
                      />
                      <Text style={styles.advancedLabel}>Model</Text>
                      <TextInput
                        value={activeProfile.model}
                        onChangeText={(v) => updateActiveProfile({ model: v })}
                        placeholder={placeholders.model}
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={loaded}
                        style={styles.input}
                      />
                    </Animated.View>
                  ) : null}

                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => void handleSave()}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel="Save Kairo configuration"
                      disabled={!loaded || saveState === "saving" || !settings}
                      style={({ pressed }) => [
                        styles.saveButton,
                        saveState === "saved" && styles.saveButtonSaved,
                        pressed && { opacity: 0.7 },
                        (!loaded || saveState === "saving" || !settings) && { opacity: 0.5 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.saveButtonText,
                          saveState === "saved" && styles.saveButtonTextSaved,
                        ]}
                      >
                        {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void handleClear()}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel="Clear Kairo configuration"
                      disabled={saveState === "saving"}
                      style={({ pressed }) => [styles.clearAction, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={styles.clearText}>{saveState === "cleared" ? "Cleared" : "Clear"}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {provider !== PROVIDERS[PROVIDERS.length - 1] ? (
                <View style={styles.providerDivider} />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  errorText: { color: colors.error, ...typography.micro },
  summaryStatusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  summaryStatusBadgeReady: { backgroundColor: colors.accentSoft },
  summaryStatusBadgeSetup: { backgroundColor: colors.bgCard },
  summaryStatusBadgeText: { ...typography.micro },
  summaryStatusBadgeTextReady: { color: colors.accent },
  summaryStatusBadgeTextSetup: { color: colors.textMuted },
  providerCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    overflow: "hidden",
  },
  providerCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  providerCardSummary: { flex: 1, gap: spacing.xs },
  providerCardTitle: { color: colors.textPrimary, ...typography.bodyMd },
  providerCardSubtext: { color: colors.textSecondary, ...typography.micro },
  providerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  providerRowSelected: {
    backgroundColor: "#f7f1e7",
  },
  providerIdentity: { flex: 1, gap: spacing.xs },
  providerTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, flexWrap: "wrap" },
  providerName: { color: colors.textPrimary, ...typography.bodyMd },
  providerBadges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  providerBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  providerBadgeConfigured: { backgroundColor: "#efe7f8" },
  providerBadgeIdle: { backgroundColor: "#f7f1e7" },
  providerBadgeDefault: { backgroundColor: "#ebe2d5" },
  providerBadgeText: { ...typography.micro },
  providerBadgeTextConfigured: { color: colors.accent },
  providerBadgeTextIdle: { color: colors.textMuted },
  providerBadgeTextDefault: { color: colors.textSecondary },
  providerRowAction: {
    color: colors.textMuted,
    ...typography.micro,
    minWidth: 34,
    textAlign: "right",
  },
  providerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  editorInline: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
    backgroundColor: "#fcf7f0",
  },
  editorHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  editorHeaderCopy: { flex: 1, gap: spacing.xs },
  editorLabel: { color: colors.textPrimary, ...typography.bodyMd },
  editorHelp: { color: colors.textSecondary, ...typography.micro },
  defaultAction: { paddingVertical: spacing.xs },
  defaultActionText: { ...typography.micro, color: colors.accent },
  input: {
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    ...typography.bodyMd,
  },
  apiKeyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  apiKeyInput: { flex: 1 },
  apiKeyToggle: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  apiKeyToggleText: { ...typography.micro, color: colors.accent },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  metaText: { flex: 1, color: colors.textMuted, ...typography.micro },
  advancedToggle: { paddingVertical: spacing.xs },
  advancedToggleText: { color: colors.accent, ...typography.micro },
  advancedWrap: { gap: spacing.sm, paddingTop: spacing.xs },
  advancedLabel: { color: colors.textMuted, ...typography.micro },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingTop: spacing.xs },
  saveButton: {
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.accent,
  },
  saveButtonSaved: { backgroundColor: colors.primary },
  saveButtonText: { color: colors.bgCard, ...typography.micro },
  saveButtonTextSaved: { color: colors.bgCard },
  clearAction: { paddingVertical: spacing.xs },
  clearText: { color: colors.textMuted, ...typography.micro },
});
