import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { T_FAST, T_SLOW, T_EXIT_FAST, tx } from "../lib/motion";
import { getLocalDateString } from "../lib/utils";
import type { Task } from "../types";
import {
  KAIRO_CONFIG_EVENT,
  getKairoProviderLabel,
  getKairoConfig,
  isKairoConfigured,
} from "../lib/kairoConfig";

const ACCENT = "oklch(0.78 0.14 260)";
const ACCENT_SOFT = "oklch(0.72 0.16 260 / 0.2)";
const ACCENT_GLOW = "oklch(0.78 0.14 260 / 0.35)";

const SYSTEM_PROMPT = `You are Kairo, an intelligent work orchestration assistant embedded in Pravah — a timeline-first task management tool. Your role is to help the user manage their schedule, think through priorities, and keep their week intentional.

You have the following information about the user's current state:
{CONTEXT}

Your capabilities:
- Analyze the schedule and surface overdue items, conflicts, or overloaded days
- Suggest tasks for specific days based on what you know about workload and goals
- Help the user prioritize by reasoning about deadlines and importance
- Summarize recent progress and forward-looking pressure
- Move tasks around or help the user triage the inbox
- Answer schedule questions ("What's happening Thursday?", "Am I free Friday?")

When you decide to add a task, include a structured block in your response — one per task:
<add-task>{"title":"<title>","scheduledDate":"<YYYY-MM-DD or null for inbox>","type":"open"}</add-task>

Guidelines:
- Be direct and warm, not corporate or verbose
- Give one clear recommendation before listing alternatives
- Acknowledge what's already done before suggesting more work
- Flag honestly when a day looks overloaded ("Tuesday already has 4 tasks")
- Format answers as compact Markdown that this UI can render: short paragraphs, **bold** labels, \`inline code\` for dates/times/model names, and bullet lists only when there are 2-5 concrete items
- For schedule analysis, use this shape: one sentence summary, then bullets starting with **Now**, **Risk**, or **Next**
- Keep responses short — 2-4 sentences for simple questions, 3-5 bullets max for analysis
- Never make up tasks or details not present in the context`;

interface Message {
  from: "me" | "kairo";
  text: string;
  tasks?: Array<{ title: string; scheduledDate: string | null; type: "open" | "deadline" }>;
}

interface KairoProps {
  onActiveChange?: (active: boolean) => void;
  tasks: Task[];
  inboxTasks: Task[];
  onOpenSettings?: () => void;
}

function buildContext(tasks: Task[], inboxTasks: Task[]): string {
  const today = getLocalDateString();
  const scheduled = tasks.filter(t => t.status === "scheduled");
  const completed = tasks.filter(t => t.status === "completed");

  const byDate: Record<string, Task[]> = {};
  for (const t of scheduled) {
    if (!t.scheduledDate) continue;
    (byDate[t.scheduledDate] ||= []).push(t);
  }

  const dateLines = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, ts]) => {
      const label = date === today ? `${date} (TODAY)` : date;
      const taskList = ts.map(t =>
        `  - "${t.title}"${t.type === "deadline" ? " [DEADLINE]" : ""}${t.priority ? ` [${t.priority.toUpperCase()}]` : ""}`
      ).join("\n");
      return `${label}:\n${taskList}`;
    })
    .join("\n\n");

  const inboxLines = inboxTasks.length
    ? inboxTasks.map(t => `  - "${t.title}"`).join("\n")
    : "  (empty)";

  return [
    `Today: ${today}`,
    "",
    "Scheduled tasks:",
    dateLines || "  (none)",
    "",
    `Inbox (${inboxTasks.length} items):`,
    inboxLines,
    "",
    `Completed this session: ${completed.length} tasks`,
  ].join("\n");
}

