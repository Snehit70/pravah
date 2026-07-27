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
old_handle = '''    useImperativeHandle(
      ref,
      () => ({
        open: (task: MobileTask) => {
          const seq = openSeqRef.current + 1;
          openSeqRef.current = seq;
          void goalLinksStore.hydrate().then(() => {
            if (openSeqRef.current !== seq) return;
            const currentGoalId = goalLinksStore.goalFor(String(task._id)) ?? null;
            const nextState: TaskState = isTaskCompleted(task)
              ? "completed"
              : isTaskOnTimeline(task)
                ? "timeline"
                : "inbox";
            const draft: DraftState = {
              title: task.title,
              description: task.description ?? "",
              deadline: task.deadline ?? "",
              time: task.time ?? "",
              priority: task.priority,
              goalId: currentGoalId,
            };
            currentTaskRef.current = task;
            setTaskId(task._id);
            setTaskState(nextState);
            setTitle(draft.title);
            setDescription(draft.description);
            setDeadline(draft.deadline);
            setTime(draft.time);
            setPriority(draft.priority);
            setDraftGoalId(draft.goalId);
            setInitialDraft(draft);
            setSaving(false);
            setError(null);
            setMode("inspector");
            setTitleEditing(false);
            setNotesEditing(false);
            setGoalQuery("");
            setOverflowOpen(false);
            setVisible(true);
            onSheetChange?.(true);
            haptic.light();
          });
        },
        close: () => {
          openSeqRef.current += 1;
          if (mode !== "inspector") {
            setMode("inspector");
            return;
          }
          void requestCloseRef.current();
        },
      }),
      [mode, onSheetChange],
    );

'''
replace_once(edit, old_handle, "")

old_ref = '''    const requestCloseRef = useRef(requestClose);
    requestCloseRef.current = requestClose;
'''
new_handle = '''    useImperativeHandle(
      ref,
      () => ({
        open: (task: MobileTask) => {
          const seq = openSeqRef.current + 1;
          openSeqRef.current = seq;
          void goalLinksStore.hydrate().then(() => {
            if (openSeqRef.current !== seq) return;
            const currentGoalId = goalLinksStore.goalFor(String(task._id)) ?? null;
            const nextState: TaskState = isTaskCompleted(task)
              ? "completed"
              : isTaskOnTimeline(task)
                ? "timeline"
                : "inbox";
            const draft: DraftState = {
              title: task.title,
              description: task.description ?? "",
              deadline: task.deadline ?? "",
              time: task.time ?? "",
              priority: task.priority,
              goalId: currentGoalId,
            };
            currentTaskRef.current = task;
            setTaskId(task._id);
            setTaskState(nextState);
            setTitle(draft.title);
            setDescription(draft.description);
            setDeadline(draft.deadline);
            setTime(draft.time);
            setPriority(draft.priority);
            setDraftGoalId(draft.goalId);
            setInitialDraft(draft);
            setSaving(false);
            setError(null);
            setMode("inspector");
            setTitleEditing(false);
            setNotesEditing(false);
            setGoalQuery("");
            setOverflowOpen(false);
            setVisible(true);
            onSheetChange?.(true);
            haptic.light();
          });
        },
        close: () => {
          openSeqRef.current += 1;
          if (mode !== "inspector") {
            setMode("inspector");
            return;
          }
          void requestClose();
        },
      }),
      [mode, onSheetChange, requestClose],
    );
'''
replace_once(edit, old_ref, new_handle)

replace_once(
    edit,
    '''    const titleInputRef = useRef<TextInput>(null);
    const notesInputRef = useRef<TextInput>(null);
''',
    "",
)
replace_once(edit, "                ref={titleInputRef}\n", "")
replace_once(edit, "                ref={notesInputRef}\n", "")
replace_once(
    edit,
    '''                onPress={() => {
                  setTitleEditing(true);
                  setTimeout(() => titleInputRef.current?.focus(), 0);
                }}''',
    '''                onPress={() => setTitleEditing(true)}''',
)
replace_once(
    edit,
    '''                onPress={() => {
                  setNotesEditing(true);
                  setTimeout(() => notesInputRef.current?.focus(), 0);
                }}''',
    '''                onPress={() => setNotesEditing(true)}''',
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
