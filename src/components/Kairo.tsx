import { SkeletonBlock, LoadingRegion } from "./ui/Skeleton";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { T_FAST, T_SLOW, T_EXIT_FAST, tx } from "../lib/motion";
import type { Task } from "../types";
import {
  KAIRO_CONFIG_EVENT,
  getKairoProviderLabel,
  getKairoConfig,
  isKairoConfigured,
} from "../lib/kairoConfig";
import {
  buildAnthropicRequestBody,
  buildGeminiRequestBody,
  buildGeminiRequestUrl,
  buildOpenAIRequestBody,
  readKairoResponseText,
} from "../lib/kairoProviderRuntime";
import {
  buildKairoHistory,
  buildKairoSystemPrompt,
  parseKairoTaskProposals,
} from "../lib/kairoCapability";
import {
  type WebKairoMessage,
  useKairoTaskProposalDecisions,
} from "../hooks/useKairoTaskProposalDecisions";
import { KairoTaskProposalList } from "./KairoTaskProposalList";
import { ChevronDownIcon } from "./ui/icons";
import {
  settingsKairoIcon,
  appSettingsIcon,
  kairoKeyIcon,
} from "./ui/traced-icons";
import type { SettingsCategory } from "./settings/SettingsPage";

const KairoMarkGlyph = settingsKairoIcon;
const KairoKeyGlyph = kairoKeyIcon;
const AppSettingsGlyph = appSettingsIcon;
const ACCENT = "var(--color-accent-primary)";
const ACCENT_SOFT = "var(--color-accent-primary-muted)";

interface KairoProps {
  onActiveChange?: (active: boolean) => void;
  tasks: Task[];
  inboxTasks: Task[];
  onOpenSettings?: (category?: SettingsCategory) => void;
}

function KairoMark({ size = 24 }: { size?: number }) {
  // Mobile's quiet settings-kairo glyph instead of the old gradient coin.
  return <KairoMarkGlyph size={size} style={{ color: "var(--color-text-secondary)", flexShrink: 0 }} />;
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
        color: "var(--color-text-dim)",
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
          background: "rgba(var(--color-accent-primary-rgb), 0.82)",
          boxShadow: "0 0 10px rgba(var(--color-accent-primary-rgb), 0.35)",
          opacity: isWaiting ? undefined : 1,
          animation: isWaiting ? "kairoCaretBlink 1.05s steps(1, end) infinite" : "none",
        }}
      />
    </div>
  );
}

function KairoThinking() {
  return <LoadingRegion label="Kairo is thinking" className="w-[min(420px,82%)] self-start rounded-xl border border-line-subtle bg-[var(--color-bg-surface)] px-3.5 py-3">
    <p className="mb-3 text-xs text-ink-mute">Thinking…</p>
    <div className="space-y-2">
      <SkeletonBlock width="92%" height={8} />
      <SkeletonBlock width="74%" height={8} />
      <SkeletonBlock width="48%" height={8} />
    </div>
  </LoadingRegion>;
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
        <code key={index} style={{ padding: "1px 4px", background: "var(--color-fill-soft)", border: "1px solid var(--color-border-default)", borderRadius: 3, color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)", fontSize: "0.92em" }}>
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index} style={{ color: "var(--color-text-primary)", fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
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
      blocks.push(<div key={`h-${blocks.length}`} style={{ marginTop: blocks.length ? 8 : 0, color: "var(--color-text-primary)", fontWeight: 700, fontSize: 13 }}>{renderInlineMarkdown(trimmed.slice(4))}</div>);
      return;
    }

    blocks.push(<p key={`p-${blocks.length}`} style={{ margin: blocks.length ? "7px 0 0" : 0 }}>{renderInlineMarkdown(trimmed)}</p>);
  });

  flushList();
  return <>{blocks}</>;
}

