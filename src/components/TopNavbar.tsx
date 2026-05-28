import type { ReactNode } from "react";
import { tx } from "../lib/motion";
import { cn } from "../lib/utils";

export type AppPage = "timeline" | "goals" | "insights";

interface TopNavbarProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  centerContent?: ReactNode;
  rightContent?: ReactNode;
  onOpenSettings?: () => void;
}

function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <img
      src="/favicon.png"
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: 5, objectFit: "cover", filter: "drop-shadow(0 0 6px oklch(0.78 0.14 260 / 0.35))" }}
    />
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
          style={{ fontSize: 16, letterSpacing: -0.4, color: "#ededef" }}
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
        <NavTab active={activePage === "insights"} onClick={() => onNavigate("insights")}>
          Insights
        </NavTab>
      </div>

      <div className="flex-1" />

      {/* Date display */}
      <div
        className="tabular"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "#c2c2c8",
          letterSpacing: 0.6,
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
            className="flex items-center justify-center rounded-[6px]"
            style={{
              width: 30,
              height: 30,
              background: "transparent",
              border: "1px solid rgba(255,255,255,.07)",
              color: "#6b6b72",
              cursor: "pointer",
              transition: tx(["color", "background-color", "border-color"], "instant"),
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
        transition: tx(["background-color", "color"], "instant"),
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
