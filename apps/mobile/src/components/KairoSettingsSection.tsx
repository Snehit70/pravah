import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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

export function KairoSettingsSection() {
  const [draft, setDraft] = useState<KairoConfig>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

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
    setDraft((d) => {
      const defaults = KAIRO_DEFAULTS[p];
      return {
        ...d,
        providerFormat: p,
        baseUrl: d.baseUrl || defaults.baseUrl,
        model: d.model || defaults.model,
      };
    });
  };

  const handleSave = async () => {
    await saveKairoConfig(draft);
    setSavedNotice("Saved.");
    setTimeout(() => setSavedNotice(null), 1800);
  };

  const handleClear = async () => {
    await clearKairoConfig();
    setDraft(EMPTY);
    setSavedNotice("Cleared.");
    setTimeout(() => setSavedNotice(null), 1800);
  };

  const placeholders = KAIRO_DEFAULTS[draft.providerFormat];
  const status = isKairoConfigured(draft) ? "Configured" : "Not configured";

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

      <TextInput
        value={draft.apiKey}
        onChangeText={(v) => setDraft((d) => ({ ...d, apiKey: v }))}
        placeholder="API key"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        editable={loaded}
        style={styles.input}
      />
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
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
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