export function Kairo({ onActiveChange, tasks, inboxTasks, onOpenSettings }: KairoProps) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [msgs, setMsgs] = useState<WebKairoMessage[]>([
    { from: "kairo", text: "Hey, I'm Kairo. I can help you plan your week, prioritize tasks, or analyze your schedule. What do you need?" },
  ]);
  const [thinking, setThinking] = useState(false);
  const [config, setConfig] = useState(() => getKairoConfig());
  const animatedPlaceholder = useTypingPlaceholder(!open && val.length === 0);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const decideTaskProposal = useKairoTaskProposalDecisions(msgs, setMsgs);

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
    if (!text.trim() || thinking) return;
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
      const systemPrompt = buildKairoSystemPrompt(tasks, inboxTasks);
      const history = buildKairoHistory(msgs);

      const requestBody = nextConfig.providerFormat === "anthropic"
        ? buildAnthropicRequestBody(nextConfig, systemPrompt, history, text)
        : nextConfig.providerFormat === "gemini"
          ? buildGeminiRequestBody(nextConfig, systemPrompt, history, text)
          : buildOpenAIRequestBody(nextConfig, systemPrompt, history, text);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (nextConfig.providerFormat === "anthropic") {
        headers["x-api-key"] = nextConfig.apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else if (nextConfig.providerFormat === "openai") {
        headers["Authorization"] = `Bearer ${nextConfig.apiKey}`;
      }

      const requestUrl =
        nextConfig.providerFormat === "gemini"
          ? buildGeminiRequestUrl(nextConfig.baseUrl, nextConfig.model, nextConfig.apiKey)
          : nextConfig.baseUrl;

      const res = await fetch(requestUrl, {
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

      const { text: cleanText, proposals } = parseKairoTaskProposals(rawText);
      setMsgs(m => [
        ...m,
        { from: "kairo", text: cleanText, tasks: proposals.length ? proposals : undefined },
      ]);
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
              background: "var(--color-bg-overlay)",
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
              ? "linear-gradient(180deg, var(--color-bg-surface) 0%, var(--color-bg-base) 100%)"
              : "var(--color-bg-surface)",
            border: open
              ? "1px solid var(--color-accent-primary)"
              : "1px solid var(--color-border-default)",
            borderRadius: open ? 14 : 12,
            boxShadow: open
              ? `0 46px 90px rgba(39, 30, 22, 0.32), 0 0 0 1px var(--color-border-subtle)`
              : `0 16px 40px rgba(39, 30, 22, 0.22), 0 1px 2px rgba(44, 33, 24, 0.12)`,
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
                    "linear-gradient(var(--color-fill-faint) 1px, transparent 1px), linear-gradient(90deg, var(--color-fill-faint) 1px, transparent 1px)",
                  backgroundSize: "48px 48px",
                  opacity: 0.26,
                }}
              />
            </>
          )}
          {/* Header when open */}
          {open && (
            <>
              <div style={{ position: "relative", padding: "18px 20px 14px 24px", display: "flex", alignItems: "flex-start", gap: 13, borderBottom: "1px solid var(--color-border-subtle)" }}>
                <KairoMark size={30} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2, color: "var(--color-text-primary)" }}>Kairo</div>
                    <span
                      style={{
                        border: "1px solid var(--color-border-default)",
                        background: "var(--color-fill-faint)",
                        color: isKairoConfigured(config) ? "var(--color-success)" : "var(--color-error)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 9,
                        letterSpacing: 1.2,
                        padding: "3px 6px",
                      }}
                    >
                      {isKairoConfigured(config) ? "ONLINE" : "SETUP"}
                    </span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: 10.5, color: "var(--color-text-dim)", fontFamily: "var(--font-mono)", letterSpacing: 1, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                    <PulsingDot color={isKairoConfigured(config) ? "var(--color-success)" : "var(--color-error)"} size={5} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {isKairoConfigured(config) ? `${getKairoProviderLabel(config.providerFormat)} · ${config.model}` : "Provider config required"}
                    </span>
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <button
                  title="Open settings"
                  aria-label="Open settings"
                  onClick={() => onOpenSettings?.("kairo")}
                  style={{ width: 26, height: 26, borderRadius: 7, background: "var(--color-fill-faint)", border: "1px solid var(--color-border-default)", color: isKairoConfigured(config) ? "var(--color-text-secondary)" : "var(--color-accent-primary)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <AppSettingsGlyph size={13} />
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Minimize"
                  style={{ width: 26, height: 26, borderRadius: 7, background: "var(--color-fill-faint)", border: "1px solid var(--color-border-default)", color: "var(--color-text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <ChevronDownIcon size={14} strokeWidth={2} />
                </button>
              </div>

              {!isKairoConfigured(config) && (
                <button
                  onClick={() => {
                    setOpen(false);
                    onOpenSettings?.("kairo");
                  }}
                  aria-label="Set up Kairo"
                  style={{
                    position: "relative",
                    margin: "14px 20px 0 24px",
                    padding: "11px 12px",
                    background: "var(--color-warning-muted)",
                    border: "1px solid var(--color-warning)",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: tx(["background-color"], "instant"),
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "rgba(128, 87, 18, 0.2)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "var(--color-warning-muted)";
                  }}
                >
                  <KairoKeyGlyph size={16} style={{ color: "var(--color-warning)", flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, color: "var(--color-text-primary)", lineHeight: 1.5 }}>
                    Open Settings → Kairo and finish provider setup
                  </span>
                  <span style={{ color: "var(--color-warning)", fontFamily: "var(--font-mono)", fontSize: 12 }}>→</span>
                </button>
              )}

              {/* Messages */}
              <div
                ref={scrollRef}
                style={{ position: "relative", maxHeight: 430, overflowY: "auto", padding: "18px 22px 16px 24px", display: "flex", flexDirection: "column", gap: 14 }}
              >
                {msgs.map((m, i) => (
                  <KairoMsg
                    key={i}
                    m={m}
                    animate={m.from === "kairo" && i === msgs.length - 1 && !thinking}
                    onTaskDecision={(proposalIndex, decision) =>
                      void decideTaskProposal(i, proposalIndex, decision)
                    }
                  />
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
                        background: "var(--color-fill-faint)",
                        border: "1px solid var(--color-border-subtle)",
                        borderRadius: 4,
                        fontSize: 11.5,
                        color: "var(--color-text-secondary)",
                        cursor: "pointer",
                        fontFamily: "var(--font-sans)",
                        transition: tx(["background-color", "border-color"], "instant"),
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(var(--color-accent-primary-rgb), 0.55)";
                        (e.currentTarget as HTMLButtonElement).style.background = ACCENT_SOFT;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border-subtle)";
                        (e.currentTarget as HTMLButtonElement).style.background = "var(--color-fill-faint)";
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
              borderTop: open ? "1px solid var(--color-border-default)" : "none",
              background: open ? "rgba(39, 30, 22, 0.1)" : "transparent",
              position: "relative",
            }}
          >
            {!open && <KairoMark size={30} />}
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
                  color: open ? "var(--color-text-primary)" : "transparent",
                  caretColor: "var(--color-text-primary)",
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
                  padding: "8px 16px",
                  minWidth: 64,
                  fontSize: 11.5,
                  fontFamily: "var(--font-sans)",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  color: "var(--color-text-inverse)",
                  background: val.trim() ? ACCENT : "var(--color-border-subtle)",
                  border: "none",
                  borderRadius: 8,
                  cursor: val.trim() ? "pointer" : "not-allowed",
                  transition: tx(["background-color", "color"], "instant"),
                }}
              >
                Send
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

function KairoMsg({
  m,
  animate = false,
  onTaskDecision,
}: {
  m: WebKairoMessage;
  animate?: boolean;
  onTaskDecision: (proposalIndex: number, decision: "apply" | "decline") => void;
}) {
  const visibleText = useRevealText(m.text, animate);

  if (m.from === "me") {
    return (
      <div style={{ alignSelf: "flex-end", maxWidth: "78%" }}>
        <div style={{ padding: "11px 13px", background: "var(--color-accent-primary-muted)", color: "var(--color-text-primary)", border: "1px solid rgba(var(--color-accent-primary-rgb), 0.28)", borderLeft: `3px solid ${ACCENT}`, borderRadius: 4, fontSize: 13, lineHeight: 1.5 }}>
          {m.text}
        </div>
      </div>
    );
  }
  return (
    <div style={{ alignSelf: "flex-start", maxWidth: "84%", display: "grid", gridTemplateColumns: "24px minmax(0, 1fr)", gap: 10, alignItems: "flex-start" }}>
      <KairoMark size={24} />
      <div style={{ padding: "12px 14px", background: "linear-gradient(180deg, var(--color-fill-soft), var(--color-fill-faint))", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)", borderLeft: "3px solid var(--color-border-strong)", borderRadius: 4, fontSize: 13, lineHeight: 1.6, boxShadow: "inset 0 1px 0 var(--color-fill-soft)" }}>
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
          <KairoTaskProposalList proposals={m.tasks} onDecision={onTaskDecision} />
        )}
      </div>
    </div>
  );
}
