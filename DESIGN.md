---
name: Pravah Mobile
description: A calm, precise, quietly warm personal planning system.
colors:
  canvas: "#f7f1e8"
  surface: "#fbf7ef"
  card: "#fffaf2"
  floating: "#fffdf7"
  ink: "#201914"
  text-secondary: "#5b5048"
  text-muted: "#6f6358"
  text-dim: "#76695e"
  accent: "#6753c7"
  accent-hover: "#5844b8"
  success: "#226b4b"
  warning: "#805712"
  deadline: "#98502d"
  error: "#a43f32"
  priority-one: "#934536"
  priority-two: "#805712"
  priority-three: "#5e6662"
  dark-canvas: "#151118"
  dark-surface: "#1c1720"
  dark-card: "#241d28"
  dark-floating: "#2b2230"
  dark-ink: "#f3eaf5"
  dark-text-secondary: "#cbbdce"
  dark-text-muted: "#a99bab"
typography:
  display:
    fontFamily: "Geist"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "34px"
    letterSpacing: "-0.6px"
  headline:
    fontFamily: "Geist"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "26px"
    letterSpacing: "-0.3px"
  title:
    fontFamily: "Geist"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "22px"
    letterSpacing: "-0.1px"
  body:
    fontFamily: "Geist"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "22px"
  metadata:
    fontFamily: "Geist Mono"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: "14px"
    letterSpacing: "0.6px"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "24px"
  section: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.card}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "48px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "48px"
  task-row:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.lg}"
    padding: "12px 16px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "48px"
---

# Design System: Pravah Mobile

## 1. Overview

**Creative North Star: "The Warm Planning Desk"**

Pravah should feel like opening a clear paper planning system in soft daylight:
quiet enough to think, structured enough to trust, and warm without becoming
decorative. It is a mobile product surface, so familiar controls, stable
anatomy, and fast state recognition matter more than novelty.

The system rejects enterprise density, playful gamification, calendar-clone
chrome, and generic AI styling. Purple is a signature for intelligence and
selection, not the atmosphere of every screen.

At night, Pravah feels like the same planning desk under a shaded lamp: deep
aubergine-charcoal layers reduce glare while warm text, restrained accents, and
stable semantic colors preserve the daytime hierarchy.

**Key Characteristics:**

- Warm, low-chroma neutral layers with dark ink text.
- Comfortable density and thumb-safe controls.
- One obvious primary action in each context.
- Stable Task and Goal anatomy across surfaces.
- Short, state-explaining motion and sparse sensory feedback.

## 2. Colors

The palette uses warm paper neutrals for calm, dark brown ink for readability,
and a restrained indigo accent for selected or intelligent moments.

### Primary

- **Quiet Indigo** (`#6753c7`): Primary actions, selected state, focus, and
  Kairo-specific emphasis. Keep it below roughly 10% of an everyday screen.

### Neutral

- **Planning Canvas** (`#f7f1e8`): App background.
- **Raised Paper** (`#fbf7ef`): Secondary surface and input layer.
- **Task Paper** (`#fffaf2`): Task rows and cards.
- **Fresh Sheet** (`#fffdf7`): Floating and modal surfaces.
- **Warm Ink** (`#201914`): Primary text and icons.
- **Stone Text** (`#5b5048`): Supporting copy.
- **Muted Umber** (`#6f6358`): Metadata that must remain readable.

### Named Rules

**The Quiet Accent Rule.** Indigo communicates action, selection, focus, or
Kairo. It is never background decoration.

**The Semantic State Rule.** Success, warning, deadline, error, and priority
colors keep fixed meanings. Pair every color state with text, shape, or icon.

### Dark appearance

- **Night Canvas** (`#151118`): App background.
- **Night Surface** (`#1c1720`): Secondary surface and input layer.
- **Night Card** (`#241d28`): Task rows and grouped settings.
- **Night Floating** (`#2b2230`): Sheets and raised controls.
- **Warm Light Ink** (`#f3eaf5`): Primary text and icons.
- **Heather Text** (`#cbbdce`): Supporting copy.
- **Muted Heather** (`#a99bab`): Metadata.

Dark appearance keeps the restrained color strategy. The selected app accent
changes interactive emphasis only; neutral surfaces and semantic state colors
remain stable. System appearance follows the device live, while manual Warm
light and Dark choices remain local to the device.

