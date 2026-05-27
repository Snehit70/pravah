import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
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
    const isAnyConfigured = PROVIDERS.some((provider) => {
      const profile = settings.profiles[provider];
      return Boolean(profile.apiKey && profile.baseUrl && profile.model);
    });
    return isAnyConfigured ? "Configured" : "Not configured";
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

  return (
    <View style={styles.block}>
      <Text style={styles.label}>Kairo assistant</Text>
      <Text style={styles.help}>Bring your own API key. Stored in the device keychain.</Text>
      <Text style={[styles.status, { color: status === "Configured" ? colors.primary : colors.textMuted }]}>
        {status}
      </Text>
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <View style={styles.providerRow}>
        {PROVIDERS.map((provider) => {
          const active = provider === activeProvider;
          const isDefault = settings?.defaultProvider === provider;
          return (
            <Pressable
              key={provider}
              onPress={() => setActiveProvider(provider)}
              style={({ pressed }) => [
                styles.providerChip,
                active && styles.providerChipActive,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Use ${getKairoProviderLabel(provider)} profile`}
            >
              <Text style={[styles.providerChipText, active && styles.providerChipTextActive]}>
                {getKairoProviderLabel(provider)}{isDefault ? " · Default" : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={handleSetDefault}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Set active provider as default"
        style={({ pressed }) => [styles.defaultAction, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.defaultActionText}>Set {getKairoProviderLabel(activeProvider)} as default</Text>
      </Pressable>

      <View style={styles.apiKeyRow}>
        <BottomSheetTextInput
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
          accessibilityLabel={showAdvanced ? "Hide advanced Kairo settings" : "Show advanced Kairo settings"}
          style={({ pressed }) => [styles.advancedToggle, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.advancedToggleText}>{showAdvanced ? "Hide advanced" : "Advanced"}</Text>
        </Pressable>
      </View>

      {showAdvanced ? (
        <Animated.View
          entering={reducedMotion ? undefined : FadeIn.duration(180)}
          exiting={reducedMotion ? undefined : FadeOut.duration(120)}
          style={styles.advancedWrap}
        >
          <Text style={styles.advancedLabel}>Endpoint URL</Text>
          <BottomSheetTextInput
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
          <BottomSheetTextInput
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
          <Text style={[styles.saveButtonText, saveState === "saved" && styles.saveButtonTextSaved]}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Save"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => void handleClear()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear Kairo configuration"
          disabled={saveState === "saving"}
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.clearText}>{saveState === "cleared" ? "Cleared" : "Clear"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  label: { color: colors.textPrimary, ...typography.title },
  help: { color: colors.textSecondary, ...typography.bodyMd },
  status: { ...typography.micro },
  errorText: { color: colors.error, ...typography.micro },
  providerRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs, flexWrap: "wrap" },
  providerChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  providerChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  providerChipText: { ...typography.micro, color: colors.textSecondary },
  providerChipTextActive: { color: colors.accent },
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: "transparent",
  },
  saveButtonSaved: { borderColor: colors.primary, backgroundColor: colors.accentSoft },
  saveButtonText: { color: colors.accent, ...typography.micro },
  saveButtonTextSaved: { color: colors.primary },
  clearText: { color: colors.textMuted, ...typography.micro },
});
