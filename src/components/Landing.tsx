import { useEffect, useRef, useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { enterDemo } from "../demo/demoFlag";
import { cn } from "../lib/utils";

/* ------------------------------------------------------------------ */
/*  Motion primitives                                                  */
/* ------------------------------------------------------------------ */

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const node = ref.current;
    if (!node || shown) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown]);

  return { ref, shown };
}

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      className={cn("transition-[opacity,transform] duration-500", className)}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(14px)",
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {children}
    </div>
  );
}

/* The hero loads into its final composition with one staggered reveal,
   then never animates again. */
function HeroRise({
  children,
  step,
  className,
}: {
  children: ReactNode;
  step: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        animation: `heroRise 520ms cubic-bezier(0.16, 1, 0.3, 1) ${
          90 + step * 70
        }ms both`,
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small shared pieces                                                */
/* ------------------------------------------------------------------ */

function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-ink-mute",
        className
      )}
    >
      {children}
    </p>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z" />
    </svg>
  );
}

function GoogleButton({
  onSignIn,
  busy,
  label = "Continue with Google",
  large = false,
}: {
  onSignIn: () => void;
  busy: boolean;
  label?: string;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSignIn}
      disabled={busy}
      className={cn(
        "group inline-flex items-center justify-center gap-2.5 rounded-[6px] bg-accent font-medium text-canvas",
        "shadow-[0_1px_2px_rgba(44,33,24,0.16)] transition-colors",
        "hover:bg-accent-deep disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        large ? "h-[52px] px-7 text-[15px]" : "h-12 px-6 text-[14px]"
      )}
    >
      {busy ? (
        <>
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Redirecting...
        </>
      ) : (
        <>
          <GoogleMark />
          {label}
        </>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Product specimen (built from the design system itself)             */
/* ------------------------------------------------------------------ */

const SPEC_DAYS = [
  { dow: "MON", num: "29", today: false, tasks: [{ t: "Week 11 review", meta: "09:00", tone: "ok" }] },
  { dow: "TUE", num: "30", today: false, tasks: [{ t: "PDSA TA Session", meta: "11:00", tone: "ok" }, { t: "Home errands", meta: "18:30", tone: "mut" }] },
  { dow: "WED", num: "01", today: true, tasks: [{ t: "OPPE2 Day 3", meta: "08:00 · P1", tone: "due" }, { t: "DBMS Live Session", meta: "10:00", tone: "ok" }, { t: "MAD I TA Session", meta: "14:00", tone: "ok" }] },
  { dow: "THU", num: "02", today: false, tasks: [{ t: "Model finetuning", meta: "13:00", tone: "ok" }] },
  { dow: "FRI", num: "03", today: false, tasks: [{ t: "Kubernetes chapter", meta: "16:00", tone: "mut" }, { t: "Weekly review", meta: "17:30", tone: "mut" }] },
];

const SPEC_INBOX = [
  { t: "post about lapstat", meta: "1d" },
  { t: "chapter 1 gilbert strang", meta: "4d" },
  { t: "rag", meta: "MANUAL" },
  { t: "model finetuning", meta: "2d" },
  { t: "docker", meta: "16d" },
];

function TaskToneDot({ tone }: { tone: string }) {
  const color =
    tone === "due"
      ? "var(--color-priority-1)"
      : tone === "mut"
        ? "var(--color-ink-dim)"
        : "var(--color-success)";
  return (
    <span
      aria-hidden
      className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}

function SpecimenTask({ title, meta, tone }: { title: string; meta: string; tone: string }) {
  return (
    <div className="rounded-[8px] border border-line-subtle bg-[var(--color-bg-elevated)] px-2.5 py-2 shadow-[0_1px_2px_rgba(44,33,24,0.06)]">
      <div className="flex gap-2">
        <TaskToneDot tone={tone} />
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium leading-[1.35] text-ink">{title}</p>
          <p className="mt-0.5 font-mono text-[9px] tracking-[0.05em] text-ink-mute">{meta}</p>
        </div>
      </div>
    </div>
  );
}

function ProductSpecimen() {
  return (
    <div
      className="overflow-hidden rounded-[16px] border border-line bg-fresh"
      style={{ boxShadow: "0 8px 28px rgba(44, 33, 24, 0.14), 0 40px 80px rgba(44, 33, 24, 0.10)" }}
      role="img"
      aria-label="Preview of the Pravah week timeline beside the inbox"
    >
      {/* Mini app header */}
      <div className="flex items-center gap-2.5 border-b border-line-subtle bg-[var(--color-bg-base)] px-4 py-2.5">
        <img src="/favicon.png" alt="" width={18} height={18} style={{ borderRadius: 4 }} />
        <span className="text-[12.5px] font-semibold tracking-[-0.01em] text-ink">Pravah</span>
        <div className="ml-1 flex rounded-[5px] border border-line-subtle bg-fill-soft p-[2px]">
          <span className="rounded-[4px] bg-accent/15 px-2 py-[2px] text-[9.5px] font-medium text-accent">Timeline</span>
          <span className="px-2 py-[2px] text-[9.5px] font-medium text-ink-dim">Goals</span>
        </div>
        <span className="ml-auto hidden font-mono text-[9px] tracking-[0.14em] text-ink-mute sm:block">
          WK 40 · 2026
        </span>
      </div>

      {/* Week + inbox */}
      <div className="flex">
        <div className="flex min-w-0 flex-1">
          {SPEC_DAYS.map((day) => (
            <div
              key={day.dow}
              className={cn(
                "min-w-[104px] flex-1 border-r border-line-subtle px-2 pb-3 pt-2",
                day.today && "bg-accent-dim"
              )}
            >
              <div className="mb-2 border-b border-line-subtle pb-1.5">
                <div className="flex items-baseline justify-between px-0.5">
                  <span
                    className={cn(
                      "font-mono text-[8.5px] tracking-[0.14em]",
                      day.today ? "text-accent" : "text-ink-dim"
                    )}
                  >
                    {day.dow}
                  </span>
                  <span
                    className={cn(
                      "tabular font-mono text-[13px] font-medium",
                      day.today ? "text-accent" : "text-ink"
                    )}
                  >
                    {day.num}
                  </span>
                </div>
                {day.today && (
                  <div className="mt-1 h-[2px] rounded-full bg-accent" style={{ width: "38%" }} />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {day.tasks.map((task) => (
                  <SpecimenTask key={task.t} title={task.t} meta={task.meta} tone={task.tone} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Inbox rail */}
        <div className="hidden w-[168px] shrink-0 flex-col border-l border-line-subtle bg-[var(--color-bg-surface)] md:flex">
          <div className="flex items-center gap-1.5 border-b border-line-subtle px-3 py-2.5">
            <span className="text-[11px] font-medium text-ink">Inbox</span>
            <span className="rounded-full bg-accent/15 px-1.5 py-[1px] font-mono text-[8.5px] text-accent">
              {SPEC_INBOX.length}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-1.5 p-2">
            {SPEC_INBOX.map((item) => (
              <div
                key={item.t}
                className="rounded-[7px] border border-line-subtle bg-[var(--color-bg-elevated)] px-2 py-1.5"
              >
                <p className="truncate text-[10px] font-medium text-ink">{item.t}</p>
                <p className="mt-0.5 font-mono text-[8px] tracking-[0.08em] text-ink-dim">
                  {item.meta}
                </p>
              </div>
            ))}
          </div>
          <div className="border-t border-line-subtle p-2">
            <div className="flex h-[30px] items-center justify-center rounded-[6px] bg-accent text-[10.5px] font-medium text-canvas">
              + New task
            </div>
          </div>
        </div>
      </div>

      {/* Status strip */}
      <div className="flex items-center gap-3 border-t border-line-subtle bg-[var(--color-bg-surface)] px-4 py-1.5 font-mono text-[8.5px] tracking-[0.1em] text-ink-mute">
        <span>CONVEX · SYNCED</span>
        <span className="ml-auto hidden sm:block">N NEW · K KAIRO · ←→ PAN</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sections                                                           */
/* ------------------------------------------------------------------ */

const LOOP_STEPS = [
  {
    num: "01",
    title: "Capture",
    body: "Anything tugging at your attention lands in the inbox, in seconds, from any tab.",
  },
  {
    num: "02",
    title: "Triage",
    body: "Decide what each commitment is. Give it a deadline, a priority, or a goal.",
  },
  {
    num: "03",
    title: "Commit",
    body: "Drop tasks onto real days. The timeline is the contract with your week.",
  },
  {
    num: "04",
    title: "Reflect",
    body: "Progress shows what actually moved, so next week starts honest.",
  },
];

function LoopSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 sm:px-10 lg:py-32">
      <Reveal>
        <Kicker>The loop</Kicker>
        <h2 className="mt-4 max-w-2xl text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-[1.12] tracking-[-0.02em] text-ink">
          Four moves, repeated until the week flows.
        </h2>
      </Reveal>

      <div className="relative mt-14">
        {/* The river: Pravah means flow. One line carries the loop. */}
        <svg
          aria-hidden
          className="pointer-events-none absolute left-0 right-0 top-[13px] hidden h-4 w-full lg:block"
          viewBox="0 0 1200 20"
          preserveAspectRatio="none"
        >
          <path
            d="M8 12 C 180 2, 300 20, 440 10 S 700 2, 840 12 S 1080 20, 1192 8"
            fill="none"
            stroke="var(--color-accent-primary)"
            strokeOpacity="0.3"
            strokeWidth="1.5"
          />
        </svg>

        <ol className="grid gap-x-10 gap-y-12 lg:grid-cols-4">
          {LOOP_STEPS.map((step, i) => (
            <Reveal key={step.num} delay={i * 90}>
              <li className="relative">
                <span
                  aria-hidden
                  className="hidden h-[7px] w-[7px] rounded-full bg-accent lg:block"
                  style={{ marginBottom: 22 }}
                />
                <p className="font-mono text-[11px] tracking-[0.18em] text-ink-dim">{step.num}</p>
                <h3 className="mt-2 text-[19px] font-semibold tracking-[-0.01em] text-ink">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-[30ch] text-[14.5px] leading-[1.65] text-ink-soft">
                  {step.body}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

const FACTS = [
  {
    label: "REALTIME SYNC",
    body: "Every change lands everywhere at once through Convex. No refresh, no merge anxiety.",
  },
  {
    label: "PRIVATE BY DEFAULT",
    body: "One workspace, yours. Calendar and Gmail access stay optional, separate, and revocable from Settings.",
  },
  {
    label: "KEYBOARD FIRST",
    body: "N for a new task, K for Kairo, arrow keys to pan the week. The mouse is welcome, not required.",
  },
];

function FactsSection() {
  return (
    <section className="border-y border-line-subtle bg-[var(--color-bg-surface)]">
      <div className="mx-auto grid w-full max-w-6xl gap-y-10 px-6 py-20 sm:px-10 lg:grid-cols-3 lg:gap-x-12">
        {FACTS.map((fact, i) => (
          <Reveal key={fact.label} delay={i * 90}>
            <div className="lg:border-l lg:border-line-subtle lg:pl-6 lg:first:border-l-0 lg:first:pl-0">
              <Kicker>{fact.label}</Kicker>
              <p className="mt-3 max-w-[38ch] text-[14.5px] leading-[1.65] text-ink-soft">
                {fact.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function KairoSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 sm:px-10 lg:py-32">
      <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
        <Reveal>
          <KairoSpecimen />
        </Reveal>
        <Reveal delay={120}>
          <div className="rounded-[16px] bg-accent-dim p-8 lg:p-10">
            <Kicker className="!text-accent">Kairo</Kicker>
            <h2 className="mt-4 text-[clamp(1.6rem,3vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
              A planner's assistant, not a chatbot toy.
            </h2>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-[1.7] text-ink-soft">
              Ask what's overdue, hand it a messy inbox, or let it sketch the
              week. Kairo proposes; you decide. Every suggestion is an ordinary
              task you can accept, move, or cancel.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function KairoSpecimen() {
  return (
    <div
      className="overflow-hidden rounded-[16px] border border-line bg-fresh"
      style={{ boxShadow: "0 8px 28px rgba(44, 33, 24, 0.12)" }}
      role="img"
      aria-label="Kairo proposing a task schedule, with accept and decline actions"
    >
      <div className="flex items-center gap-2 border-b border-line-subtle px-4 py-2.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[9px] font-semibold text-canvas">
          K
        </span>
        <span className="text-[12px] font-semibold text-ink">Kairo</span>
        <span className="ml-auto font-mono text-[8.5px] tracking-[0.14em] text-ink-mute">
          SUGGESTION
        </span>
      </div>
      <div className="space-y-3 px-4 py-4">
        <div className="rounded-[10px] border border-line-subtle bg-[var(--color-bg-elevated)] px-3.5 py-3">
          <p className="text-[12.5px] leading-[1.55] text-ink">
            Your Thursday is packed. Move "Draft launch notes" to Friday
            14:00, right after the review?
          </p>
        </div>
        <div className="rounded-[10px] border border-line-subtle bg-[var(--color-bg-elevated)] px-3.5 py-3">
          <p className="text-[12.5px] leading-[1.55] text-ink">
            Two inbox items fit Thursday's open slot at 16:00.
          </p>
        </div>
        <div className="flex gap-2 pt-1">
          <span className="inline-flex h-8 items-center rounded-[6px] bg-accent px-4 text-[11.5px] font-medium text-canvas">
            Accept both
          </span>
          <span className="inline-flex h-8 items-center rounded-[6px] border border-line bg-paper px-4 text-[11.5px] font-medium text-ink">
            Decline
          </span>
        </div>
      </div>
    </div>
  );
}

/* 92-day consistency heatmap in the copper ramp from the design system. */
function ProgressSection() {
  const ramp = ["#e69867", "#c27746", "#a35a28", "#844417"];
  const weeks = 26;
  // Deterministic pseudo-random so the grid is stable between renders.
  const seeded = (i: number) => {
    const x = Math.sin(i * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };

  return (
    <section className="border-t border-line-subtle">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-24 sm:px-10 lg:grid-cols-[1fr_1.1fr] lg:py-32">
        <Reveal>
          <Kicker>Progress</Kicker>
          <h2 className="mt-4 text-[clamp(1.6rem,3vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
            Momentum you can see. No streaks, no confetti.
          </h2>
          <p className="mt-4 max-w-[44ch] text-[15px] leading-[1.7] text-ink-soft">
            A season of work renders as one quiet grid. Completion rate,
            velocity, and rhythm stay honest, because the numbers come from the
            timeline you actually kept.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div
            className="rounded-[16px] border border-line bg-fresh p-6"
            style={{ boxShadow: "0 8px 28px rgba(44, 33, 24, 0.1)" }}
          >
            <div className="flex gap-[4px]">
              {Array.from({ length: weeks }, (_, w) => (
                <div key={w} className="flex flex-1 flex-col gap-[4px]">
                  {Array.from({ length: 7 }, (_, d) => {
                    const v = seeded(w * 7 + d);
                    const level = v < 0.24 ? 0 : v < 0.5 ? 1 : v < 0.74 ? 2 : v < 0.9 ? 3 : 4;
                    const background =
                      level === 0 ? "var(--color-fill-soft)" : ramp[level - 1];
                    return (
                      <span
                        key={d}
                        aria-hidden
                        className="aspect-square w-full rounded-[2.5px]"
                        style={{ background }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between font-mono text-[8.5px] tracking-[0.14em] text-ink-mute">
              <span>26 WEEKS</span>
              <span className="flex items-center gap-1.5">
                QUIET
                <span className="flex gap-[3px]">
                  {["var(--color-fill-soft)", ...ramp].map((c) => (
                    <span
                      key={c}
                      className="h-2 w-2 rounded-[2px]"
                      style={{ background: c }}
                    />
                  ))}
                </span>
                STEADY
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Landing                                                            */
/* ------------------------------------------------------------------ */

export function Landing() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
        errorCallbackURL: "/",
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Could not sign you in with Google.");
      }
      // Successful sign-in redirects away from this page.
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed.";
      setError(message);
      setBusy(false);
    }
  };

  const now = new Date();
  const weekNum = getWeekNumber(now);

  return (
    <div className="h-screen overflow-y-auto bg-[var(--color-bg-base)] text-ink">
      {/* ---------------- Nav ---------------- */}
      <header className="sticky top-0 z-30 border-b border-line-subtle bg-[var(--color-bg-base)]">
        <div className="mx-auto flex h-[56px] w-full max-w-6xl items-center gap-3 px-6 sm:px-10">
          <img src="/favicon.png" alt="" width={22} height={22} style={{ borderRadius: 5 }} />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Pravah</span>
          <span className="ml-auto hidden font-mono text-[10px] tracking-[0.18em] text-ink-mute sm:block">
            PRIVATE WORKSPACE
          </span>
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="ml-4 inline-flex h-9 items-center rounded-[6px] border border-line bg-paper px-4 text-[13px] font-medium text-ink transition-colors hover:bg-fill-soft hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          >
            Sign in
          </button>
        </div>
      </header>

      <main>
        {/* ---------------- Hero ---------------- */}
        <section className="mx-auto w-full max-w-6xl px-6 pb-24 pt-16 sm:px-10 lg:pb-32 lg:pt-24">
          <div className="max-w-3xl">
            <HeroRise step={0}>
              <Kicker>Timeline-first personal planning</Kicker>
            </HeroRise>
            <HeroRise step={1}>
              <h1 className="mt-5 text-[clamp(2.6rem,5.6vw,4.4rem)] font-semibold leading-[1.04] tracking-[-0.035em] text-ink">
                Enter the workspace before the week enters you.
              </h1>
            </HeroRise>
            <HeroRise step={2}>
              <p className="mt-6 max-w-[52ch] text-[16px] leading-[1.7] text-ink-soft">
                Pravah turns loose commitments into a week you can trust.
                Capture the task, give it a place on the timeline, and let
                the rest of the day go quiet.
              </p>
            </HeroRise>
            <HeroRise step={3}>
              <div className="mt-9 flex flex-wrap items-center gap-5">
                <GoogleButton onSignIn={handleGoogleSignIn} busy={busy} large label="Start planning" />
                <span className="font-mono text-[10px] tracking-[0.18em] text-ink-dim">
                  ONE GOOGLE SIGN-IN · NO SETUP
                </span>
              </div>
              {import.meta.env.DEV && (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => {
                      enterDemo();
                      window.location.reload();
                    }}
                    className="rounded-[6px] border border-line px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-mute transition-colors hover:bg-fill-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"
                  >
                    Enter demo workspace (local only)
                  </button>
                </div>
              )}
              {error && (
                <p className="mt-4 max-w-md rounded-[6px] border border-error/30 bg-error-muted px-3 py-2 text-[13px] text-error">
                  {error}
                </p>
              )}
            </HeroRise>
          </div>

          <HeroRise step={4} className="mt-16">
            <ProductSpecimen />
          </HeroRise>
        </section>

        <LoopSection />
        <FactsSection />
        <KairoSection />
        <ProgressSection />

        {/* ---------------- Closing CTA ---------------- */}
        <section className="border-t border-line-subtle bg-[var(--color-bg-surface)]">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start px-6 py-24 sm:px-10 lg:py-32">
            <Reveal>
              <h2 className="max-w-3xl text-[clamp(2rem,4.4vw,3.4rem)] font-semibold leading-[1.08] tracking-[-0.03em] text-ink">
                A calmer way to keep your week in view.
              </h2>
              <p className="mt-5 max-w-[52ch] text-[15.5px] leading-[1.7] text-ink-soft">
                Sign in with Google and the desk is yours. Calendar and Gmail
                permissions stay separate, and can be granted later from
                Settings.
              </p>
              <div className="mt-9">
                <GoogleButton onSignIn={handleGoogleSignIn} busy={busy} large />
              </div>
              {error && (
                <p className="mt-4 max-w-md rounded-[6px] border border-error/30 bg-error-muted px-3 py-2 text-[13px] text-error">
                  {error}
                </p>
              )}
            </Reveal>
          </div>
        </section>
      </main>

      {/* ---------------- Footer ---------------- */}
      <footer className="border-t border-line-subtle">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-8 font-mono text-[10px] tracking-[0.16em] text-ink-dim sm:flex-row sm:items-center sm:px-10">
          <span>PRAVAH · TIMELINE-FIRST PLANNING</span>
          <span className="sm:ml-auto">
            WK {String(weekNum).padStart(2, "0")} · {now.getFullYear()} · SINGLE USER BY DESIGN
          </span>
        </div>
      </footer>
    </div>
  );
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
