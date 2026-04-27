import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../../convex/_generated/api";
import { getLocalDateString } from "../lib/utils";
import type { Task } from "../types";

const ACCENT = "oklch(0.78 0.14 260)";
const ACCENT_SOFT = "oklch(0.72 0.16 260 / 0.2)";
const ACCENT_GLOW = "oklch(0.78 0.14 260 / 0.35)";
const STORAGE_KEY = "pravah:anthropic-key";

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
- Keep responses short — 2-4 sentences for simple questions, a short paragraph max for analysis
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

export function Kairo({ onActiveChange, tasks, inboxTasks }: KairoProps) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [msgs, setMsgs] = useState<Message[]>([
    { from: "kairo", text: "Hey, I'm Kairo. I can help you plan your week, prioritize tasks, or analyze your schedule. What do you need?" },
  ]);
  const [thinking, setThinking] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");
  const [showKeyInput, setShowKeyInput] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addTask = useMutation(api.tasks.addTask);

  useEffect(() => { onActiveChange?.(open); }, [open, onActiveChange]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 200); }, [open]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, thinking]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("pravah:open-kairo", onOpen);
    return () => window.removeEventListener("pravah:open-kairo", onOpen);
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
    const key = apiKey.trim();

    setMsgs(m => [...m, { from: "me", text }]);
    setVal("");
    setThinking(true);

    if (!key) {
      await new Promise(r => setTimeout(r, 400));
      setMsgs(m => [...m, {
        from: "kairo",
        text: "I need an Anthropic API key to respond. Click the key icon to add yours — it stays in your browser and is never sent anywhere except directly to Anthropic.",
      }]);
      setThinking(false);
      setShowKeyInput(true);
      return;
    }

    try {
      const context = buildContext(tasks, inboxTasks);
      const systemPrompt = SYSTEM_PROMPT.replace("{CONTEXT}", context);

      const history = msgs
        .slice(1)
        .map(m => ({ role: m.from === "me" ? "user" : "assistant", content: m.text }));

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: systemPrompt,
          messages: [...history, { role: "user", content: text }],
        }),
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

      const data = await res.json() as { content: Array<{ type: string; text: string }> };
      const rawText = data.content.find(c => c.type === "text")?.text ?? "";

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
    } catch (err) {
      setMsgs(m => [...m, { from: "kairo", text: "Something went wrong reaching the Anthropic API. Check your key and connection." }]);
    } finally {
      setThinking(false);
    }
  };

  const handleSaveKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem(STORAGE_KEY, key);
    setShowKeyInput(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          background: open ? "rgba(0,0,0,.55)" : "rgba(0,0,0,0)",
          backdropFilter: open ? "blur(12px)" : "blur(0px)",
          WebkitBackdropFilter: open ? "blur(12px)" : "blur(0px)",
          transition: "background .4s ease, backdrop-filter .4s ease",
          zIndex: 40,
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: open ? "50%" : 36,
          transform: open ? "translate(-50%, 50%)" : "translate(-50%, 0)",
          width: open ? 720 : 380,
          zIndex: 50,
          transition: "width .45s cubic-bezier(.22,1,.36,1), bottom .45s cubic-bezier(.22,1,.36,1)",
        }}
      >
        <div
          style={{
            background: "#101013",
            border: "1px solid rgba(255,255,255,.13)",
            borderRadius: 20,
            boxShadow: open
              ? `0 40px 80px rgba(0,0,0,.55), 0 0 0 1px oklch(0.78 0.14 260 / 0.35), 0 0 80px oklch(0.78 0.14 260 / 0.3)`
              : "0 20px 50px rgba(0,0,0,.5)",
            overflow: "hidden",
            transition: "box-shadow .3s ease",
          }}
        >
          {/* Header when open */}
          {open && (
            <>
              <div style={{ padding: "14px 20px 0", display: "flex", alignItems: "center", gap: 10 }}>
                <KairoMark size={28} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: -0.2 }}>Kairo</div>
                  <div style={{ fontSize: 10.5, color: "#6b6b72", fontFamily: "var(--font-mono)", letterSpacing: 1, display: "flex", alignItems: "center", gap: 5 }}>
                    <PulsingDot color="oklch(0.78 0.18 150)" size={5} />
                    ONLINE · claude-sonnet-4-6
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <button
                  title="Set API key"
                  onClick={() => setShowKeyInput(v => !v)}
                  style={{ width: 24, height: 24, borderRadius: 6, background: "transparent", border: "1px solid rgba(255,255,255,.07)", color: apiKey ? "oklch(0.78 0.18 150)" : "#6b6b72", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}
                >
                  🔑
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Minimize"
                  style={{ width: 24, height: 24, borderRadius: 6, background: "transparent", border: "1px solid rgba(255,255,255,.07)", color: "#6b6b72", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}
                >
                  —
                </button>
              </div>

              {/* API key input (inline) */}
              <AnimatePresence>
                {showKeyInput && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ overflow: "hidden" }}
                  >
                    <ApiKeyInput current={apiKey} onSave={handleSaveKey} onCancel={() => setShowKeyInput(false)} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Messages */}
              <div
                ref={scrollRef}
                style={{ maxHeight: 380, overflowY: "auto", padding: "14px 20px", display: "flex", flexDirection: "column", gap: 14 }}
              >
                {msgs.map((m, i) => (
                  <KairoMsg key={i} m={m} />
                ))}
                {thinking && (
                  <div style={{ alignSelf: "flex-start", padding: "10px 14px", background: "rgba(255,255,255,.04)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, fontSize: 13, color: "#6b6b72", display: "flex", gap: 5, alignItems: "center" }}>
                    <PulsingDot color={ACCENT} size={6} />
                    <PulsingDot color={ACCENT} size={6} />
                    <PulsingDot color={ACCENT} size={6} />
                  </div>
                )}
              </div>

              {/* Starter chips */}
              {msgs.length === 1 && !thinking && (
                <div style={{ padding: "0 20px 12px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {STARTER_PROMPTS.map(p => (
                    <button
                      key={p}
                      onClick={() => sendMessage(p)}
                      style={{
                        padding: "6px 12px",
                        background: "rgba(255,255,255,.03)",
                        border: "1px solid rgba(255,255,255,.07)",
                        borderRadius: 99,
                        fontSize: 11.5,
                        color: "#c2c2c8",
                        cursor: "pointer",
                        fontFamily: "var(--font-sans)",
                        transition: "background .15s, border-color .15s",
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
              gap: 10,
              padding: "10px 14px",
              borderTop: open ? "1px solid rgba(255,255,255,.07)" : "none",
            }}
          >
            {!open && <KairoMark size={26} />}
            <input
              ref={inputRef}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onFocus={() => setOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage(val.trim());
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder={open ? "Tell Kairo what to do…" : "Ask Kairo…  ⌘J"}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 14,
                color: "#ededef",
                fontFamily: "var(--font-sans)",
                padding: "6px 0",
              }}
            />
            {open ? (
              <button
                onClick={() => sendMessage(val.trim())}
                disabled={!val.trim()}
                style={{
                  padding: "6px 12px",
                  fontSize: 11,
                  fontFamily: "var(--font-sans)",
                  fontWeight: 600,
                  color: val.trim() ? "#0a0a0b" : "#6b6b72",
                  background: val.trim() ? ACCENT : "rgba(255,255,255,.07)",
                  border: "none",
                  borderRadius: 6,
                  cursor: val.trim() ? "pointer" : "not-allowed",
                  transition: "background .15s, color .15s",
                }}
              >
                SEND
              </button>
            ) : (
              <kbd>⌘J</kbd>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function KairoMsg({ m }: { m: Message }) {
  if (m.from === "me") {
    return (
      <div style={{ alignSelf: "flex-end", maxWidth: "78%" }}>
        <div style={{ padding: "10px 14px", background: ACCENT_SOFT, color: ACCENT, border: "1px solid oklch(0.78 0.14 260 / 0.3)", borderRadius: 14, fontSize: 13, lineHeight: 1.5 }}>
          {m.text}
        </div>
      </div>
    );
  }
  return (
    <div style={{ alignSelf: "flex-start", maxWidth: "82%", display: "flex", gap: 9, alignItems: "flex-start" }}>
      <KairoMark size={22} />
      <div style={{ padding: "10px 14px", background: "rgba(255,255,255,.04)", color: "#ededef", border: "1px solid rgba(255,255,255,.07)", borderRadius: 14, fontSize: 13, lineHeight: 1.55 }}>
        <div>{m.text}</div>
        {m.tasks && m.tasks.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {m.tasks.map((t, i) => (
              <div key={i} style={{ padding: "5px 10px", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.07)", borderLeft: `2px solid ${ACCENT}`, borderRadius: 5, fontSize: 12, color: "#c2c2c8", fontFamily: "var(--font-mono)" }}>
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

function ApiKeyInput({ current, onSave, onCancel }: { current: string; onSave: (key: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState(current);

  return (
    <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,.07)", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 11, color: "#6b6b72", fontFamily: "var(--font-mono)", letterSpacing: 0.5 }}>
        ANTHROPIC API KEY — stored locally in your browser only
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="sk-ant-api03-…"
          type="password"
          autoFocus
          style={{
            flex: 1,
            background: "rgba(255,255,255,.04)",
            border: "1px solid rgba(255,255,255,.13)",
            borderRadius: 6,
            padding: "7px 10px",
            color: "#ededef",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            outline: "none",
          }}
          onFocus={(e) => (e.target.style.borderColor = "oklch(0.78 0.14 260 / 0.5)")}
          onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,.13)")}
          onKeyDown={(e) => { if (e.key === "Enter") onSave(val); if (e.key === "Escape") onCancel(); }}
        />
        <button
          onClick={() => onSave(val)}
          style={{ padding: "7px 12px", background: ACCENT, border: "none", borderRadius: 6, color: "#0a0a0b", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-sans)" }}
        >
          Save
        </button>
        <button
          onClick={onCancel}
          style={{ padding: "7px 10px", background: "transparent", border: "1px solid rgba(255,255,255,.07)", borderRadius: 6, color: "#6b6b72", fontSize: 11, cursor: "pointer" }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
