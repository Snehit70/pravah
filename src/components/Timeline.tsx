import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { TopNavbar, type AppPage } from "./TopNavbar";
import { GridDayColumn } from "./DayColumn";
import type { Task } from "../types";
import { generateDateRange, getLocalDateString } from "../lib/utils";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_NAMES = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const COL_W = 136;

interface TimelineProps {
  tasksByDate: Record<string, Task[]>;
  onTaskClick: (task: Task) => void;
  onOpenQuickAdd?: () => void;
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  onOpenSettings?: () => void;
  mcpConnected?: boolean;
}

function PulsingDot({ color, size = 7, pulseKey }: { color: string; size?: number; pulseKey?: number | string }) {
  return (
    <span style={{ display: "inline-block", position: "relative", width: size, height: size, flexShrink: 0 }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: 99, background: color }} />
      <span
        key={pulseKey}
        style={{
          position: "absolute", inset: 0, borderRadius: 99, background: color,
          animation: "pravahPulse 2s ease-out infinite", opacity: 0.5,
        }}
      />
    </span>
  );
}

function formatAge(ms: number): string {
  if (ms < 2000) return "now";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

export function Timeline({
  tasksByDate,
  onTaskClick,
  onOpenQuickAdd,
  activePage,
  onNavigate,
  onOpenSettings,
  mcpConnected = true,
}: TimelineProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const today = getLocalDateString();

  const [lastSyncedAt, setLastSyncedAt] = useState(() => Date.now());
  const [syncTick, setSyncTick] = useState(0);
  const [, setNowTick] = useState(0);

  useEffect(() => {
    setLastSyncedAt(Date.now());
    setSyncTick((n) => n + 1);
  }, [tasksByDate]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => n + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  const syncAge = Date.now() - lastSyncedAt;
  const convexColor =
    syncAge < 30_000
      ? "oklch(0.78 0.18 150)"
      : syncAge < 120_000
      ? "oklch(0.78 0.15 60)"
      : "oklch(0.72 0.2 25)";
  const mcpColor = mcpConnected ? "oklch(0.78 0.18 150)" : "oklch(0.72 0.2 25)";

  const dates = useMemo(() => generateDateRange(14, 28), []);

  const scrollAnimRef = useRef(0);
  const scrollToToday = useCallback((smooth = true) => {
    const el = scrollerRef.current;
    if (!el) return;
    const todayEl = el.querySelector<HTMLElement>("[data-today='1']");
    if (!todayEl) return;
    const target = Math.max(0, todayEl.offsetLeft - el.clientWidth / 2 + todayEl.clientWidth / 2);
    if (!smooth) {
      el.scrollLeft = target;
      return;
    }
    cancelAnimationFrame(scrollAnimRef.current);
    const start = el.scrollLeft;
    const distance = target - start;
    if (Math.abs(distance) < 1) return;
    const duration = Math.min(700, 220 + Math.abs(distance) * 0.35);
    const t0 = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      el.scrollLeft = start + distance * easeOutCubic(t);
      if (t < 1) scrollAnimRef.current = requestAnimationFrame(tick);
    };
    scrollAnimRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    scrollToToday(false);
  }, [scrollToToday]);

  // Right-click drag to pan
  const panState = useRef({ panning: false, startX: 0, startScroll: 0, velocity: 0, lastX: 0, lastT: 0, raf: 0 });
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 2) return;
    const ps = panState.current;
    ps.panning = true;
    ps.startX = e.pageX;
    ps.startScroll = scrollerRef.current?.scrollLeft ?? 0;
    ps.lastX = e.pageX;
    ps.lastT = performance.now();
    ps.velocity = 0;
    cancelAnimationFrame(ps.raf);
    if (scrollerRef.current) scrollerRef.current.style.cursor = "grabbing";
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    const ps = panState.current;
    if (!ps.panning) return;
    e.preventDefault();
    const now = performance.now();
    const dt = now - ps.lastT;
    if (dt > 0) ps.velocity = (e.pageX - ps.lastX) / dt;
    ps.lastX = e.pageX;
    ps.lastT = now;
    if (scrollerRef.current) {
      scrollerRef.current.scrollLeft = ps.startScroll - (e.pageX - ps.startX) * 1.4;
    }
  };
  const handleMouseUp = () => {
    const ps = panState.current;
    if (!ps.panning) return;
    ps.panning = false;
    if (scrollerRef.current) scrollerRef.current.style.cursor = "auto";
    let v = -ps.velocity * 18;
    const friction = 0.93;
    const tick = () => {
      if (Math.abs(v) < 0.4 || !scrollerRef.current) return;
      scrollerRef.current.scrollLeft += v;
      v *= friction;
      ps.raf = requestAnimationFrame(tick);
    };
    ps.raf = requestAnimationFrame(tick);
  };

  // Wheel → horizontal scroll
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (e.metaKey || e.ctrlKey) return;
      const el = scrollerRef.current;
      if (!el) return;
      if (e.key === "ArrowRight") { e.preventDefault(); el.scrollBy({ left: COL_W * 3, behavior: "smooth" }); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); el.scrollBy({ left: -COL_W * 3, behavior: "smooth" }); }
      else if (e.key === "t" || e.key === "T") { e.preventDefault(); scrollToToday(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scrollToToday]);

  const allScheduled = Object.values(tasksByDate).flat();
  const openCount = allScheduled.filter(t => t.type === "open" && t.status !== "completed").length;
  const deadlineCount = allScheduled.filter(t => t.type === "deadline" && t.status !== "completed").length;
  const todayTasks = tasksByDate[today] ?? [];
  const doneTodayCount = todayTasks.filter(t => t.status === "completed").length;

  return (
    <div className="h-full flex flex-col" style={{ background: "transparent" }}>
      <TopNavbar
        activePage={activePage}
        onNavigate={onNavigate}
        onOpenSettings={onOpenSettings}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left rail */}
        <div
          className="flex flex-col shrink-0 overflow-hidden"
          style={{
            width: 180,
            borderRight: "1px solid rgba(255,255,255,.07)",
            background: "#101013",
            fontFamily: "var(--font-mono)",
            fontSize: 10.5,
          }}
        >
          {/* TODAY button cell aligns with the header row */}
          <div
            className="flex items-center px-4"
            style={{ height: 58, borderBottom: "1px solid rgba(255,255,255,.07)" }}
          >
            <button
              onClick={() => scrollToToday(true)}
              style={{
                fontSize: 11,
                letterSpacing: 0.7,
                color: "#6b6b72",
                fontFamily: "var(--font-mono)",
                background: "transparent",
                border: "1px solid rgba(255,255,255,.07)",
                borderRadius: 4,
                padding: "4px 8px",
                cursor: "pointer",
                transition: "color .15s, border-color .15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#ededef";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,.13)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "#6b6b72";
                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,.07)";
              }}
            >
              TODAY
            </button>
          </div>

          <LaneLabel name="OPEN" count={openCount} color="oklch(0.78 0.14 260)" />
          <LaneLabel name="DEADLINE" count={deadlineCount} color="oklch(0.72 0.16 30)" />

          {/* Stats */}
          <div
            className="mx-3 my-3.5 p-3"
            style={{
              border: "1px solid rgba(255,255,255,.07)",
              borderRadius: 6,
              lineHeight: 1.7,
              color: "#6b6b72",
              background: "rgba(255,255,255,.02)",
            }}
          >
            <div className="tabular" style={{ color: "#ededef", marginBottom: 4, fontSize: 11 }}>
              {doneTodayCount}/{todayTasks.length} done today
            </div>
            <div className="tabular">{allScheduled.length} scheduled</div>
          </div>

          {/* Add task hint */}
          {onOpenQuickAdd && (
            <div
              className="tabular px-3"
              style={{
                marginTop: "auto",
                paddingBottom: 12,
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                color: "#45454a",
                letterSpacing: 0.6,
              }}
            >
              press <kbd>N</kbd> to add a task
            </div>
          )}
        </div>

        {/* Scrollable grid */}
        <div
          ref={scrollerRef}
          className="flex-1 overflow-x-auto overflow-y-auto relative"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={(e) => e.preventDefault()}
          style={{ overscrollBehaviorX: "contain" }}
        >
          <div style={{ display: "inline-block", minWidth: `${dates.length * COL_W}px` }}>
            {/* Sticky header row */}
            <div
              className="flex"
              style={{
                position: "sticky",
                top: 0,
                zIndex: 3,
                background: "#0a0a0b",
                borderBottom: "1px solid rgba(255,255,255,.07)",
              }}
            >
              {dates.map((date) => (
                <DayHeader key={date} date={date} today={today} />
              ))}
            </div>

            {/* OPEN lane row */}
            <div
              className="flex"
              style={{ borderBottom: "1px solid rgba(255,255,255,.07)", minHeight: 240 }}
            >
              {dates.map((date) => (
                <GridDayColumn
                  key={date}
                  date={date}
                  tasks={(tasksByDate[date] ?? []).filter(t => t.type === "open")}
                  onTaskClick={onTaskClick}
                  today={today}
                  hoverDate={hoverDate}
                  onHoverDate={setHoverDate}
                />
              ))}
            </div>

            {/* DEADLINE lane row */}
            <div
              className="flex"
              style={{ minHeight: 180 }}
            >
              {dates.map((date) => (
                <GridDayColumn
                  key={date}
                  date={date}
                  tasks={(tasksByDate[date] ?? []).filter(t => t.type === "deadline")}
                  onTaskClick={onTaskClick}
                  today={today}
                  hoverDate={hoverDate}
                  onHoverDate={setHoverDate}
                  isDeadlineLane
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div
        className="flex items-center gap-4 shrink-0 tabular"
        style={{
          height: 28,
          padding: "0 16px",
          borderTop: "1px solid rgba(255,255,255,.07)",
          background: "#101013",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "#6b6b72",
          letterSpacing: 0.3,
        }}
      >
        <span className="flex items-center gap-1.5">
          <PulsingDot color={mcpColor} size={6} />
          mcp · {mcpConnected ? "connected" : "offline"}
        </span>
        <span className="flex items-center gap-1.5">
          <PulsingDot color={convexColor} size={6} pulseKey={syncTick} />
          convex · {formatAge(syncAge)}
        </span>
        <div className="flex-1" />
        <span style={{ color: "#45454a" }}>
          <kbd>N</kbd> new · <kbd>⌘J</kbd> kairo · <kbd>←→</kbd> pan · <kbd>T</kbd> today
        </span>
      </div>
    </div>
  );
}

function DayHeader({ date, today }: { date: string; today: string }) {
  const d = new Date(date + "T12:00:00");
  const isToday = date === today;
  const isPast = date < today;
  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
  const isMonthStart = d.getDate() === 1;
  const dow = DAY_NAMES[d.getDay()];
  const dayNum = d.getDate();
  const month = MONTHS[d.getMonth()];

  return (
    <div
      data-today={isToday ? "1" : "0"}
      style={{
        width: COL_W,
        flexShrink: 0,
        padding: "10px 12px",
        borderRight: "1px solid rgba(255,255,255,.07)",
        fontFamily: "var(--font-mono)",
        position: "relative",
        background: isToday
          ? "oklch(0.72 0.16 260 / 0.2)"
          : isWeekend
          ? "rgba(255,255,255,.012)"
          : "transparent",
        height: 58,
      }}
    >
      <div
        style={{
          fontSize: 9.5,
          color: isToday ? "oklch(0.78 0.14 260)" : "#6b6b72",
          letterSpacing: 0.8,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{dow}</span>
        {isMonthStart && <span style={{ color: "#c2c2c8" }}>{month.toUpperCase()}</span>}
      </div>
      <div
        className="tabular"
        style={{
          fontSize: 20,
          color: isToday ? "oklch(0.78 0.14 260)" : isPast ? "#6b6b72" : "#ededef",
          fontWeight: 500,
          marginTop: 2,
          letterSpacing: -0.5,
        }}
      >
        {String(dayNum).padStart(2, "0")}
      </div>
      {isToday && (
        <>
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: "oklch(0.78 0.14 260)",
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute",
              top: 2,
              left: 0,
              right: 0,
              height: 32,
              background:
                "linear-gradient(to bottom, oklch(0.78 0.14 260 / 0.18), transparent)",
              pointerEvents: "none",
            }}
          />
        </>
      )}
    </div>
  );
}

function LaneLabel({ name, count, color }: { name: string; count: number; color: string }) {
  return (
    <div
      className="flex items-center gap-2 px-[14px] py-[10px]"
      style={{
        borderBottom: "1px solid rgba(255,255,255,.07)",
        fontSize: 11,
        letterSpacing: 0.7,
        fontFamily: "var(--font-mono)",
        minHeight: 36,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ color: "#ededef" }}>{name}</span>
      <span className="tabular" style={{ color: "#6b6b72", fontSize: 10 }}>{count}</span>
    </div>
  );
}

