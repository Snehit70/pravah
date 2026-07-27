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


edit = "apps/mobile/src/components/EditTaskSheet.tsx"
replace_once(
    edit,
    "  useImperativeHandle,\n  useMemo,",
    "  useImperativeHandle,\n  useEffect,\n  useMemo,",
)
replace_once(
    edit,
    "    const requestCloseRef = useRef(requestClose);\n    requestCloseRef.current = requestClose;",
    "    const requestCloseRef = useRef(requestClose);\n    useEffect(() => {\n      requestCloseRef.current = requestClose;\n    }, [requestClose]);",
)

old_strip = '''  const strip = (rest: AnyProps) => {
    const {
      style: _style,
      accessibilityRole: _role,
      accessibilityState: _state,
      accessibilityViewIsModal: _modal,
      hitSlop: _hitSlop,
      ...safe
    } = rest;
    return safe;
  };'''
new_strip = '''  const strip = (rest: AnyProps) => {
    const safe = { ...rest };
    delete safe.style;
    delete safe.accessibilityRole;
    delete safe.accessibilityState;
    delete safe.accessibilityViewIsModal;
    delete safe.hitSlop;
    return safe;
  };'''
for test in [
    "apps/mobile/src/test/editTaskSheet.test.tsx",
    "apps/mobile/src/test/completedTaskSheet.test.tsx",
]:
    replace_once(test, old_strip, new_strip)

test = "apps/mobile/src/test/editTaskSheet.test.tsx"
replace_once(
    test,
    '''    const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement>(null);
    React.useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));''',
    '''    React.useImperativeHandle(ref, () => ({ focus: () => undefined }));''',
)
replace_once(test, "      ref: inputRef,\n", "")
replace_once(
    test,
    "        onChangeText?.(event.target.value),",
    "        (onChangeText as ((value: string) => void) | undefined)?.(event.target.value),",
)
replace_once(
    test,
    '''        if (event.key === "Enter" && !multiline) onSubmitEditing?.();''',
    '''        if (event.key === "Enter" && !multiline) {
          (onSubmitEditing as (() => void) | undefined)?.();
        }''',
)
