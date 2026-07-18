import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  KAIRO_DEFAULTS,
  KairoSettingsValidationError,
  clearKairoProvider,
  getKairoProviderLabel,
  getKairoSettings,
  hasCustomKairoEndpoint,
  saveKairoSettings,
  validateKairoProviderProfile,
  type KairoConfig,
  type KairoProfileErrors,
  type KairoProfileField,
  type KairoProviderFormat,
  type KairoSettings,
} from "../lib/kairoConfig";
import { testKairoConnection } from "../lib/kairoConnection";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useConfirm } from "../hooks/useConfirm";
import { KairoSettingsSkeleton } from "./LoadingSkeleton";
import { colors, motion, radii, spacing, typography } from "../theme/tokens";
import { classifyError, mobileLogger } from "../lib/logger";
import {
  AdjustmentsIcon,
  ChevronRightIcon,
  ChevronUpIcon,
} from "./UiIcons";
import KairoIconAsset from "../assets/icons/settings-kairo.svg";
import KairoKeyAsset from "../assets/icons/kairo-key.svg";
import AnthropicIconAsset from "../assets/icons/provider-anthropic.svg";
import OpenAIIconAsset from "../assets/icons/provider-openai.svg";
import GeminiIconAsset from "../assets/icons/provider-gemini.svg";
import KairoEyeOpenAsset from "../assets/icons/kairo-eye-open.svg";
import KairoEyeClosedAsset from "../assets/icons/kairo-eye-closed.svg";

const PROVIDERS: KairoProviderFormat[] = ["anthropic", "openai", "gemini"];
const PROVIDER_REVEAL_EASING = Easing.bezier(...motion.easing.outQuart);
const PROVIDER_EXIT_EASING = Easing.bezier(...motion.easing.outExpo);

type SaveState = "idle" | "saving" | "saved" | "cleared";
type TestState = "idle" | "testing" | "passed";

function toConfig(settings: KairoSettings, provider: KairoProviderFormat): KairoConfig {
  const profile = settings.profiles[provider];
  return {
    providerFormat: provider,
    apiKey: profile.apiKey,
    baseUrl: profile.baseUrl,
    model: profile.model,
  };
}

function isProfileConfigured(
  provider: KairoProviderFormat,
  profile: KairoSettings["profiles"][KairoProviderFormat],
): boolean {
  return (
    Boolean(profile.apiKey) &&
    Object.keys(validateKairoProviderProfile({ ...profile })).length === 0
  );
}

function ProviderIcon({
  provider,
  size = 18,
  variant = "default",
}: {
  provider?: KairoProviderFormat;
  size?: number;
  variant?: "default" | "large";
}) {
  return (
    <View style={[styles.providerIconWrap, variant === "large" && styles.providerIconWrapLarge]}>
      {provider === "anthropic" ? (
        <AnthropicIconAsset width={size} height={size} color={colors.textSecondary} />
      ) : provider === "openai" ? (
        <OpenAIIconAsset width={size} height={size} color={colors.textSecondary} />
      ) : provider === "gemini" ? (
        <GeminiIconAsset width={size} height={size} color={colors.textSecondary} />
      ) : (
        <KairoIconAsset width={size} height={size} color={colors.textSecondary} />
      )}
    </View>
  );
}

function ApiKeyVisibilityIcon({ visible }: { visible: boolean }) {
  const Icon = visible ? KairoEyeClosedAsset : KairoEyeOpenAsset;

  return <Icon width={19} height={19} color={colors.textSecondary} />;
}

