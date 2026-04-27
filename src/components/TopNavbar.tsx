import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export type AppPage = "timeline" | "goals";

interface TopNavbarProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  centerContent?: ReactNode;
  rightContent?: ReactNode;
  onOpenSettings?: () => void;
}

function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ borderRadius: 5, filter: "drop-shadow(0 0 6px oklch(0.78 0.14 260 / 0.35))" }}
    >
      <defs>
        <linearGradient id="bm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a1530" />
          <stop offset=".6" stopColor="#0f0a1f" />
          <stop offset="1" stopColor="#070510" />
        </linearGradient>
        <linearGradient id="bm-ac" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#7c5cff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#bm-bg)" />
      <g stroke="#ffffff" strokeOpacity=".06" strokeWidth=".5">
        <path d="M0 16h64M0 32h64M0 48h64M16 0v64M32 0v64M48 0v64" />
      </g>
      <path
        d="M4 46 C 14 34, 22 56, 32 44 S 50 34, 60 46"
        stroke="url(#bm-ac)"
        strokeWidth="3.4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M4 52 C 14 42, 22 60, 32 50 S 50 42, 60 52"
        stroke="#a78bfa"
        strokeOpacity=".4"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="46" cy="18" r="6" fill="url(#bm-ac)" />
      <circle cx="46" cy="18" r="2" fill="#ffffff" />
    </svg>
  );
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function TopNavbar({
  activePage,
  onNavigate,
  rightContent,
  onOpenSettings,
}: TopNavbarProps) {
  const now = new Date();
  const monthName = now.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const year = now.getFullYear();
  const weekNum = getWeekNumber(now);

  return (
    <header
      className={cn(
        "flex items-center gap-3 px-[18px] border-b",
        "bg-[#101013]"
      )}
      style={{
        height: 52,
        borderColor: "rgba(255,255,255,.07)",
        fontSize: 13,
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <BrandMark size={22} />
        <span
          className="font-semibold"
          style={{ fontSize: 15, letterSpacing: -0.3, color: "#ededef" }}
        >
          Pravah
        </span>
      </div>

      {/* Nav tabs */}
      <div
        className="flex gap-0.5 ml-3 p-[3px] rounded-[6px]"
        style={{
          background: "rgba(255,255,255,.04)",
          border: "1px solid rgba(255,255,255,.07)",
        }}
      >
        <NavTab active={activePage === "timeline"} onClick={() => onNavigate("timeline")}>
          Timeline
        </NavTab>
        <NavTab active={activePage === "goals"} onClick={() => onNavigate("goals")}>
          Long-term Goals
        </NavTab>
      </div>

      <div className="flex-1" />

      {/* Date display */}
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "#c2c2c8",
          letterSpacing: 1,
        }}
      >
        {monthName} {year} · WK {weekNum}
      </div>

      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {rightContent}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            aria-label="Settings"
            title="Settings"
            className="flex items-center justify-center rounded-[6px] transition-colors"
            style={{
              width: 30,
              height: 30,
              background: "transparent",
              border: "1px solid rgba(255,255,255,.07)",
              color: "#6b6b72",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#ededef"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#6b6b72"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
      </div>
    </header>
  );
}

function NavTab({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px",
        fontSize: 11.5,
        fontWeight: 500,
        borderRadius: 4,
        border: "none",
        cursor: "pointer",
        background: active ? "oklch(0.72 0.16 260 / 0.2)" : "transparent",
        color: active ? "oklch(0.78 0.14 260)" : "#6b6b72",
        letterSpacing: 0.2,
        transition: "background .15s, color .15s",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.color = "#ededef";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.color = "#6b6b72";
      }}
    >
      {children}
    </button>
  );
}
