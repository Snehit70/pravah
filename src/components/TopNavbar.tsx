import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export type AppPage = "timeline" | "goals";

interface TopNavbarProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  centerContent?: ReactNode;
}

export function TopNavbar({ activePage, onNavigate, centerContent }: TopNavbarProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between px-6 h-14",
        "border-b border-white/10 bg-[#202020] sticky top-0 z-50"
      )}
    >
      <div className="flex items-center gap-3">
        <h1
          className="text-lg font-semibold tracking-tight text-zinc-100"
          style={{ fontFamily: "'Newsreader', Georgia, serif" }}
        >
          Pravah
        </h1>
        <span
          className={cn(
            "text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider",
            "bg-blue-500/20 text-blue-300 border border-blue-400/30"
          )}
        >
          beta
        </span>
        <nav className="ml-2 flex items-center gap-1 rounded-lg bg-zinc-900 p-1 border border-white/10">
          <button
            type="button"
            onClick={() => onNavigate("timeline")}
            aria-current={activePage === "timeline" ? "page" : undefined}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs transition-colors",
              activePage === "timeline"
                ? "bg-blue-500/20 text-blue-300"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            )}
          >
            Timeline
          </button>
          <button
            type="button"
            onClick={() => onNavigate("goals")}
            aria-current={activePage === "goals" ? "page" : undefined}
            className={cn(
              "px-2.5 py-1 rounded-md text-xs transition-colors",
              activePage === "goals"
                ? "bg-blue-500/20 text-blue-300"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
            )}
          >
            Long-term Goals
          </button>
        </nav>
      </div>

      <div className="text-sm font-medium text-zinc-400 tracking-wide" style={{ fontFamily: "'Newsreader', Georgia, serif" }}>
        {centerContent}
      </div>
    </header>
  );
}
