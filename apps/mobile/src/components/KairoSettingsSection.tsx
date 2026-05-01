import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, TouchableOpacity } from "react-native";
import {
  KAIRO_DEFAULTS,
  clearKairoConfig,
  getKairoConfig,
  getKairoProviderLabel,
  isKairoConfigured,
  saveKairoConfig,
  type KairoConfig,
  type KairoProviderFormat,
} from "../lib/kairoConfig";
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

export function KairoSettingsSection() {
  const [draft, setDraft] = useState<KairoConfig>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getKairoConfig().then((c) => {
      if (!cancelled) {
        setDraft(c);
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

  const handleSave = async () => {
    if (!loaded) return;
    await saveKairoConfig(draft);
    setSavedNotice("Saved.");
    setTimeout(() => setSavedNotice(null), 1800);
  };

  const handleClear = async () => {
    await clearKairoConfig();
    setDraft(getProviderDraft("anthropic", ""));
    setSavedNotice("Cleared.");
    setTimeout(() => setSavedNotice(null), 1800);
  };

  const placeholders = KAIRO_DEFAULTS[draft.providerFormat];
  const status = isKairoConfigured(draft) ? "Configured" : "Not configured";

  // Show a minimal loading state while SecureStore resolves on cold start.
  // Previously all inputs rendered as disabled/empty which looked broken.
  if (!loaded) {
    return (
      <View style={styles.block}>
        <Text style={styles.label}>Kairo assistant</Text>
        <Text style={styles.help}>
          Bring your own API key. Stored in the device keychain — never sent to Pravah.
        </Text>
        <Text style={[styles.status, { color: colors.textMuted }]}>Loading…</Text>
      </View>
    );
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
        <TextInput
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
        <TouchableOpacity
          onPress={() => setApiKeyVisible((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={apiKeyVisible ? "Hide API key" : "Show API key"}
          style={styles.apiKeyToggle}
        >
          <Text style={styles.apiKeyToggleText}>{apiKeyVisible ? "Hide" : "Show"}</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        value={draft.baseUrl}
        onChangeText={(v) => setDraft((d) => ({ ...d, baseUrl: v }))}
        placeholder={placeholders.baseUrl}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        editable={loaded}
        style={styles.input}
      />
      <TextInput
        value={draft.model}
        onChangeText={(v) => setDraft((d) => ({ ...d, model: v }))}
        placeholder={placeholders.model}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        editable={loaded}
        style={styles.input}
      />

      <View style={styles.actions}>
        <Pressable
          onPress={() => void handleSave()}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Save Kairo configuration"
          disabled={!loaded}
          style={({ pressed }) => [pressed && { opacity: 0.6 }, !loaded && { opacity: 0.35 }]}
        >
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
        <Pressable
          onPress={() => void handleClear()}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Clear Kairo configuration"
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.clearText}>Clear</Text>
        </Pressable>
        {savedNotice ? <Text style={styles.notice}>{savedNotice}</Text> : null}
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
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  saveText: {
    ...typography.micro,
    color: colors.accent,
  },
  clearText: {
    ...typography.micro,
    color: colors.textMuted,
  },
  notice: {
    ...typography.micro,
    color: colors.textSecondary,
  },
});