## 3. Typography

**Display Font:** Geist
**Body Font:** Geist
**Label/Mono Font:** Geist Mono

**Character:** Geist keeps the product crisp and contemporary without calling
attention to itself. Geist Mono is a scanning aid for dates, counts, and compact
metadata, not a decorative texture.

### Hierarchy

- **Display** (600, 28px, 34px): Destination titles only.
- **Headline** (600, 20px, 26px): Sheet, full-screen, and empty-state titles.
- **Title** (600, 16px, 22px): Task titles, Goal titles, and primary controls.
- **Body** (400, 15px, 22px): Main explanatory copy, capped near 70 characters.
- **Metadata** (500, 11px, 14px): Short dates, counts, and priority labels.

### Named Rules

**The Action First Rule.** Task and Goal titles remain more prominent than
their metadata. Uppercase mono is reserved for genuinely scannable short data.

## 4. Elevation

Pravah uses tonal layering first and ambient shadows only when a surface must
separate from its context. List rows are defined by surface and subtle borders;
sheets and floating controls earn stronger elevation.

### Shadow Vocabulary

- **Low:** 1px vertical offset, 2px blur, 8% warm ink; small raised controls.
- **Medium:** 4px vertical offset, 12px blur, 12% warm ink; floating panels.
- **High:** 8px vertical offset, 28px blur, 16% warm ink; sheets and dialogs.
- **Accent glow:** 8px vertical offset, 20px blur, 24% indigo; rare primary FAB.

### Named Rules

**The Earned Elevation Rule.** A shadow indicates real layering or focus, never
decoration.

## 5. Components

### Buttons

- **Shape:** Compact rounded rectangle (6px); circular only for icon actions or
  the Capture FAB.
- **Primary:** Quiet Indigo fill, warm inverse text, 48px minimum height.
- **Pressed / Focus:** Darker indigo on press; visible indigo focus outline.
- **Secondary:** Neutral surface or outline; destructive actions remain quiet
  until confirmation.

### Chips

- **Style:** Subtle neutral or semantic tint, compact text, and 44px interactive
  target even when the visible chip is smaller.
- **State:** Selected chips use accent tint plus explicit selected semantics.

### Cards / Containers

- **Corner Style:** 10px for Task and Goal rows; 16px for major floating panels.
- **Background:** Task Paper over Planning Canvas.
- **Shadow Strategy:** Flat list rows; ambient elevation only for overlays.
- **Border:** Thin warm neutral divider where adjacent layers need definition.
- **Internal Padding:** 12px vertical and 16px horizontal by default.

### Inputs / Fields

- **Style:** Raised Paper background, 6px radius, 48px minimum height.
- **Focus:** Indigo border or ring with no layout shift.
- **Error / Disabled:** Error is labeled and tinted; disabled state reduces
  emphasis while preserving legibility.

### Navigation

Four labeled destinations, Inbox, Timeline, Goals, and Progress, surround a
fixed center Capture action. The active destination uses accent plus explicit
selected state. Kairo and Settings remain global tools in the stable header.

### Task Row

Task rows keep the same title and metadata anatomy everywhere. The visible
primary action changes by context: Schedule in Inbox, Complete in Timeline, and
Reopen or inspect in Progress. Swipe is an optional accelerator only.

### Bottom Sheets

Sheets are temporary, context-preserving tools with a title, clear close path,
one primary action, and no nested navigation. Sustained multi-section work uses
a full-screen surface.

## 6. Do's and Don'ts

### Do:

- **Do** use warm neutral layers and reserve `#6753c7` for meaningful emphasis.
- **Do** keep interactive targets at least 44 by 44 points.
- **Do** expose role, label, value, selected, checked, and expanded state.
- **Do** use one visually dominant action per local context.
- **Do** keep all essential actions available without gestures.
- **Do** use short 120-280ms ease-out motion to explain state.

### Don't:

- **Don't** make this a dense enterprise project-management dashboard.
- **Don't** turn completion into playful gamification or engagement nudges.
- **Don't** use purple gradients, neon glow, decorative glass, or generic
  AI-futuristic styling.
- **Don't** turn Timeline into a calendar clone with heavy date navigation.
- **Don't** hide essential actions behind swipe gestures.
- **Don't** use cards for every grouping or nest cards inside cards.
- **Don't** use bounce, elastic motion, or animation that delays completion.