function KairoMark({ size = 24 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size,
        background: `linear-gradient(135deg, ${ACCENT}, oklch(0.6 0.18 310))`,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 0 14px ${ACCENT_GLOW}`,
      }}
    >
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 16 16" fill="none">
        <path d="M3 11 C 5 7, 7 13, 8 9 S 11 7, 13 11" stroke="#0a0a0b" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="11.5" cy="5" r="1.5" fill="#0a0a0b" />
      </svg>
    </div>
  );
}

function PulsingDot({ color, size = 5 }: { color: string; size?: number }) {
  return (
    <span style={{ display: "inline-block", position: "relative", width: size, height: size, flexShrink: 0 }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: 99, background: color }} />
      <span style={{ position: "absolute", inset: 0, borderRadius: 99, background: color, animation: "pravahPulse 2s ease-out infinite", opacity: 0.5 }} />
    </span>
  );
}

const STARTER_PROMPTS = [
  "Plan my week",
  "What's overdue?",
  "Summarize my progress",
  "What looks heavy this week?",
];

const PLACEHOLDER_PROMPTS = [
  "Plan tomorrow's exam sprint",
  "Balance my week",
  "Find the overloaded day",
  "Clear my inbox",
  "Move the scary deadlines",
  "Make a two-hour study block",
  "What should I do next?",
  "Rescue my schedule",
];

type TypingPhase = "typing" | "holding" | "deleting" | "gap";

function pickNextPromptIndex(current: number): number {
  return (current + 1 + Math.floor(Math.random() * (PLACEHOLDER_PROMPTS.length - 1))) % PLACEHOLDER_PROMPTS.length;
}

function getTypingDelay(prompt: string, index: number): number {
  const char = prompt[index - 1] ?? "";
  const base = 46 + Math.random() * 32;

  if (char === " ") return base + 22;
  if (char === "," || char === "?" || char === "-") return base + 90;

  return base;
}

function useTypingPlaceholder(enabled: boolean): { text: string; phase: TypingPhase } {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<TypingPhase>("gap");
  // eslint-disable-next-line react-hooks/purity
  const promptIndexRef = useRef(Math.floor(Math.random() * PLACEHOLDER_PROMPTS.length));
  const charIndexRef = useRef(0);
  const phaseRef = useRef<TypingPhase>("typing");

  useEffect(() => {
    if (!enabled) {
      setText("");
      setPhase("gap");
      charIndexRef.current = 0;
      phaseRef.current = "typing";
      return;
    }

    let timer = 0;

    const tick = () => {
      const prompt = PLACEHOLDER_PROMPTS[promptIndexRef.current];
      const currentPhase = phaseRef.current;

      if (currentPhase === "typing") {
        charIndexRef.current = Math.min(prompt.length, charIndexRef.current + 1);
        setText(prompt.slice(0, charIndexRef.current));
        setPhase("typing");

        if (charIndexRef.current === prompt.length) {
          phaseRef.current = "holding";
          setPhase("holding");
          timer = window.setTimeout(tick, 1550);
          return;
        }

        timer = window.setTimeout(tick, getTypingDelay(prompt, charIndexRef.current));
        return;
      }

      if (currentPhase === "holding") {
        phaseRef.current = "deleting";
        setPhase("deleting");
        timer = window.setTimeout(tick, 90);
        return;
      }

      if (currentPhase === "deleting") {
        charIndexRef.current = Math.max(0, charIndexRef.current - 1);
        setText(prompt.slice(0, charIndexRef.current));
        setPhase("deleting");

        if (charIndexRef.current === 0) {
          phaseRef.current = "gap";
          setPhase("gap");
          promptIndexRef.current = pickNextPromptIndex(promptIndexRef.current);
          timer = window.setTimeout(tick, 260);
          return;
        }

        timer = window.setTimeout(tick, 24 + Math.random() * 18);
        return;
      }

      phaseRef.current = "typing";
      setPhase("typing");
      timer = window.setTimeout(tick, 110);
    };

    timer = window.setTimeout(tick, 140);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  return { text, phase };
}

function KairoPlaceholderOverlay({ text, phase }: { text: string; phase: TypingPhase }) {
  const isWaiting = phase === "holding" || phase === "gap";

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        pointerEvents: "none",
        color: "#8f8f96",
        fontFamily: "var(--font-sans)",
        fontSize: 15,
        letterSpacing: "-0.01em",
        whiteSpace: "nowrap",
        overflow: "hidden",
        transition: tx(["color", "opacity"], "fast"),
        opacity: phase === "gap" && !text ? 0.76 : 1,
      }}
    >
      <span>{text}</span>
      <span
        style={{
          width: 1,
          height: 17,
          marginLeft: 3,
          background: "oklch(0.78 0.14 260 / 0.82)",
          boxShadow: "0 0 10px oklch(0.78 0.14 260 / 0.35)",
          opacity: isWaiting ? undefined : 1,
          animation: isWaiting ? "kairoCaretBlink 1.05s steps(1, end) infinite" : "none",
        }}
      />
    </div>
  );
}

function KairoThinking() {
  return (
    <div
      style={{
        alignSelf: "flex-start",
        width: "min(420px, 82%)",
        padding: "12px 14px",
        background: "linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.022))",
        border: "1px solid rgba(255,255,255,.08)",
        borderLeft: `3px solid ${ACCENT}`,
        borderRadius: 4,
        display: "grid",
        gap: 9,
      }}
    >
      <div
        style={{
          width: 130,
          height: 12,
          background: "linear-gradient(90deg, #6f6f77 0%, #ededf2 42%, #6f6f77 78%)",
          backgroundSize: "220% 100%",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          animation: "kairoShine 1.2s ease-in-out infinite",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        thinking
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {[0.92, 0.74, 0.48].map((width, index) => (
          <span
            key={index}
            style={{
              width: `${width * 100}%`,
              height: 8,
              background: "linear-gradient(90deg, rgba(255,255,255,.055), rgba(255,255,255,.15), rgba(255,255,255,.055))",
              backgroundSize: "220% 100%",
              animation: `kairoSkeletonSweep 1.4s ease-in-out ${index * 0.08}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function useRevealText(text: string, enabled: boolean): string {
  const [visibleText, setVisibleText] = useState(enabled ? "" : text);

  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisibleText(text);
      return;
    }

    let index = 0;
    setVisibleText("");
    const tick = () => {
      index = Math.min(text.length, index + Math.max(1, Math.round(text.length / 90)));
      setVisibleText(text.slice(0, index));
      if (index < text.length) {
        window.setTimeout(tick, 12 + Math.random() * 18);
      }
    };

    const timer = window.setTimeout(tick, 70);
    return () => window.clearTimeout(timer);
  }, [enabled, text]);

  return visibleText;
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} style={{ padding: "1px 4px", background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 3, color: "#d9d9df", fontFamily: "var(--font-mono)", fontSize: "0.92em" }}>
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} style={{ color: "#f4f4f6", fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
    }

    return part;
  });
}

function KairoMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let listType: "bullet" | "number" | null = null;

  const flushList = () => {
    if (!listItems.length) return;
    const Tag = listType === "number" ? "ol" : "ul";
    blocks.push(
      <Tag key={`list-${blocks.length}`} style={{ margin: "7px 0 0", paddingLeft: 18, display: "grid", gap: 5 }}>
        {listItems.map((item, index) => (
          <li key={index}>{renderInlineMarkdown(item)}</li>
        ))}
      </Tag>
    );
    listItems = [];
    listType = null;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);

    if (bullet || numbered) {
      const nextType = bullet ? "bullet" : "number";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      listItems.push((bullet?.[1] ?? numbered?.[1] ?? "").trim());
      return;
    }

    flushList();

    if (trimmed.startsWith("### ")) {
      blocks.push(<div key={`h-${blocks.length}`} style={{ marginTop: blocks.length ? 8 : 0, color: "#f3f3f5", fontWeight: 700, fontSize: 13 }}>{renderInlineMarkdown(trimmed.slice(4))}</div>);
      return;
    }

    blocks.push(<p key={`p-${blocks.length}`} style={{ margin: blocks.length ? "7px 0 0" : 0 }}>{renderInlineMarkdown(trimmed)}</p>);
  });

  flushList();
  return <>{blocks}</>;
}

