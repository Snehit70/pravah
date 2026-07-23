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

### Dark appearance
Pravah's low-light visual identity: deep aubergine-charcoal surfaces, warm
light text, and restrained purple, teal, amber, and red color used to preserve
hierarchy and communicate meaning. It is intentionally colored rather than
pure black or neutral gray.

### System appearance
An appearance preference that follows the device's current light or dark
setting. It is the default for both new installations and installations
migrated from the legacy light-only release.

### Accent
A user-selected color applied to interactive emphasis such as active
navigation, selected controls, focus states, and primary actions. An accent
does not recolor appearance surfaces or override semantic task-state colors.

### Appearance
The complete visual treatment of the mobile application, including every
screen, sheet, modal, loading state, error state, Kairo surface, and adjacent
system chrome. An appearance change is incomplete if any of these surfaces
remain styled for another appearance.
