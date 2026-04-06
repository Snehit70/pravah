# Pravah - Timeline Task Manager

## Project Overview

- **Name**: Pravah
- **Type**: Web application (React + Convex)
- **Core functionality**: Horizontal timeline-based task manager with drag-drop, AI-agent accessible via API
- **Target users**: Single user (Snehit)

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS + shadcn/ui components
- **Animations**: Framer Motion
- **Drag & Drop**: @dnd-kit/core
- **Backend**: Convex (real-time database + HTTP actions)
- **Package Manager**: Bun

## Core Features (Phase 1)

1. **Horizontal Timeline**
   - Left-to-right scrolling timeline
   - Each column represents a day
   - Zoom: see 7-14 days at default, zoom in/out supported later

2. **Task Cards**
   - Squircle/pill shape, dark mode aesthetic
   - Two types: open-ended (above timeline) and deadline-bound (below timeline)
   - Smooth animations on interactions

3. **Drag & Drop**
   - Reorder within a day
   - Move across days
   - Deadline tasks cannot be moved past deadline date

4. **Inbox**
   - Left sidebar for unsorted tasks
   - Tasks from AI agents land here first

5. **Task Popup**
   - Click card → popup modal with full details
   - Edit inline, close to return

6. **API Endpoints**
   - HTTP actions for CRUD via Convex
   - MCP server compatible tools

## Data Schema

```typescript
// tasks table
{
  _id: Id<"tasks">,
  title: string,
  description?: string,
  type: "open" | "deadline",
  scheduledDate?: string,  // "YYYY-MM-DD", null = inbox
  deadline?: string,       // "YYYY-MM-DD" (type=deadline only)
  position: number,        // order within the day
  status: "inbox" | "scheduled" | "completed" | "cancelled",
  source: "manual" | "ai-agent" | "gmail" | "gcal",
  estimatedMinutes?: number,
  tags?: string[],
  createdBy: string,
  createdAt: number,
  updatedAt: number,
}
```

## UI/UX

- Dark mode by default
- Background: #0a0a0a (near black)
- Cards: #1a1a1a with subtle borders
- Accent: minimal, subtle glows
- Font: Inter or similar sans-serif

## Phases

| Phase | Features |
|-------|----------|
| 1 (Core) | Timeline, cards, drag-drop, inbox, popup, Convex backend |
| 2 (API) | HTTP endpoints, MCP server |
| 3 (Integrations) | Google Calendar, Gmail |
| 4 (Polish) | Zoom, animations, focus mode |