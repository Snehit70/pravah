# Web Version Upgrade (May 2026)

This document summarizes the current web improvements on branch `feat/web-version-improvements` and how they relate to mobile work.

## Scope Added On Web

1. Insights parity page
- Added `Insights` page with `Stats` and `Completed` tabs.
- Includes backlog health metrics and completion visibility in web shell.

2. Kairo provider runtime parity
- Added provider-profile based Kairo config (`openai`, `anthropic`, `gemini`) on web.
- Added Gemini request/response runtime support in web.
- Added migration path from legacy single-provider config.

3. Goals and task-linking parity
- Added server-backed goals/linking read model on web.
- Shows linked-goal badges in Timeline and Inbox.
- Added TaskPopup goal selection and link-save flow.
- Added resilient partial-failure handling when task save succeeds but goal-link save fails.

4. Server-backed goals CRUD in web
- Long-term Goals page now supports backend create/delete.
- Goal progress bars use goal-link and task status data.

## Feature Flag

Web goals-linking server mode is controlled by:
- Env: `VITE_FF_WEB_GOALS_LINKING=1`
- Local override key: `localStorage['pravah:ff:web-goals-linking']`

When enabled:
- Goals/links source of truth is Convex.
- Long-term Goals page runs in server-backed mode.

## Branch and Overlap Note

- Web branch: `feat/web-version-improvements`
- Mobile branch: `feat/mobile-ui-round-2`

These are separate branch lines off `main` with non-overlapping commit sets.
Any thematic overlap (for example provider-profile parity) was implemented per-platform in platform-specific codepaths.

## Validation Summary

Targeted tests were added/updated for:
- `LongTermGoalsPage`
- `TaskPopup`
- `InboxSidebar`
- `AppFlow`
- Accessibility regression coverage for popup interactions

## Recommended Next Step

Before performance work, run a short cross-client correctness pass:
- Edit a goal link on web.
- Verify same link state is reflected on mobile.
- Delete a goal and verify linked-task badge removal in both clients.
