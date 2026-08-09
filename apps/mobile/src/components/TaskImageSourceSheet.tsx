import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SmartphoneIcon, StackPlusIcon } from "./UiIcons";
import type { TaskImageSourceKind } from "../lib/taskImageCoordinator";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";

type TaskImageSourceSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelectSource: (kind: TaskImageSourceKind) => void | Promise<void>;
};

export function TaskImageSourceSheet({ visible, onClose, onSelectSource }: TaskImageSourceSheetProps) {
  const insets = useSafeAreaInsets();
  const choose = (kind: "photos" | "camera") => {
    onClose();
    void onSelectSource(kind);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close image source picker" onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]} accessibilityViewIsModal>
          <View style={styles.handle} />
          <Text style={styles.title}>Add an image</Text>
          <Text style={styles.body}>Choose where the visual reference should come from.</Text>
          <View style={styles.options}>
            <Pressable accessibilityRole="button" accessibilityLabel="Add Task image from Photos" onPress={() => choose("photos")} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
              <View style={styles.iconFrame}><StackPlusIcon color={colors.accent} size={20} /></View>
              <View style={styles.optionCopy}><Text style={styles.optionTitle}>Photos</Text><Text style={styles.optionBody}>Choose an image from your library</Text></View>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Take Task image with Camera" onPress={() => choose("camera")} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
              <View style={styles.iconFrame}><SmartphoneIcon color={colors.accent} size={20} /></View>
              <View style={styles.optionCopy}><Text style={styles.optionTitle}>Camera</Text><Text style={styles.optionBody}>Take a new photo</Text></View>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = createThemedStyles({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.backdrop },
  sheet: { paddingTop: spacing.sm, paddingHorizontal: spacing.lg, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, backgroundColor: colors.bgFloating },
  handle: { alignSelf: "center", width: 40, height: 4, marginBottom: spacing.lg, borderRadius: radii.full, backgroundColor: colors.border },
  title: { ...typography.headline, color: colors.textPrimary },
  body: { ...typography.bodyMd, marginTop: spacing.xs, color: colors.textSecondary },
  options: { gap: spacing.sm, marginTop: spacing.lg },
  option: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSubtle, backgroundColor: colors.bgSurface },
  iconFrame: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radii.md, backgroundColor: colors.accentSoft },
  optionCopy: { flex: 1, gap: 2 },
  optionTitle: { ...typography.title, color: colors.textPrimary },
  optionBody: { ...typography.bodySm, color: colors.textSecondary },
  pressed: { opacity: 0.72 },
});