function ProviderChevron({
  expanded,
  reducedMotion,
}: {
  expanded: boolean;
  reducedMotion: boolean;
}) {
  const rotation = useSharedValue(expanded ? -90 : 0);

  useEffect(() => {
    rotation.value = withTiming(expanded ? -90 : 0, {
      duration: reducedMotion ? 0 : motion.duration.base,
      easing: PROVIDER_REVEAL_EASING,
    });
  }, [expanded, reducedMotion, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${rotation.value}deg`,
      },
    ],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <ChevronRightIcon color={colors.textSecondary} size={18} />
    </Animated.View>
  );
}

type KairoSettingsSectionProps = {
  onFieldFocus?: (field: KairoProfileField) => void;
};

export function KairoSettingsSection({ onFieldFocus }: KairoSettingsSectionProps = {}) {
  const [settings, setSettings] = useState<KairoSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<KairoSettings | null>(null);
  const [activeProvider, setActiveProvider] = useState<KairoProviderFormat | null>(null);
  const [defaultPickerOpen, setDefaultPickerOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [testState, setTestState] = useState<TestState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<KairoProfileErrors>({});
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const reducedMotion = useReducedMotion();
  const confirm = useConfirm();

  useEffect(() => {
    let cancelled = false;
    void getKairoSettings()
      .then((next) => {
        if (cancelled) return;
        setSettings(next);
        setSavedSettings(next);
        setActiveProvider(null);
        setDefaultPickerOpen(false);
        setShowAdvanced(false);
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

  const anyConfigured = useMemo(() => {
    if (!savedSettings) return false;
    return PROVIDERS.some((provider) =>
      isProfileConfigured(provider, savedSettings.profiles[provider]),
    );
  }, [savedSettings]);

  const defaultProvider = savedSettings?.defaultProvider ?? "anthropic";
  const editorProvider = activeProvider ?? defaultProvider;
  const defaultProviderConfigured = savedSettings
    ? isProfileConfigured(defaultProvider, savedSettings.profiles[defaultProvider])
    : false;
  const hasDefaultProvider = anyConfigured && defaultProviderConfigured;
  const defaultProviderValue = hasDefaultProvider
    ? getKairoProviderLabel(defaultProvider)
    : "Not set";
  const defaultProviderHelp = !hasDefaultProvider
    ? "Set up a provider to choose a default."
    : null;

  const activeProfile = useMemo(() => {
    if (!settings) {
      return {
        apiKey: "",
        baseUrl: KAIRO_DEFAULTS[editorProvider].baseUrl,
        model: KAIRO_DEFAULTS[editorProvider].model,
      };
    }
    return settings.profiles[editorProvider];
  }, [editorProvider, settings]);

  const activeProviderConfigured = useMemo(() => {
    if (!activeProvider || !savedSettings) return false;
    return isProfileConfigured(activeProvider, savedSettings.profiles[activeProvider]);
  }, [activeProvider, savedSettings]);

  const flashState = (next: "saved" | "cleared") => {
    setSaveState(next);
    setTimeout(() => {
      setSaveState((current) => (current === next ? "idle" : current));
    }, 1800);
  };

  const updateActiveProfile = (
    patch: Partial<(typeof activeProfile)>,
    field: KairoProfileField,
  ) => {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setErrorMessage(null);
    setTestState("idle");
    setSettings((prev) => {
      if (!prev || !activeProvider) return prev;
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

  const handleSelectProvider = (provider: KairoProviderFormat) => {
    if (activeProvider === provider) {
      setActiveProvider(null);
      setApiKeyVisible(false);
      setShowAdvanced(false);
      setFieldErrors({});
      setErrorMessage(null);
      setTestState("idle");
      return;
    }
    setActiveProvider(provider);
    setApiKeyVisible(false);
    setFieldErrors({});
    setErrorMessage(null);
    setTestState("idle");
    if (!settings) {
      setShowAdvanced(false);
      return;
    }
    setShowAdvanced(hasCustomKairoEndpoint(toConfig(settings, provider)));
  };

  const handleChooseDefaultProvider = async (provider: KairoProviderFormat) => {
    if (!settings || !savedSettings || saveState === "saving") return;
    const providerConfigured = isProfileConfigured(
      provider,
      savedSettings.profiles[provider],
    );
    if (!providerConfigured) {
      setDefaultPickerOpen(false);
      handleSelectProvider(provider);
      return;
    }
    setDefaultPickerOpen(false);
    setErrorMessage(null);
    setSaveState("saving");
    const nextSavedSettings = { ...savedSettings, defaultProvider: provider };
    try {
      await saveKairoSettings(nextSavedSettings);
      setSavedSettings(nextSavedSettings);
      setSettings((current) =>
        current ? { ...current, defaultProvider: provider } : current,
      );
      flashState("saved");
    } catch (error) {
      mobileLogger.warn("kairo_default_provider_save_failed", {
        errorType: classifyError(error),
      });
      setSaveState("idle");
      setErrorMessage("Could not update the default provider.");
    }
  };

  const handleSave = async () => {
    if (!loaded || saveState === "saving" || !settings || !activeProvider) return;
    setErrorMessage(null);
    const validationErrors = validateKairoProviderProfile(activeProfile);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      if (validationErrors.baseUrl || validationErrors.model) setShowAdvanced(true);
      return;
    }
    setFieldErrors({});
    setSaveState("saving");
    try {
      await saveKairoSettings(settings);
      setSavedSettings(settings);
      flashState("saved");
    } catch (error) {
      mobileLogger.warn("kairo_settings_save_failed", { errorType: classifyError(error) });
      setSaveState("idle");
      if (error instanceof KairoSettingsValidationError) {
        setFieldErrors(error.errors);
        setErrorMessage(`Check the ${getKairoProviderLabel(error.provider)} settings.`);
        if (error.errors.baseUrl || error.errors.model) setShowAdvanced(true);
      } else {
        setErrorMessage("Could not save Kairo settings.");
      }
    }
  };

  const handleTestConnection = async () => {
    if (!activeProvider || testState === "testing") return;
    setErrorMessage(null);
    const validationErrors = validateKairoProviderProfile(activeProfile);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      if (validationErrors.baseUrl || validationErrors.model) setShowAdvanced(true);
      return;
    }
    setFieldErrors({});
    setTestState("testing");
    try {
      await testKairoConnection(toConfig(settings!, activeProvider));
      setTestState("passed");
    } catch (error) {
      mobileLogger.warn("kairo_connection_test_failed", { errorType: classifyError(error) });
      setTestState("idle");
      if (error instanceof KairoSettingsValidationError) {
        setFieldErrors(error.errors);
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Could not reach the provider.");
      }
    }
  };

  const handleClear = async () => {
    if (saveState === "saving" || !activeProvider) return;
    
    const confirmed = await confirm({
      title: `Clear ${getKairoProviderLabel(activeProvider)} credentials?`,
      message: "Your API key and custom settings will be permanently removed. This can't be undone.",
      confirmLabel: "Clear",
      destructive: true,
    });
    
    if (!confirmed) return;
    
    setErrorMessage(null);
    setSaveState("saving");
    try {
      const cleared = await clearKairoProvider(activeProvider);
      setSettings(cleared);
      setSavedSettings(cleared);
      setActiveProvider(null);
      setDefaultPickerOpen(false);
      setApiKeyVisible(false);
      setShowAdvanced(false);
      setFieldErrors({});
      setTestState("idle");
      flashState("cleared");
    } catch (error) {
      mobileLogger.warn("kairo_provider_clear_failed", { 
        errorType: classifyError(error),
        provider: activeProvider,
      });
      setSaveState("idle");
      setErrorMessage(`Could not clear ${getKairoProviderLabel(activeProvider)} settings.`);
    }
  };

  if (!loaded) {
    return <KairoSettingsSkeleton />;
  }

  const placeholders = KAIRO_DEFAULTS[editorProvider];

  return (
    <View style={styles.block}>
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <View style={styles.layout}>
        <Pressable
          onPress={() => setDefaultPickerOpen((current) => !current)}
          style={({ pressed }) => [styles.defaultHeader, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Choose default Kairo provider"
          accessibilityState={{ expanded: defaultPickerOpen }}
        >
          <ProviderIcon
            provider={hasDefaultProvider ? defaultProvider : undefined}
            size={22}
            variant="large"
          />
          <View style={styles.defaultHeaderCopy}>
            <View style={styles.defaultHeaderText}>
              <Text style={styles.defaultTitle}>Default provider</Text>
              <Text style={styles.defaultValue}>{defaultProviderValue}</Text>
              {defaultProviderHelp ? (
                <Text style={styles.defaultHelp}>{defaultProviderHelp}</Text>
              ) : null}
            </View>
          </View>
          <View style={styles.defaultChevron}>
            {defaultPickerOpen ? (
              <ChevronUpIcon color={colors.textSecondary} size={18} />
            ) : (
              <ChevronRightIcon color={colors.textSecondary} size={18} />
            )}
          </View>
        </Pressable>

        {defaultPickerOpen ? (
          <View style={styles.defaultPickerInset}>
            <View style={styles.defaultPickerList}>
              {PROVIDERS.map((provider, index) => {
                const providerConfigured = savedSettings
                  ? isProfileConfigured(provider, savedSettings.profiles[provider])
                  : false;
                const isCurrentDefault = hasDefaultProvider && provider === defaultProvider;
                const disabled = !providerConfigured && !isCurrentDefault;

                return (
                  <Pressable
                    key={provider}
                    onPress={() => void handleChooseDefaultProvider(provider)}
                    disabled={disabled}
                    accessibilityRole="radio"
                    accessibilityLabel={`Set ${getKairoProviderLabel(provider)} as the default provider`}
                    accessibilityState={{ selected: isCurrentDefault, disabled }}
                    style={({ pressed }) => [
                      styles.defaultOption,
                      index > 0 && styles.defaultOptionBorder,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.defaultOptionIdentity}>
                      <ProviderIcon provider={provider} />
                      <View style={styles.defaultOptionCopy}>
                        <Text
                          style={[
                            styles.defaultOptionTitle,
                            disabled && styles.defaultOptionTitleDisabled,
                          ]}
                        >
                          {getKairoProviderLabel(provider)}
                        </Text>
                        <Text
                          style={[
                            styles.defaultOptionMeta,
                            disabled && styles.defaultOptionMetaDisabled,
                          ]}
                        >
                          {isCurrentDefault
                            ? providerConfigured
                              ? "Current default"
                              : "Current default, needs setup."
                            : providerConfigured
                              ? "Ready to use"
                              : "Set up this provider first."}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.defaultOptionRadioWrap}>
                      <View
                        style={[
                          styles.defaultOptionRadio,
                          isCurrentDefault && styles.defaultOptionRadioActive,
                          disabled && styles.defaultOptionRadioDisabled,
                        ]}
                      >
                        {isCurrentDefault ? <View style={styles.defaultOptionRadioDot} /> : null}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.sectionDivider} />

        <View style={styles.providersSection}>
          <Text style={styles.providersTitle}>Providers</Text>
          <Text style={styles.providersHelp}>Manage your providers and credentials</Text>
        </View>

        {PROVIDERS.map((provider, index) => {
          const isSelected = provider === activeProvider;
          const providerConfigured = savedSettings
            ? isProfileConfigured(provider, savedSettings.profiles[provider])
            : false;

          return (
            <Animated.View
              key={provider}
              layout={
                reducedMotion
                  ? undefined
                  : LinearTransition.duration(motion.duration.base).easing(PROVIDER_REVEAL_EASING)
              }
            >
              <Pressable
                onPress={() => handleSelectProvider(provider)}
                style={({ pressed }) => [
                  styles.providerRow,
                  isSelected && styles.providerRowSelected,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${getKairoProviderLabel(provider)} provider profile`}
              >
                <View style={styles.providerRowIdentity}>
                  <ProviderIcon provider={provider} />
                  <View style={styles.providerRowCopy}>
                    <Text style={styles.providerRowTitle}>{getKairoProviderLabel(provider)}</Text>
                  </View>
                </View>
                <View style={styles.providerRowMeta}>
                  <View
                    style={[
                      styles.providerBadge,
                      providerConfigured ? styles.providerBadgeConfigured : styles.providerBadgeIdle,
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
                      {providerConfigured ? "Configured" : "Not configured"}
                    </Text>
                  </View>
                  <ProviderChevron expanded={isSelected} reducedMotion={reducedMotion} />
                </View>
              </Pressable>

              {isSelected ? (
                <Animated.View
                  entering={
                    reducedMotion
                      ? undefined
                      : FadeInDown.duration(motion.duration.base).easing(PROVIDER_REVEAL_EASING)
                  }
                  exiting={
                    reducedMotion
                      ? undefined
                      : FadeOut.duration(motion.duration.instant).easing(PROVIDER_EXIT_EASING)
                  }
                  style={styles.editorPanel}
                >
                  <View style={styles.editorHeader}>
                    <Text style={styles.editorLabel}>
                      {getKairoProviderLabel(activeProvider)} credentials
                    </Text>
                  </View>

                  <Text style={styles.fieldLabel}>API key</Text>
                  <View style={styles.apiKeyField}>
                    <View
                      style={[
                        styles.apiKeyInputShell,
                        fieldErrors.apiKey && styles.inputError,
                      ]}
                    >
                      <KairoKeyAsset width={24} height={18} color={colors.textDim} />
                      <TextInput
                        value={activeProfile.apiKey}
                        onChangeText={(v) => updateActiveProfile({ apiKey: v }, "apiKey")}
                        placeholder="Paste API key"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry={!apiKeyVisible}
                        editable={loaded}
                        onFocus={() => onFieldFocus?.("apiKey")}
                        style={styles.apiKeyInput}
                        accessibilityHint={fieldErrors.apiKey}
                      />
                    </View>
                    <Pressable
                      onPress={() => setApiKeyVisible((visible) => !visible)}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={apiKeyVisible ? "Hide API key" : "Show API key"}
                      style={({ pressed }) => [styles.eyeButton, pressed && styles.pressed]}
                    >
                      <ApiKeyVisibilityIcon visible={apiKeyVisible} />
                    </Pressable>
                  </View>
                  {fieldErrors.apiKey ? (
                    <Text style={styles.fieldError}>{fieldErrors.apiKey}</Text>
                  ) : null}

                  <Pressable
                    onPress={() => setShowAdvanced((current) => !current)}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={
                      showAdvanced ? "Hide advanced Kairo settings" : "Show advanced Kairo settings"
                    }
                    style={({ pressed }) => [styles.advancedRow, pressed && styles.pressed]}
                  >
                    <View style={styles.advancedLabelRow}>
                      <AdjustmentsIcon color={colors.textDim} size={17} strokeWidth={1.8} />
                      <Text style={styles.advancedRowLabel}>Advanced</Text>
                    </View>
                    <ChevronRightIcon color={colors.textSecondary} size={18} />
                  </Pressable>

                  {showAdvanced ? (
                    <Animated.View
                      entering={reducedMotion ? undefined : FadeIn.duration(180)}
                      exiting={reducedMotion ? undefined : FadeOut.duration(120)}
                      style={styles.advancedWrap}
                    >
                      <Text style={styles.advancedLabel}>Endpoint URL</Text>
                      <TextInput
                        value={activeProfile.baseUrl}
                        onChangeText={(v) => updateActiveProfile({ baseUrl: v }, "baseUrl")}
                        placeholder={placeholders.baseUrl}
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={loaded}
                        onFocus={() => onFieldFocus?.("baseUrl")}
                        style={[styles.input, fieldErrors.baseUrl && styles.inputError]}
                        accessibilityHint={fieldErrors.baseUrl}
                      />
                      {fieldErrors.baseUrl ? (
                        <Text style={styles.fieldError}>{fieldErrors.baseUrl}</Text>
                      ) : null}
                      <Text style={styles.advancedLabel}>Model</Text>
                      <TextInput
                        value={activeProfile.model}
                        onChangeText={(v) => updateActiveProfile({ model: v }, "model")}
                        placeholder={placeholders.model}
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={loaded}
                        onFocus={() => onFieldFocus?.("model")}
                        style={[styles.input, fieldErrors.model && styles.inputError]}
                        accessibilityHint={fieldErrors.model}
                      />
                      {fieldErrors.model ? (
                        <Text style={styles.fieldError}>{fieldErrors.model}</Text>
                      ) : null}
                    </Animated.View>
                  ) : null}

                  <View style={styles.actions}>
                    <Pressable
                      onPress={() => void handleClear()}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel="Clear Kairo configuration"
                      disabled={saveState === "saving" || !activeProviderConfigured}
                      style={({ pressed }) => [
                        styles.clearButton,
                        pressed && styles.pressed,
                        (saveState === "saving" || !activeProviderConfigured) && styles.disabledAction,
                      ]}
                    >
                      <Text style={styles.clearButtonText}>
                        {saveState === "cleared" ? "Cleared" : "Clear"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void handleTestConnection()}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel="Test provider connection"
                      disabled={testState === "testing" || saveState === "saving"}
                      style={({ pressed }) => [
                        styles.testButton,
                        testState === "passed" && styles.testButtonPassed,
                        pressed && styles.pressed,
                        (testState === "testing" || saveState === "saving") &&
                          styles.disabledAction,
                      ]}
                    >
                      <Text
                        style={[
                          styles.testButtonText,
                          testState === "passed" && styles.testButtonTextPassed,
                        ]}
                      >
                        {testState === "testing"
                          ? "Testing…"
                          : testState === "passed"
                            ? "Connected"
                            : "Test"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void handleSave()}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel="Save Kairo configuration"
                      disabled={!loaded || saveState === "saving" || !settings}
                      style={({ pressed }) => [
                        styles.saveButton,
                        saveState === "saved" && styles.saveButtonSaved,
                        pressed && styles.pressed,
                        (!loaded || saveState === "saving" || !settings) && styles.disabledAction,
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
                  </View>
                </Animated.View>
              ) : null}

              {index < PROVIDERS.length - 1 ? <View style={styles.providerListDivider} /> : null}
            </Animated.View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
  errorText: {
    color: colors.error,
    ...typography.micro,
  },
  layout: {
    gap: spacing.lg,
  },
  pressed: {
    opacity: 0.84,
  },
  defaultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
  },
  defaultHeaderCopy: {
    flex: 1,
  },
  defaultHeaderText: {
    gap: 2,
  },
  defaultTitle: {
    color: colors.textPrimary,
    ...typography.title,
  },
  defaultValue: {
    color: colors.textSecondary,
    ...typography.bodyMd,
    fontFamily: "Geist_500Medium",
  },
  defaultHelp: {
    maxWidth: 260,
    color: colors.textMuted,
    ...typography.bodyMd,
  },
  defaultChevron: {
    justifyContent: "center",
  },
  defaultPickerInset: {
    paddingTop: spacing.xs,
  },
  defaultPickerList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSurface,
    overflow: "hidden",
  },
  defaultOption: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  defaultOptionBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  defaultOptionCopy: {
    flex: 1,
    gap: 2,
  },
  defaultOptionIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  defaultOptionTitle: {
    color: colors.textPrimary,
    ...typography.title,
  },
  defaultOptionTitleDisabled: {
    color: colors.textSecondary,
  },
  defaultOptionMeta: {
    color: colors.textMuted,
    ...typography.bodyMd,
  },
  defaultOptionMetaDisabled: {
    color: colors.textDim,
  },
  defaultOptionRadioWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  defaultOptionRadio: {
    width: 22,
    height: 22,
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgFloating,
    alignItems: "center",
    justifyContent: "center",
  },
  defaultOptionRadioActive: {
    borderColor: colors.textPrimary,
    backgroundColor: colors.textPrimary,
  },
  defaultOptionRadioDisabled: {
    backgroundColor: colors.bgSurface,
    borderColor: colors.borderSubtle,
  },
  defaultOptionRadioDot: {
    width: 7,
    height: 7,
    borderRadius: radii.full,
    backgroundColor: colors.bgFloating,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: colors.bgInput,
  },
  providersSection: {
    gap: spacing.sm,
  },
  providersTitle: {
    color: colors.textPrimary,
    ...typography.title,
  },
  providersHelp: {
    color: colors.textMuted,
    ...typography.bodyMd,
  },
  providerRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
  },
  providerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  providerIconWrapLarge: {
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  providerRowSelected: {
    backgroundColor: colors.bgSurface,
    borderRadius: radii.lg,
  },
  providerRowIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  providerRowCopy: {
    flex: 1,
    gap: 2,
  },
  providerRowTitle: {
    color: colors.textPrimary,
    ...typography.title,
  },
  providerRowMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
    flexShrink: 1,
  },
  providerBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 7,
  },
  providerBadgeConfigured: {
    backgroundColor: colors.successMuted,
  },
  providerBadgeIdle: {
    backgroundColor: "rgba(91,80,72,0.05)",
  },
  providerBadgeText: {
    ...typography.bodyMd,
    fontFamily: "Geist_500Medium",
  },
  providerBadgeTextConfigured: {
    color: colors.success,
  },
  providerBadgeTextIdle: {
    color: colors.textSecondary,
  },
  providerListDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.bgInput,
  },
  editorPanel: {
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderRadius: radii.lg,
  },
  editorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  editorLabel: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.title,
  },
  fieldLabel: {
    color: colors.textMuted,
    ...typography.micro,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  apiKeyField: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  apiKeyInputShell: {
    minHeight: 48,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSurface,
    paddingHorizontal: spacing.md,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSurface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    ...typography.bodyMd,
  },
  inputError: {
    borderColor: colors.error,
  },
  fieldError: {
    color: colors.error,
    ...typography.bodyMd,
  },
  apiKeyInput: {
    flex: 1,
    minHeight: 48,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    ...typography.bodyMd,
  },
  eyeButton: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  advancedRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSurface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  advancedLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  advancedRowLabel: {
    color: colors.textSecondary,
    ...typography.bodyMd,
  },
  advancedWrap: {
    gap: spacing.sm,
  },
  advancedLabel: {
    color: colors.textSecondary,
    ...typography.micro,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.md,
    paddingTop: spacing.xs,
  },
  clearButton: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  clearButtonText: {
    color: colors.textSecondary,
    ...typography.bodyMd,
    fontFamily: "Geist_500Medium",
  },
  testButton: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  testButtonPassed: {
    borderColor: "rgba(34,107,75,0.24)",
    backgroundColor: colors.successMuted,
  },
  testButtonText: {
    color: colors.textPrimary,
    ...typography.bodyMd,
    fontFamily: "Geist_500Medium",
  },
  testButtonTextPassed: {
    color: colors.success,
  },
  saveButton: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.bgInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonSaved: {
    backgroundColor: colors.successMuted,
    borderColor: "rgba(34,107,75,0.24)",
  },
  saveButtonText: {
    color: colors.textPrimary,
    ...typography.bodyMd,
    fontFamily: "Geist_600SemiBold",
  },
  saveButtonTextSaved: {
    color: colors.success,
  },
  disabledAction: {
    opacity: 0.5,
  },
});
