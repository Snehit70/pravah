## Problem Statement

The mobile Timeline has exactly one layout: a vertical list of date sections. It is efficient for scanning many days at once, but it flattens the day boundary — "what does my Friday look like" requires reading section headers while scrolling, and a day never feels like a unit you can hold. There is also no way to trade information density for spatial clarity: the Appearance → Density setting only adjusts card padding, not the shape of the timeline itself.

Users want a second way to read the same data: one day at a time, side by side, with a first-class left↔right scrolling experience — while keeping the current vertical list for fast triage.

## Solution

Add a per-user Timeline layout mode with two values:

- **Compact** — the existing vertical date-sectioned list, unchanged.
- **Comfortable** — a horizontal **peek carousel** of day cards: each day with tasks becomes one card ~88% of screen width, the next day peeking at the trailing edge, with snap-to-card paging.

The mode is flipped by an **icon-only toggle in the Timeline header** (next to the Kairo chip). Tapping it swaps the layout in place, the icon changes to represent the *other* mode's glyph target (list glyph ↔ day-cards glyph), and the choice persists as a new `timelineLayout: "list" | "carousel"` user preference. Appearance → Density is untouched and continues to control card padding only, in both modes.

This is a mobile-only, OTA-safe change: pure JS/TS, existing dependencies (Reanimated, RN `FlatList` paging, react-native-svg for the toggle icon), no native modules.

## Locked design decisions

Decisions from the design interview (2026-07-05), in the order they were made:

1. **Layout model: peek carousel.** Day cards ~88% width, next card peeking at the edge, snap paging. Not a full-page pager (hides that more days exist) and not a multi-column board (cards too cramped).
2. **Toggle: icon-based, in the Timeline header.** Single tap flips mode; icon swaps with the mode; persisted so the Timeline reopens in the same mode. No settings-page entry; no coupling to Appearance → Density.
3. **Day axis: task days only, Overdue as the leftmost card.** Only dates that have tasks become cards — no empty-day filler cards. Overdue tasks form a single muted card at the far left with the same "Review" door into the triage sheet; the carousel never lands on it automatically. (In compact mode Overdue keeps its existing collapsed bar.)
4. **Card content: slim rows, inner vertical scroll.** Each day card has a header (relative label + weekday · date + task count) and slim task rows — checkbox, title, project chip, priority badge; the detail/notes line is dropped to fit more rows. Rows scroll vertically inside the fixed-height card. Tapping a row opens the Edit sheet, same as compact mode.
5. **Motion: crossfade toggle + spring snap.** Mode switch: outgoing layout fades out (~180ms) while the incoming one fades in (~220ms) with a subtle 0.98→1 scale, ~60ms overlap. Carousel: decelerating spring snap per card, gentle resistance past the last card. Reduced motion (system or in-app setting): all of this is skipped — instant swap, plain snap.
6. **Gestures: the carousel owns horizontal.** In comfortable mode, per-row swipe actions are disabled regardless of the Interaction → Swipe actions setting; horizontal drags always page between days. Completion is the checkbox; tap opens Edit; long-press opens the row actions menu. Compact mode keeps swipe actions exactly as today.
7. **Orientation: land on Today, jump chip, dot strip.** Opening the tab centers on Today (or the first upcoming day if today has no tasks). Once the user swipes off Today, a small "‹ Today" chip fades in under the header; tapping it springs back. A subtle dot strip under the cards indicates position. No cross-session position memory.
8. **Emptied day: stay with "Day clear" state.** Completing the last task on the currently viewed card does not remove it — the card shows a quiet all-done state (check mark + "Day clear") so the view doesn't jump and unchecking is still possible. The card leaves the axis only after the user swipes away or leaves the tab.
9. **Refresh: pull-to-refresh inside the day card.** Each card's inner scroll hosts the same `RefreshControl` (accent spinner) and triggers the same workspace-wide refresh as compact mode. No new refresh UI.

## User Stories

1. As a Pravah user, I want to flip the Timeline between a vertical list and side-by-side day cards with one tap in the header, so that I can pick the reading mode that fits the moment.
2. As a Pravah user, I want the Timeline to remember which mode I chose, so that it opens the same way next time.
3. As a Pravah user, I want each day with tasks to be one swipeable card with the next day peeking in, so that scanning forward feels like turning through days.
4. As a Pravah user, I want to land on Today when I open the carousel, so that the present is always the starting point.
5. As a Pravah user, I want my overdue backlog one swipe to the left of Today as a muted card, so that it is reachable but not shouting.
6. As a Pravah user, I want a "Today" chip to appear after I swipe ahead, so that I can jump home without swiping back through every day.
7. As a Pravah user, I want long days to scroll inside their card, so that a heavy day never breaks the carousel rhythm.
8. As a Pravah user, I want horizontal drags to always change the day in carousel mode, so that I never trigger a task swipe action by accident.
9. As a Pravah user, I want the day card to show a calm "Day clear" state when I finish its last task, so that the view doesn't yank away and I can undo a mistap.
10. As a Pravah user, I want pull-to-refresh inside a day card, so that the sync gesture I already know keeps working.
11. As a Pravah user with reduced motion enabled, I want mode switches and paging to be instant, so that the feature respects my motion preference.

## Behavior details and edge cases

- **Preference:** `timelineLayout: "list" | "carousel"` added to `userPreferences` (default `"list"`), read/written like `density`. The header toggle is the only writer.
- **Landing rules:** Today card if today has tasks; else the first future day card; else (no upcoming at all) the empty state. The Overdue card is never the landing target even when it is the only card — in that case land on it as the sole card, since the alternative is an empty view beside a hidden card.
- **Empty timeline:** identical empty state to compact mode (calendar glyph, "Today is clear."); the toggle stays visible so the user isn't trapped in a mode.
- **"Later" valve:** the compact-mode "Later · N" section cap does not apply in carousel mode — each day is its own page, so all task days are cards. Card *rows* still virtualize via the inner list.
- **Day rollover:** if the date changes while the tab is open (midnight, or returning from background), the axis is rebuilt against the new `today`; yesterday's unfinished tasks flow into the Overdue card per existing bucketing.
- **Dot strip:** caps at a reasonable count (e.g. 7 dots with the active one emphasized; beyond that the strip stays 7 wide and the active dot position is proportional). Purely indicative, not tappable.
- **Sync/edits from elsewhere:** Convex live queries may add/remove days while viewing. New days insert into the axis without moving the current card; if the *current* card's date loses all tasks through remote changes, it follows the same "Day clear, leaves on swipe-away" rule as local completion.
- **Nested scrolling:** vertical pan inside the card goes to the inner list; horizontal pan goes to the outer carousel (standard RN axis-locked FlatList nesting — no custom gesture arbitration needed since row swipes are disabled).
- **Accessibility:** the toggle announces "Switch to day cards" / "Switch to list". Each day card is a labelled region ("Today, 4 tasks"). The Today chip and Overdue Review door are buttons with explicit labels. Screen-reader users can page via the cards' accessibility scroll actions.
- **Tests:** rn-web component tests for the mode toggle (icon + persisted preference), axis construction (overdue card first, task days only, landing index), the Day-clear state, and disabled row swipes in carousel mode. Maestro flow: toggle → swipe to next day → back via Today chip.

## Out of scope

- Drag-to-reorder across or within day cards (RNDFL@4 / Reanimated@4 incompatibility, ADR-0004).
- Any change to compact mode's layout, the overdue triage sheet, or web Timeline.
- Cross-session carousel position memory.
- Empty-day placeholder cards or a continuous calendar axis.
