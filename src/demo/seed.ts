// Deterministic demo seed. Generates a believable workspace relative to the
// real current date so every surface (timeline, insights heatmap, streaks,
// goal progress, overdue triage) has something honest to show.

export interface DemoTask {
  _id: string;
  _creationTime: number;
  title: string;
  description?: string;
  deadline?: string;
  time?: string;
  scheduledAt: number;
  completedAt?: number;
  cancelledAt?: number;
  position: number;
  source?: "manual" | "ai-agent" | "gmail" | "gcal";
  estimatedMinutes?: number;
  tags?: string[];
  priority?: "p1" | "p2" | "p3";
  createdBy: string;
  ownerTokenIdentifier: string;
  createdAt: number;
  updatedAt: number;
}

export interface DemoGoal {
  clientId: string;
  text: string;
  description?: string;
  deadline?: string;
  priority?: "p1" | "p2" | "p3";
  createdAt: number;
  completedAt?: number;
}

export interface DemoIntegration {
  _id: string;
  _creationTime: number;
  provider: "google_calendar" | "gmail";
  status: "connected" | "disconnected" | "error";
  syncEnabled: boolean;
  accountEmail?: string;
  lastSyncedAt?: number;
  lastError?: string;
  ownerTokenIdentifier: string;
  createdAt: number;
  updatedAt: number;
}

export interface DemoSyncRun {
  _id: string;
  _creationTime: number;
  provider: "google_calendar" | "gmail";
  direction: "import";
  status: "success" | "running" | "failed";
  startedAt: number;
  finishedAt?: number;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorMessage?: string;
}

export interface DemoReviewItem {
  _id: string;
  _creationTime: number;
  provider: "gmail" | "google_calendar";
  sourceType: "gmail_candidate";
  externalId: string;
  title: string;
  description?: string;
  scheduledDate?: string;
  deadline?: string;
  estimatedMinutes?: number;
  tags?: string[];
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string;
  payloadJson?: string;
  ownerTokenIdentifier: string;
  createdAt: number;
  updatedAt: number;
  reviewedAt?: number;
}

