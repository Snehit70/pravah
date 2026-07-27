from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count == 0:
        return
    if count != 1:
        raise SystemExit(f"Expected one match in {path}, found {count}")
    file.write_text(text.replace(old, new))


replace_once(
    "apps/mobile/src/components/CompletedTaskSheet.tsx",
    '''                accessibilityRole="button"
                accessibilityLabel="View task details"
                style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}''',
    '''                accessibilityRole="button"
                accessibilityLabel={showDetails ? "Hide task details" : "View task details"}
                accessibilityState={{ expanded: showDetails }}
                style={({ pressed }) => [styles.menuItem, pressed && styles.pressed]}''',
)

edit = "apps/mobile/src/components/EditTaskSheet.tsx"
replace_once(
    edit,
    '''type UndoPayload = {
  message: string;
  run: () => void;
};''',
    '''type UndoPayload = {
  message: string;
};''',
)
replace_once(
    edit,
    '''        onSaveComplete?.({ message: "Changes saved", run: () => {} }, sourceTask, previousState);''',
    '''        onSaveComplete?.({ message: "Changes saved" }, sourceTask, previousState);''',
)
replace_once(
    edit,
    '''                onSubmitEditing={() => setTitleEditing(false)}
                style={styles.titleInput}''',
    '''                onSubmitEditing={() => setTitleEditing(false)}
                onBlur={() => setTitleEditing(false)}
                style={styles.titleInput}''',
)
