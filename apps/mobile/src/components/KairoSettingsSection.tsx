import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import {
  KAIRO_DEFAULTS,
  clearKairoConfig,
  getKairoConfig,
  getKairoProviderLabel,
  hasCustomKairoEndpoint,
  isKairoConfigured,
  saveKairoConfig,
  type KairoConfig,
  type KairoProviderFormat,
} from "../lib/kairoConfig";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { KairoSettingsSkeleton } from "./LoadingSkeleton";
import { colors, radii, spacing, typography } from "../theme/tokens";

const EMPTY: KairoConfig = {
  apiKey: "",
  baseUrl: "",
  model: "",
  providerFormat: "anthropic",
};

function getProviderDraft(providerFormat: KairoProviderFormat, apiKey: string): KairoConfig {
  const defaults = KAIRO_DEFAULTS[providerFormat];
  return {
    apiKey,
    providerFormat,
    baseUrl: defaults.baseUrl,
    model: defaults.model,
  };
}

type SaveState = "idle" | "saving" | "saved" | "cleared";

export function KairoSettingsSection() {
  const [draft, setDraft] = useState<KairoConfig>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    void getKairoConfig().then((c) => {
      if (!cancelled) {
        setDraft(c);
        // Decide initial advanced visibility once, off the persisted config
        // — not every keystroke. This avoids the section springing open the
        // moment a user clears the URL field.
        setShowAdvanced(hasCustomKairoEndpoint(c));
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setProvider = (p: KairoProviderFormat) => {
    setDraft((d) => getProviderDraft(p, d.apiKey));
  };

  const flashState = (next: "saved" | "cleared") => {
    setSaveState(next);
    setTimeout(() => {
      setSaveState((current) => (current === next ? "idle" : current));
    }, 1800);
  };

  const handleSave = async () => {
    if (!loaded || saveState === "saving") return;
    setSaveState("saving");
    await saveKairoConfig(draft);
    flashState("saved");
  };

  const handleClear = async () => {
    if (saveState === "saving") return;
    setSaveState("saving");
    await clearKairoConfig();
    setDraft(getProviderDraft("anthropic", ""));
    flashState("cleared");
  };

  const placeholders = KAIRO_DEFAULTS[draft.providerFormat];
  const status = isKairoConfigured(draft) ? "Configured" : "Not configured";

  // Show a minimal loading state while SecureStore resolves on cold start.
  // Previously all inputs rendered as disabled/empty which looked broken.
  if (!loaded) {
    return <KairoSettingsSkeleton />;
  }

  return (
    <View style={styles.block}>
      <Text style={styles.label}>Kairo assistant</Text>
      <Text style={styles.help}>
        Bring your own API key. Stored in the device keychain — never sent to Pravah.
      </Text>
      <Text style={[styles.status, { color: isKairoConfigured(draft) ? colors.primary : colors.textMuted }]}>
        {status}
      </Text>

      <View style={styles.providerRow}>
        {(["anthropic", "openai"] as KairoProviderFormat[]).map((p) => {
          const active = draft.providerFormat === p;
          return (
            <Pressable
              key={p}
              onPress={() => setProvider(p)}
              style={({ pressed }) => [
                styles.providerChip,
                active && styles.providerChipActive,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Use ${getKairoProviderLabel(p)} format`}
            >
              <Text style={[styles.providerChipText, active && styles.providerChipTextActive]}>
                {getKairoProviderLabel(p)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* API key row: input + show/hide toggle so the user can verify what
          is stored. The key sits in expo-secure-store (device keychain). */}
      <View style={styles.apiKeyRow}>
        <BottomSheetTextInput
          value={draft.apiKey}
          onChangeText={(v) => setDraft((d) => ({ ...d, apiKey: v }))}
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
        <Text style={styles.metaText}>
          {draft.providerFormat === "anthropic" ? "Anthropic format" : "OpenAI-compatible format"}
        </Text>
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
            value={draft.baseUrl}
            onChangeText={(v) => setDraft((d) => ({ ...d, baseUrl: v }))}
            placeholder={placeholders.baseUrl}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            editable={loaded}
            style={styles.input}
          />
          <Text style={styles.advancedLabel}>Model</Text>
          <BottomSheetTextInput
            value={draft.model}
            onChangeText={(v) => setDraft((d) => ({ ...d, model: v }))}
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
          disabled={!loaded || saveState === "saving"}
          style={({ pressed }) => [
            styles.saveButton,
            saveState === "saved" && styles.saveButtonSaved,
            pressed && { opacity: 0.7 },
            (!loaded || saveState === "saving") && { opacity: 0.5 },
          ]}
        >
          <Text
            style={[
              styles.saveButtonText,
              saveState === "saved" && styles.saveButtonTextSaved,
            ]}
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : "Save"}
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
          <Text style={styles.clearText}>
            {saveState === "cleared" ? "Cleared" : "Clear"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
  label: {
    color: colors.textPrimary,
    ...typography.title,
  },
  help: {
    color: colors.textSecondary,
    ...typography.bodyMd,
  },
  status: {
    ...typography.micro,
  },
  providerRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  providerChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  providerChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  providerChipText: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  providerChipTextActive: {
    color: colors.accent,
  },
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
  apiKeyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  apiKeyInput: {
    flex: 1,
  },
  apiKeyToggle: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  apiKeyToggleText: {
    ...typography.micro,
    color: colors.accent,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  metaText: {
    flex: 1,
    color: colors.textMuted,
    ...typography.micro,
  },
  advancedToggle: {
    paddingVertical: spacing.xs,
  },
  advancedToggleText: {
    color: colors.accent,
    ...typography.micro,
  },
  advancedWrap: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  advancedLabel: {
    color: colors.textMuted,
    ...typography.micro,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  saveButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
  },
  saveButtonSaved: {
    backgroundColor: colors.successMuted,
    borderColor: colors.success,
  },
  saveButtonText: {
    ...typography.micro,
    color: colors.accent,
  },
  saveButtonTextSaved: {
    color: colors.success,
  },
  clearText: {
    ...typography.micro,
    color: colors.textMuted,
  },
});