export interface DemoCredential {
  _id: string;
  _creationTime: number;
  ownerTokenIdentifier: string;
  label: string;
  credentialPreview: string;
  scopes: ("tasks:read" | "tasks:write" | "review:read" | "sync:read")[];
  status: "active" | "revoked";
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

export interface DemoUser {
  name: string;
  email: string;
}

export interface DemoData {
  version: 1;
  dayKey: string;
  nextId: number;
  user: DemoUser;
  tasks: DemoTask[];
  goals: DemoGoal[];
  goalLinks: Record<string, string>;
  integrations: DemoIntegration[];
  lastSyncRuns: DemoSyncRun[];
  reviewQueue: DemoReviewItem[];
  credentials: DemoCredential[];
}

const OWNER = "demo:local";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dayString(base: Date, offsetDays: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayKeyString(base: Date): string {
  return dayString(base, 0);
}

function atTime(base: Date, offsetDays: number, hour: number, minute = 0): number {
  const d = new Date(base);
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

export function todayKey(): string {
  return dayKeyString(new Date());
}

interface TaskSeed {
  title: string;
  description?: string;
  day?: number;
  time?: string;
  priority?: "p1" | "p2" | "p3";
  source?: DemoTask["source"];
  estimatedMinutes?: number;
  tags?: string[];
  goal?: string;
  done?: boolean;
  doneHour?: number;
  cancelled?: boolean;
}

const GOALS: DemoGoal[] = [
  {
    clientId: "g-ship-pravah",
    text: "Ship Pravah to 10 daily users",
    description: "Web and mobile polish, landing page, demo mode, then share it.",
    deadline: undefined,
    priority: "p1",
    createdAt: atTime(new Date(), -58, 9),
  },
  {
    clientId: "g-system-design",
    text: "Master system design",
    description: "One case study every weekday. Notes go into the vault.",
    priority: "p1",
    createdAt: atTime(new Date(), -41, 9),
  },
  {
    clientId: "g-read-books",
    text: "Read 12 books in 2026",
    description: "Currently: Designing Data-Intensive Applications.",
    deadline: `${new Date().getFullYear()}-12-31`,
    priority: "p2",
    createdAt: atTime(new Date(), -120, 9),
  },
  {
    clientId: "g-half-marathon",
    text: "Run a half marathon",
    description: "Three runs a week, long run on Sundays.",
    deadline: dayString(new Date(), 118),
    priority: "p2",
    createdAt: atTime(new Date(), -75, 9),
  },
  {
    clientId: "g-learn-go",
    text: "Learn Go deeply",
    description: "Concurrency, then a small CLI project.",
    priority: "p3",
    createdAt: atTime(new Date(), -33, 9),
  },
  {
    clientId: "g-rag-assistant",
    text: "Build a RAG assistant for course notes",
    description: "Ingest, chunk, embed, answer. Keep it local-first.",
    priority: "p2",
    createdAt: atTime(new Date(), -19, 9),
  },
  {
    clientId: "g-write-essays",
    text: "Write 12 essays",
    description: "One every month. Calm software is the first topic.",
    deadline: `${new Date().getFullYear()}-12-31`,
    priority: "p3",
    createdAt: atTime(new Date(), -90, 9),
  },
];

const ACTIVE_TASKS: TaskSeed[] = [
  // Today — a believable mix of done and open.
  { title: "System design: design a URL shortener", day: 0, priority: "p1", estimatedMinutes: 45, goal: "g-system-design", done: true, doneHour: 9 },
  { title: "Kairo: verify proposal apply flow", description: "Apply, decline, and undo paths.", day: 0, priority: "p1", source: "ai-agent", estimatedMinutes: 30, goal: "g-ship-pravah", done: true, doneHour: 11 },
  { title: "Plan next week", day: 0, time: "14:30", priority: "p2", estimatedMinutes: 30 },
  { title: "Gym — upper body", day: 0, priority: "p3", estimatedMinutes: 60, tags: ["health"], goal: "g-half-marathon" },
  { title: "Read 30 pages — Designing Data-Intensive Applications", day: 0, priority: "p3", goal: "g-read-books" },
  { title: "Review inbox candidates from Gmail", day: 0, priority: "p2", estimatedMinutes: 15 },

  // Yesterday — two done, two left behind on purpose (overdue triage).
  { title: "Ship the warm-paper theme", day: -1, priority: "p1", goal: "g-ship-pravah", done: true, doneHour: 16 },
  { title: "System design: design a rate limiter", day: -1, priority: "p1", estimatedMinutes: 45, goal: "g-system-design", done: true, doneHour: 10 },
  { title: "Reply to Aditi about the coffee chat", day: -1, priority: "p2" },
  { title: "Pay the electricity bill", day: -1, priority: "p1", tags: ["home"] },

  // The rest of this week and next.
  { title: "System design: design a notification fan-out service", day: 1, priority: "p1", estimatedMinutes: 45, goal: "g-system-design" },
  { title: "Draft essay: calm software", day: 1, priority: "p2", estimatedMinutes: 60, goal: "g-write-essays" },
  { title: "Dentist appointment", day: 1, time: "10:00", priority: "p1", tags: ["health"] },
  { title: "Go: goroutines and channels deep dive", day: 2, priority: "p2", estimatedMinutes: 50, goal: "g-learn-go" },
  { title: "Long run — 14 km", day: 2, priority: "p2", estimatedMinutes: 90, tags: ["health"], goal: "g-half-marathon" },
  { title: "System design: consistent hashing", day: 3, priority: "p1", estimatedMinutes: 45, goal: "g-system-design" },
  { title: "Read 40 pages — DDIA part two", day: 3, priority: "p3", goal: "g-read-books" },
  { title: "Go: build the focus timer CLI", day: 4, priority: "p2", estimatedMinutes: 60, goal: "g-learn-go" },
  { title: "Deep Learning: attention, from scratch", day: 4, priority: "p3", estimatedMinutes: 45, goal: "g-rag-assistant" },
  { title: "System design: design a distributed job scheduler", day: 5, priority: "p1", estimatedMinutes: 45, goal: "g-system-design" },
  { title: "Meal prep for the week", day: 5, priority: "p3", tags: ["home"] },
  { title: "Weekly review and inbox zero", day: 6, time: "18:00", priority: "p2", estimatedMinutes: 30 },
];

const INBOX_TASKS: TaskSeed[] = [
  { title: "Acing the system design interview — ch. 5 notes", priority: "p1", estimatedMinutes: 40, goal: "g-system-design" },
  { title: "Go language: error handling idioms", priority: "p2", estimatedMinutes: 35, goal: "g-learn-go" },
  { title: "Rust ownership patterns — practice set", priority: "p3", goal: "g-learn-go" },
  { title: "My articles page — wireframe", description: "Sketch three layouts before touching code.", priority: "p2", goal: "g-write-essays" },
  { title: "How to be a 10x dev — extract highlights", priority: "p3", source: "gmail" },
  { title: "Build a RAG assistant — chunking strategy", priority: "p2", estimatedMinutes: 45, goal: "g-rag-assistant" },
  { title: "Assistant UI — polish pass", priority: "p2", source: "ai-agent", goal: "g-ship-pravah" },
  { title: "Groceries — weekly restock", priority: "p3", tags: ["home"] },
  { title: "Book the badminton court for Sunday", priority: "p3" },
  { title: "Old: migrate notes app to v2", priority: "p3", cancelled: true },
];

// History titles for the completion log (insights heatmap, streaks, charts).
const HISTORY_TITLES = [
  "System design case study",
  "Morning run",
  "Read — DDIA",
  "Go practice",
  "Gym session",
  "Essay notes",
  "Deep Learning chapter",
  "Weekly review",
  "Inbox zero sweep",
  "Side project hour",
  "Flashcards",
  "Journal",
];

function buildHistory(
  rng: () => number,
  base: Date,
  nextId: () => { id: string; n: number }
): DemoTask[] {
  const tasks: DemoTask[] = [];
  let position = 0;
  for (let offset = -84; offset <= -2; offset += 1) {
    const date = new Date(base);
    date.setDate(date.getDate() + offset);
    const weekday = date.getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    // Deliberate rhythm: strong weekdays, light weekends, occasional off days
    // so streaks look earned rather than synthetic.
    const roll = rng();
    let count = 0;
    if (isWeekend) count = roll < 0.55 ? 0 : 1 + Math.floor(rng() * 2);
    else if (roll < 0.07) count = 0;
    else count = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i += 1) {
      const createdOffset = offset - 1 - Math.floor(rng() * 3);
      const created = atTime(base, createdOffset, 8 + Math.floor(rng() * 3));
      const doneAt = atTime(base, offset, 8 + Math.floor(rng() * 11), Math.floor(rng() * 60));
      const { id } = nextId();
      const priorityRoll = rng();
      tasks.push({
        _id: id,
        _creationTime: created,
        title: HISTORY_TITLES[Math.floor(rng() * HISTORY_TITLES.length)],
        scheduledAt: created,
        completedAt: doneAt,
        position: position++,
        priority: priorityRoll < 0.18 ? "p1" : priorityRoll < 0.55 ? "p2" : "p3",
        source: rng() < 0.08 ? "ai-agent" : "manual",
        createdBy: rng() < 0.1 ? "kairo" : "user",
        ownerTokenIdentifier: OWNER,
        createdAt: created,
        updatedAt: doneAt,
      });
    }
  }
  return tasks;
}

export function buildDemoData(now: Date = new Date()): DemoData {
  const rng = mulberry32(20261002);
  let idCounter = 1;
  const nextId = () => ({ id: `demo-task-${idCounter}`, n: idCounter++ });
  const tasks: DemoTask[] = [];
  let timelinePos = 0;
  let inboxPos = 0;

  const pushSeed = (seed: TaskSeed) => {
    const { id } = nextId();
    const created = atTime(now, (seed.day ?? 0) - 2, 9);
    const due = seed.day !== undefined ? dayString(now, seed.day) : undefined;
    const task: DemoTask = {
      _id: id,
      _creationTime: created,
      title: seed.title,
      description: seed.description,
      deadline: due,
      time: due ? seed.time : undefined,
      scheduledAt: created,
      position: due ? timelinePos++ : inboxPos++,
      source: seed.source ?? "manual",
      estimatedMinutes: seed.estimatedMinutes,
      tags: seed.tags,
      priority: seed.priority,
      createdBy: seed.source === "ai-agent" ? "kairo" : "user",
      ownerTokenIdentifier: OWNER,
      createdAt: created,
      updatedAt: created,
    };
    if (seed.done) {
      task.completedAt = atTime(now, seed.day ?? 0, seed.doneHour ?? 12, 30);
      task.updatedAt = task.completedAt;
    }
    if (seed.cancelled) {
      task.cancelledAt = Date.now() - 5 * 60 * 1000;
      task.updatedAt = task.cancelledAt;
    }
    tasks.push(task);
    if (seed.goal) (task as DemoTask & { __goal?: string }).__goal = seed.goal;
    return task;
  };

  for (const seed of ACTIVE_TASKS) pushSeed(seed);
  for (const seed of INBOX_TASKS) pushSeed(seed);
  tasks.push(...buildHistory(rng, now, nextId));

  // Extract the goal links the seeds declared.
  const goalLinks: Record<string, string> = {};
  for (const task of tasks) {
    const tagged = task as DemoTask & { __goal?: string };
    if (tagged.__goal) {
      goalLinks[task._id] = tagged.__goal;
      delete tagged.__goal;
    }
  }

  const nowMs = Date.now();
  const data: DemoData = {
    version: 1,
    dayKey: todayKey(),
    nextId: idCounter,
    user: { name: "Atulya", email: "atulya@pravah.app" },
    tasks,
    goals: GOALS.map((goal) => ({ ...goal })),
    goalLinks,
    integrations: [
      {
        _id: "demo-integration-gmail",
        _creationTime: nowMs - 40 * 24 * 3600 * 1000,
        provider: "gmail",
        status: "connected",
        syncEnabled: true,
        accountEmail: "atulya@pravah.app",
        lastSyncedAt: nowMs - 26 * 60 * 1000,
        ownerTokenIdentifier: OWNER,
        createdAt: nowMs - 40 * 24 * 3600 * 1000,
        updatedAt: nowMs - 26 * 60 * 1000,
      },
      {
        _id: "demo-integration-gcal",
        _creationTime: nowMs - 12 * 24 * 3600 * 1000,
        provider: "google_calendar",
        status: "disconnected",
        syncEnabled: false,
        ownerTokenIdentifier: OWNER,
        createdAt: nowMs - 12 * 24 * 3600 * 1000,
        updatedAt: nowMs - 12 * 24 * 3600 * 1000,
      },
    ],
    lastSyncRuns: [
      {
        _id: "demo-sync-run-1",
        _creationTime: nowMs - 26 * 60 * 1000,
        provider: "gmail",
        direction: "import",
        status: "success",
        startedAt: nowMs - 26 * 60 * 1000,
        finishedAt: nowMs - 25 * 60 * 1000,
        importedCount: 1,
        updatedCount: 0,
        skippedCount: 14,
      },
    ],
    reviewQueue: [
      {
        _id: "demo-review-1",
        _creationTime: nowMs - 25 * 60 * 1000,
        provider: "gmail",
        sourceType: "gmail_candidate",
        externalId: "demo-gmail-1",
        title: "Coffee chat with Aditi — Thursday",
        description: "She asked to catch up on the Pravah progress.",
        deadline: dayString(now, 5),
        estimatedMinutes: 30,
        tags: ["people"],
        status: "pending",
        ownerTokenIdentifier: OWNER,
        createdAt: nowMs - 25 * 60 * 1000,
        updatedAt: nowMs - 25 * 60 * 1000,
      },
      {
        _id: "demo-review-2",
        _creationTime: nowMs - 3 * 3600 * 1000,
        provider: "gmail",
        sourceType: "gmail_candidate",
        externalId: "demo-gmail-2",
        title: "Renew the Vercel pro plan before the 9th",
        deadline: dayString(now, 7),
        status: "pending",
        ownerTokenIdentifier: OWNER,
        createdAt: nowMs - 3 * 3600 * 1000,
        updatedAt: nowMs - 3 * 3600 * 1000,
      },
      {
        _id: "demo-review-3",
        _creationTime: nowMs - 7 * 3600 * 1000,
        provider: "gmail",
        sourceType: "gmail_candidate",
        externalId: "demo-gmail-3",
        title: "Paper: RAG survey — skim and file",
        estimatedMinutes: 25,
        tags: ["reading"],
        status: "pending",
        ownerTokenIdentifier: OWNER,
        createdAt: nowMs - 7 * 3600 * 1000,
        updatedAt: nowMs - 7 * 3600 * 1000,
      },
    ],
    credentials: [
      {
        _id: "demo-credential-1",
        _creationTime: nowMs - 14 * 24 * 3600 * 1000,
        ownerTokenIdentifier: OWNER,
        label: "pravah-cli — laptop",
        credentialPreview: "pvah_sk_…7f2a",
        scopes: ["tasks:read", "tasks:write"],
        status: "active",
        createdAt: nowMs - 14 * 24 * 3600 * 1000,
        updatedAt: nowMs - 14 * 24 * 3600 * 1000,
        lastUsedAt: nowMs - 2 * 3600 * 1000,
      },
    ],
  };
  return data;
}
