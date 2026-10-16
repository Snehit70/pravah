import type { ReactNode } from "react";
import { tx } from "../lib/motion";
import { cn } from "../lib/utils";
import {
  navGoalsIcon,
  navGoalsFillIcon,
  navProgressIcon,
  navProgressFillIcon,
  navTimelineIcon,
  navTimelineFillIcon,
} from "./ui/traced-icons";
import type { ComponentType } from "react";
import { appSettingsIcon } from "./ui/traced-icons";

const AppSettingsGlyph = appSettingsIcon;

export type AppPage = "timeline" | "goals" | "insights" | "settings";

interface TopNavbarProps {
  disabled?: boolean;
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  centerContent?: ReactNode;
  rightContent?: ReactNode;
}

function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <img
      src="/favicon.png"
      alt=""
      width={size}
      height={size}
      style={{ borderRadius: 7, objectFit: "cover" }}
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

// Mobile header subtitles, per view (App.tsx headerViewName companions).
// Settings is a destination, not a tab: it renders in the header title and
// the squircle button, but never joins the workspace tab pill.
type IconPair = [ComponentType<{ size?: number }>, ComponentType<{ size?: number }>];

const VIEW_META: Record<AppPage, { title: string; icon: IconPair }> = {
  timeline: { title: "Timeline", icon: [navTimelineIcon, navTimelineFillIcon] },
  goals: { title: "Long-term Goals", icon: [navGoalsIcon, navGoalsFillIcon] },
  insights: { title: "Insights", icon: [navProgressIcon, navProgressFillIcon] },
  settings: { title: "Settings", icon: [appSettingsIcon, appSettingsIcon] },
};

const TAB_PAGES: AppPage[] = ["timeline", "goals", "insights"];

export function TopNavbar({
  activePage,
  onNavigate,
  rightContent,
  disabled = false,
}: TopNavbarProps) {
  const now = new Date();
  const monthName = now.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  const year = now.getFullYear();
  const weekNum = getWeekNumber(now);

  return (
    <header
      className={cn(
        "flex items-center gap-1 px-2 sm:gap-3 sm:px-[18px] border-b",
        "bg-[var(--color-bg-base)]"
      )}
      style={{
        height: 56,
        borderColor: "var(--color-border-subtle)",
        fontSize: 13,
      }}
    >
      {/* Brand + view title */}
      <div className="hidden items-center gap-2.5 sm:flex">
        <BrandMark />
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: -0.3,
              lineHeight: 1.1,
              color: "var(--color-text-primary)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {VIEW_META[activePage].title}
          </span>
          <span
            className="tabular"
            style={{
              fontSize: 8.5,
              fontFamily: "var(--font-mono)",
              color: "var(--color-text-dim)",
              letterSpacing: 1.2,
              lineHeight: 1.2,
            }}
          >
            PRAVAH · {monthName} {year} · WK {weekNum}
          </span>
        </div>
      </div>

      {/* Nav tabs with directional fill icons */}
      <div
        className="flex gap-0.5 sm:ml-3 p-[3px] rounded-[8px]"
        style={{
          background: "var(--color-fill-soft)",
          border: "1px solid var(--color-border-subtle)",
        }}
      >
        {TAB_PAGES.map((page) => (
          <NavTab
            key={page}
            active={activePage === page}
            disabled={disabled}
            icons={VIEW_META[page].icon}
            onClick={() => onNavigate(page)}
          >
            {page === "goals" ? "Goals" : VIEW_META[page].title}
          </NavTab>
        ))}
      </div>

      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {rightContent}
        <button
          disabled={disabled}
          onClick={() => onNavigate("settings")}
          aria-label="Settings"
          aria-current={activePage === "settings" ? "page" : undefined}
          title="Settings"
          className="flex items-center justify-center rounded-[10px]"
          style={{
            width: 36,
            height: 36,
            background: activePage === "settings" ? "var(--color-accent-dim)" : "var(--color-bg-surface)",
            border: `1px solid ${activePage === "settings" ? "rgba(var(--color-accent-primary-rgb), 0.4)" : "var(--color-border-default)"}`,
            color: activePage === "settings" ? "var(--color-accent-primary)" : "var(--color-text-muted)",
            cursor: "pointer",
            boxShadow: "0 1px 2px rgba(44,33,24,0.05)",
            transition: tx(["color", "border-color", "background-color"], "instant"),
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--color-border-strong)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color =
              activePage === "settings" ? "var(--color-accent-primary)" : "var(--color-text-muted)";
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              activePage === "settings"
                ? "rgba(var(--color-accent-primary-rgb), 0.4)"
                : "var(--color-border-default)";
          }}
        >
          <AppSettingsGlyph size={16} />
        </button>
      </div>
    </header>
  );
}

function NavTab({
  disabled,
  active,
  icons,
  children,
  onClick,
}: {
  disabled?: boolean;
  active: boolean;
  icons: [React.ComponentType<{ size?: number }>, React.ComponentType<{ size?: number }>];
  children: React.ReactNode;
  onClick: () => void;
}) {
  const [Outline, Fill] = icons;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? "page" : undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        fontSize: 11.5,
        fontWeight: active ? 600 : 500,
        borderRadius: 6,
        border: "none",
        cursor: "pointer",
        background: active ? "var(--color-bg-floating)" : "transparent",
        color: active ? "var(--color-accent-primary)" : "var(--color-text-muted)",
        letterSpacing: 0.1,
        boxShadow: active ? "0 1px 2px rgba(44,33,24,0.08)" : "none",
        transition: tx(["background-color", "color", "box-shadow"], "instant"),
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-primary)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)";
      }}
    >
      <span style={{ display: "grid", placeItems: "center" }}>
        {active ? <Fill size={15} /> : <Outline size={15} />}
      </span>
      {children}
    </button>
  );
}