function readAssistantText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          "type" in part &&
          "text" in part &&
          (part as { type?: string }).type === "text"
        ) {
          return String((part as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

function buildOpenAIRequestBody(config: ReturnType<typeof getKairoConfig>, systemPrompt: string, history: Array<{ role: string; content: string }>, text: string) {
  return {
    model: config.model,
    max_tokens: 1024,
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: text },
    ],
  };
}

function buildAnthropicRequestBody(config: ReturnType<typeof getKairoConfig>, systemPrompt: string, history: Array<{ role: string; content: string }>, text: string) {
  return {
    model: config.model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      ...history.filter((message) => message.role === "user" || message.role === "assistant"),
      { role: "user", content: text },
    ],
  };
}

function readKairoResponseText(data: unknown, providerFormat: ReturnType<typeof getKairoConfig>["providerFormat"]): string {
  if (!data || typeof data !== "object") return "";

  if (providerFormat === "anthropic" && "content" in data) {
    return readAssistantText((data as { content?: unknown }).content);
  }

  return readAssistantText((data as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content);
}

export function Kairo({ onActiveChange, tasks, inboxTasks, onOpenSettings }: KairoProps) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [msgs, setMsgs] = useState<Message[]>([
    { from: "kairo", text: "Hey, I'm Kairo. I can help you plan your week, prioritize tasks, or analyze your schedule. What do you need?" },
  ]);
  const [thinking, setThinking] = useState(false);
  const [config, setConfig] = useState(() => getKairoConfig());
  const animatedPlaceholder = useTypingPlaceholder(!open && val.length === 0);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addTask = useMutation(api.tasks.addTask);

  useEffect(() => { onActiveChange?.(open); }, [open, onActiveChange]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 200); }, [open]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, thinking]);

  useEffect(() => {
    const onOpen = () => {
      setConfig(getKairoConfig());
      setOpen(true);
    };
    window.addEventListener("pravah:open-kairo", onOpen);
    return () => window.removeEventListener("pravah:open-kairo", onOpen);
  }, []);

  useEffect(() => {
    const syncConfig = () => setConfig(getKairoConfig());
    window.addEventListener(KAIRO_CONFIG_EVENT, syncConfig);
    window.addEventListener("focus", syncConfig);
    window.addEventListener("storage", syncConfig);
    syncConfig();
    return () => {
      window.removeEventListener(KAIRO_CONFIG_EVENT, syncConfig);
      window.removeEventListener("focus", syncConfig);
      window.removeEventListener("storage", syncConfig);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const nextConfig = getKairoConfig();
    setConfig(nextConfig);

    setMsgs(m => [...m, { from: "me", text }]);
    setVal("");
    setThinking(true);

    if (!isKairoConfigured(nextConfig)) {
      await new Promise(r => setTimeout(r, 400));
      setMsgs(m => [...m, {
        from: "kairo",
        text: "I need your provider format, API key, endpoint URL, and model before I can respond. Add them in Settings and I’ll use that config directly from your browser.",
      }]);
      setThinking(false);
      return;
    }

    try {
      const context = buildContext(tasks, inboxTasks);
      const systemPrompt = SYSTEM_PROMPT.replace("{CONTEXT}", context);

      const history = msgs
        .slice(1)
        .map(m => ({ role: m.from === "me" ? "user" : "assistant", content: m.text }));

      const requestBody = nextConfig.providerFormat === "anthropic"
        ? buildAnthropicRequestBody(nextConfig, systemPrompt, history, text)
        : buildOpenAIRequestBody(nextConfig, systemPrompt, history, text);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (nextConfig.providerFormat === "anthropic") {
        headers["x-api-key"] = nextConfig.apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else {
        headers["Authorization"] = `Bearer ${nextConfig.apiKey}`;
      }

      const res = await fetch(nextConfig.baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        const errMsg = typeof err.error === "object" && err.error !== null && "message" in err.error
          ? String((err.error as Record<string, unknown>).message)
          : `API error ${res.status}`;
        setMsgs(m => [...m, { from: "kairo", text: `⚠️ ${errMsg}` }]);
        setThinking(false);
        return;
      }

      const data = await res.json();
      const rawText = readKairoResponseText(data, nextConfig.providerFormat);

      // Parse <add-task> blocks
      const taskBlocks: Array<{ title: string; scheduledDate: string | null; type: "open" | "deadline" }> = [];
      const cleanText = rawText.replace(/<add-task>([\s\S]*?)<\/add-task>/g, (_, json: string) => {
        try {
          const parsed = JSON.parse(json) as { title?: string; scheduledDate?: string | null; type?: string };
          if (parsed.title) {
            taskBlocks.push({
              title: parsed.title,
              scheduledDate: parsed.scheduledDate ?? null,
              type: parsed.type === "deadline" ? "deadline" : "open",
            });
          }
        } catch { /* skip malformed */ }
        return "";
      }).trim();

      // Auto-add parsed tasks
      for (const t of taskBlocks) {
        await addTask({
          title: t.title,
          type: t.type,
          scheduledDate: t.scheduledDate ?? undefined,
        });
      }

      setMsgs(m => [...m, { from: "kairo", text: cleanText, tasks: taskBlocks.length ? taskBlocks : undefined }]);
    } catch {
      setMsgs(m => [...m, { from: "kairo", text: "Something went wrong reaching your configured AI endpoint. Check the format toggle, key, URL, model, and server compatibility." }]);
    } finally {
      setThinking(false);
    }
  };

  return (
    <>
      {/* Backdrop — opacity-only animation. The blurred layer mounts only while
          open (or closing) to avoid paying for backdrop-filter when idle. */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="kairo-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: T_FAST }}
            exit={{ opacity: 0, transition: T_EXIT_FAST }}
            onClick={() => setOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "auto",
              background: "rgba(0,0,0,.55)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              zIndex: 40,
              willChange: "opacity",
              cursor: "default",
            }}
          />
        )}
      </AnimatePresence>

      {/* Panel — explicit width/y animation. We avoid `layout` here because it
          fought the inline transform: translateX(-50%) and FLIP-scaled the
          inner gradient overlays during open/close. The static style keeps
          horizontal centering; Framer animates only width and vertical
          position. */}
      <motion.div
        animate={{
          width: open ? 780 : 462,
          bottom: open ? "50%" : 38,
          y: open ? "50%" : 0,
        }}
        transition={T_SLOW}
        style={{
          position: "absolute",
          left: "50%",
          x: "-50%",
          maxWidth: "calc(100vw - 48px)",
          zIndex: 50,
          willChange: "width, transform",
        }}
      >
        <div
          style={{
            position: "relative",
            background: open
              ? "linear-gradient(180deg, #111115 0%, #0c0c0f 100%)"
              : "#101013",
            border: open
              ? "1px solid oklch(0.78 0.14 260 / 0.32)"
              : "1px solid rgba(255,255,255,.13)",
            borderRadius: open ? 8 : 7,
            boxShadow: open
              ? `0 46px 90px rgba(0,0,0,.58), 0 0 0 1px rgba(255,255,255,.04), 0 0 90px oklch(0.78 0.14 260 / 0.22)`
              : `0 20px 50px rgba(0,0,0,.5), 0 0 0 1px ${ACCENT_GLOW}`,
            overflow: "hidden",
            transition: tx(["box-shadow", "border-color", "background-color"], "slow"),
          }}
        >
          {open && (
            <>
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background:
                    "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.028) 1px, transparent 1px)",
                  backgroundSize: "48px 48px",
                  opacity: 0.26,
                }}
              />
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  inset: "0 auto 0 0",
                  width: 3,
                  background: isKairoConfigured(config)
                    ? "linear-gradient(180deg, oklch(0.78 0.18 150), oklch(0.78 0.14 260))"
                    : "linear-gradient(180deg, oklch(0.72 0.2 25), oklch(0.78 0.14 260))",
                  boxShadow: `0 0 24px ${ACCENT_GLOW}`,
                }}
              />
            </>
          )}
          {/* Header when open */}
          {open && (
            <>
              <div style={{ position: "relative", padding: "18px 20px 14px 24px", display: "flex", alignItems: "flex-start", gap: 13, borderBottom: "1px solid rgba(255,255,255,.07)" }}>
                <KairoMark size={30} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2, color: "#f3f3f5" }}>Kairo</div>
                    <span
                      style={{
                        border: "1px solid rgba(255,255,255,.08)",
                        background: "rgba(255,255,255,.035)",
                        color: isKairoConfigured(config) ? "oklch(0.78 0.18 150)" : "oklch(0.72 0.2 25)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        letterSpacing: 1.2,
                        padding: "3px 6px",
                      }}
                    >
                      {isKairoConfigured(config) ? "ONLINE" : "SETUP"}
                    </span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 10.5, color: "#74747c", fontFamily: "var(--font-mono)", letterSpacing: 1, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <PulsingDot color={isKairoConfigured(config) ? "oklch(0.78 0.18 150)" : "oklch(0.72 0.2 25)"} size={5} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {isKairoConfigured(config) ? `${getKairoProviderLabel(config.providerFormat)} · ${config.model}` : "Provider config required"}
                    </span>
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <button
                  title="Open settings"
                  onClick={onOpenSettings}
                  style={{ width: 26, height: 26, borderRadius: 4, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", color: isKairoConfigured(config) ? "#c2c2c8" : ACCENT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}
                >
                  ⚙
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Minimize"
                  style={{ width: 26, height: 26, borderRadius: 4, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", color: "#6b6b72", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}
                >
                  —
                </button>
              </div>

              {!isKairoConfigured(config) && (
                <div
                  style={{
                    position: "relative",
                    margin: "14px 20px 0 24px",
                    padding: "11px 12px",
                    background: "rgba(255,255,255,.03)",
                    border: "1px solid rgba(255,255,255,.07)",
                    borderRadius: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div style={{ flex: 1, fontSize: 12, color: "#c2c2c8", lineHeight: 1.5 }}>
                    Add your provider format, API key, endpoint URL, and model in Settings before using Kairo.
                  </div>
                  <button
                    onClick={onOpenSettings}
                    style={{
                      padding: "6px 10px",
                      background: ACCENT_SOFT,
                      border: "1px solid oklch(0.78 0.14 260 / 0.35)",
                      borderRadius: 3,
                      color: ACCENT,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    OPEN
                  </button>
                </div>
              )}

              {/* Messages */}
              <div
                ref={scrollRef}
                style={{ position: "relative", maxHeight: 430, overflowY: "auto", padding: "18px 22px 16px 24px", display: "flex", flexDirection: "column", gap: 14 }}
              >
                {msgs.map((m, i) => (
                  <KairoMsg key={i} m={m} animate={m.from === "kairo" && i === msgs.length - 1 && !thinking} />
                ))}
                {thinking && <KairoThinking />}
              </div>

              {/* Starter chips */}
              {msgs.length === 1 && !thinking && (
                <div style={{ position: "relative", padding: "0 22px 16px 24px", display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {STARTER_PROMPTS.map(p => (
                    <button
                      key={p}
                      onClick={() => sendMessage(p)}
                      style={{
                        padding: "7px 11px",
                        background: "rgba(255,255,255,.03)",
                        border: "1px solid rgba(255,255,255,.07)",
                        borderRadius: 4,
                        fontSize: 11.5,
                        color: "#c2c2c8",
                        cursor: "pointer",
                        fontFamily: "var(--font-sans)",
                        transition: tx(["background-color", "border-color"], "instant"),
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "oklch(0.78 0.14 260 / 0.55)";
                        (e.currentTarget as HTMLButtonElement).style.background = ACCENT_SOFT;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,.07)";
                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,.03)";
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Input bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minHeight: open ? 70 : 56,
              padding: open ? "13px 16px 14px 24px" : "13px 18px",
              borderTop: open ? "1px solid rgba(255,255,255,.08)" : "none",
              background: open ? "rgba(0,0,0,.16)" : "transparent",
              position: "relative",
            }}
          >
            {!open && <KairoMark size={30} />}
            {!open && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  inset: "10px auto 10px 0",
                  width: 3,
                  background: `linear-gradient(180deg, ${ACCENT}, transparent)`,
                  boxShadow: `0 0 18px ${ACCENT_GLOW}`,
                }}
              />
            )}
            <div style={{ position: "relative", flex: 1 }}>
              {!open && val.length === 0 && (
                <KairoPlaceholderOverlay
                  text={animatedPlaceholder.text}
                  phase={animatedPlaceholder.phase}
                />
              )}
              <input
                ref={inputRef}
                type="search"
                name="pravah-kairo-command"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="sentences"
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
                spellCheck={false}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendMessage(val.trim());
                  if (e.key === "Escape") setOpen(false);
                }}
                placeholder={open ? "Tell Kairo what to do..." : ""}
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  width: "100%",
                  fontSize: open ? 15 : 15,
                  color: open ? "#ededef" : "transparent",
                  caretColor: "#ededef",
                  fontFamily: "var(--font-sans)",
                  padding: open ? "10px 0" : "7px 0",
                }}
              />
            </div>
            {open ? (
              <button
                onClick={() => sendMessage(val.trim())}
                disabled={!val.trim()}
                style={{
                  padding: "8px 13px",
                  fontSize: 11,
                  fontFamily: "var(--font-sans)",
                  fontWeight: 600,
                  color: val.trim() ? "#0a0a0b" : "#6b6b72",
                  background: val.trim() ? ACCENT : "rgba(255,255,255,.07)",
                  border: "none",
                  borderRadius: 4,
                  cursor: val.trim() ? "pointer" : "not-allowed",
                  transition: tx(["background-color", "color"], "instant"),
                }}
              >
                SEND
              </button>
            ) : (
              <kbd>⌘J</kbd>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

function KairoMsg({ m, animate = false }: { m: Message; animate?: boolean }) {
  const visibleText = useRevealText(m.text, animate);

  if (m.from === "me") {
    return (
      <div style={{ alignSelf: "flex-end", maxWidth: "78%" }}>
        <div style={{ padding: "11px 13px", background: "oklch(0.72 0.16 260 / 0.16)", color: "#e8e8ef", border: "1px solid oklch(0.78 0.14 260 / 0.28)", borderLeft: `3px solid ${ACCENT}`, borderRadius: 4, fontSize: 13, lineHeight: 1.5 }}>
          {m.text}
        </div>
      </div>
    );
  }
  return (
    <div style={{ alignSelf: "flex-start", maxWidth: "84%", display: "grid", gridTemplateColumns: "24px minmax(0, 1fr)", gap: 10, alignItems: "flex-start" }}>
      <KairoMark size={24} />
      <div style={{ padding: "12px 14px", background: "linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.025))", color: "#ededef", border: "1px solid rgba(255,255,255,.08)", borderLeft: "3px solid rgba(255,255,255,.16)", borderRadius: 4, fontSize: 13, lineHeight: 1.6, boxShadow: "inset 0 1px 0 rgba(255,255,255,.04)" }}>
        <div>
          <KairoMarkdown text={visibleText} />
          {animate && visibleText.length < m.text.length && (
            <span
              aria-hidden
              style={{
                display: "inline-block",
                width: 7,
                height: 14,
                marginLeft: 3,
                transform: "translateY(2px)",
                background: ACCENT,
                animation: "kairoCaretBlink 1s steps(1, end) infinite",
              }}
            />
          )}
        </div>
        {m.tasks && m.tasks.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {m.tasks.map((t, i) => (
              <div key={i} style={{ padding: "5px 10px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderLeft: `2px solid ${ACCENT}`, borderRadius: 3, fontSize: 12, color: "#c2c2c8", fontFamily: "var(--font-mono)" }}>
                ✦ {t.title} {t.scheduledDate ? `→ ${t.scheduledDate}` : "→ inbox"}
              </div>
            ))}
            <div style={{ fontSize: 11, color: "#6b6b72", marginTop: 2 }}>Added to your timeline</div>
          </div>
        )}
      </div>
    </div>
  );
}
