# Pravah — Domain Context

## Glossary

### Backdrop
The visual layer behind a modal/sheet that separates it from the content underneath. Composed of two independent layers in Pravah:

- **Blur** — gaussian blur via `expo-blur` `BlurView`. Creates depth/focus. Tuned by `intensity` (0–100) and `tint` (color cast).
- **Dim** — solid color overlay (historically `rgba(0,0,0,0.72)`). Creates contrast for the sheet to read against.

Design decision: Dim layers are removed in favour of stronger blur. The warm palette (`colors.backdrop = rgba(39,30,22,0.32)`) conflicts with pure black dimming. Sheets now rely on blur intensity alone for separation.

### Sheet
A bottom-sheet modal surfaced via React Native's built-in `<Modal>` with `transparent` + `animationType="slide"`. Used for Capture (AddTaskSheet), Edit, QuickSchedule, Overdue, and Confirm interactions.

### Capture
The primary task/goal creation surface. Renders as a full-height bottom sheet with "New task" / "New goal" tabs. Component: `AddTaskSheet.tsx`.
