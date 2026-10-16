import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircleIcon, CalendarIcon, ClockIcon, StarIcon } from "../ui/icons";
import { useMotion } from "../../lib/motion";

// Web port of the mobile Journey card: GitHub-style consistency heatmap with
// month labels and a weekday gutter, tap-to-inspect days, the Less/More
// legend, and the hairline-divided stat row beneath.

const CELL = 16;
const GAP = 4;
const PITCH = CELL + GAP;

const RAMP = [
  "rgba(var(--color-accent-primary-rgb), 0.34)",
  "rgba(var(--color-accent-primary-rgb), 0.56)",
  "rgba(var(--color-accent-primary-rgb), 0.78)",
  "rgba(var(--color-accent-primary-rgb), 1)",
];
const EMPTY = "var(--color-fill-soft)";

function prettyDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function shortDay(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export interface JourneyStats {
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  overdueCount: number;
  totalCompletions: number;
}

export function JourneyCardBody({
  weeks,
  stats,
}: {
  weeks: Array<Array<{ count: number; date: string }>>;
  stats: JourneyStats;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const transition = useMotion({ duration: 0.4, ease: [0.16, 1, 0.3, 1] });

  const max = useMemo(() => {
    let value = 1;
    for (const week of weeks) for (const day of week) value = Math.max(value, day.count);
    return value;
  }, [weeks]);

  const monthLabels = useMemo(() => {
    return weeks.map((week, index) => {
      if (week.length === 0) return null;
      const month = new Date(`${week[0].date}T12:00:00`).toLocaleDateString("en-US", { month: "short" });
      if (index === 0) return { index, label: month.toUpperCase() };
      const previous = weeks[index - 1];
      if (previous.length === 0) return null;
      const previousMonth = new Date(`${previous[0].date}T12:00:00`).toLocaleDateString("en-US", { month: "short" });
      return month !== previousMonth ? { index, label: month.toUpperCase() } : null;
    });
  }, [weeks]);

  const selectedDay = useMemo(() => {
    if (!selected) return null;
    for (const week of weeks) {
      const day = week.find((entry) => entry.date === selected);
      if (day) return day;
    }
    return null;
  }, [selected, weeks]);

  const gridWidth = weeks.length * PITCH - GAP;

  return (
    <div>
      {stats.totalCompletions === 0 ? (
        <p style={{ margin: "8px 0 4px", fontSize: 13, lineHeight: 1.5, color: "var(--color-text-muted)", maxWidth: "56ch" }}>
          Your consistency calendar fills in as you complete tasks over the days ahead.
        </p>
      ) : (
        <>
          {/* Month strip */}
          <div aria-hidden style={{ position: "relative", height: 14, marginLeft: 34, marginBottom: 4 }}>
            {monthLabels.map((entry) =>
              entry ? (
                <span
                  key={entry.index}
                  className="tabular"
                  style={{
                    position: "absolute",
                    left: entry.index * PITCH,
                    fontSize: 8.5,
                    fontFamily: "var(--font-mono)",
                    letterSpacing: 0.8,
                    color: "var(--color-text-dim)",
                  }}
                >
                  {entry.label}
                </span>
              ) : null
            )}
          </div>

          <div style={{ display: "flex", gap: 4 }}>
            {/* Weekday gutter */}
            <div aria-hidden style={{ width: 30, display: "flex", flexDirection: "column", gap: GAP, flexShrink: 0 }}>
              {["", "MON", "", "WED", "", "FRI", ""].map((label, row) => (
                <span
                  key={row}
                  style={{
                    height: CELL,
                    fontSize: 7.5,
                    fontFamily: "var(--font-mono)",
                    letterSpacing: 0.4,
                    color: "var(--color-text-dim)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

            {/* Grid */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={transition}
              style={{ overflowX: "auto", paddingBottom: 2 }}
            >
              <div style={{ display: "flex", gap: GAP, width: gridWidth }}>
                {weeks.map((week, weekIndex) => (
                  <div key={weekIndex} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
                    {week.map((day) => {
                      const bucket = day.count === 0 ? -1 : Math.min(3, Math.ceil((day.count / max) * 4) - 1);
                      const color = bucket === -1 ? EMPTY : RAMP[bucket];
                      const isSelected = selected === day.date;
                      return (
                        <button
                          key={day.date}
                          type="button"
                          aria-label={`${prettyDay(day.date)}: ${day.count === 0 ? "no completions" : `${day.count} completed`}`}
                          aria-pressed={isSelected}
                          onClick={() => setSelected(isSelected ? null : day.date)}
                          style={{
                            width: CELL,
                            height: CELL,
                            borderRadius: 4,
                            border: "none",
                            padding: 0,
                            background: color,
                            cursor: "pointer",
                            boxShadow: isSelected ? "inset 0 0 0 2px var(--color-accent-primary)" : "none",
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Selected-day readout */}
          <div style={{ minHeight: 22, marginTop: 8 }}>
            {selectedDay ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.16 }}
                style={{ display: "flex", alignItems: "center", gap: 8 }}
              >
                <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: "var(--color-accent-primary)", flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--color-text-primary)" }}>
                  {prettyDay(selectedDay.date)}
                </span>
                <span className="tabular" style={{ marginLeft: "auto", fontSize: 11, fontFamily: "var(--font-mono)", color: selectedDay.count > 0 ? "var(--color-text-secondary)" : "var(--color-text-dim)" }}>
                  {selectedDay.count > 0 ? `${selectedDay.count} completed` : "no completions"}
                </span>
              </motion.div>
            ) : null}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5, minHeight: 20 }}>
            <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: 0.5, color: "var(--color-text-dim)" }}>LESS</span>
            {[EMPTY, ...RAMP].map((color) => (
              <span key={color} aria-hidden style={{ width: 11, height: 11, borderRadius: 3, background: color }} />
            ))}
            <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", letterSpacing: 0.5, color: "var(--color-text-dim)" }}>MORE</span>
          </div>
        </>
      )}

      {/* Stat row */}
      <div
        style={{
          marginTop: 14,
          paddingTop: 14,
          borderTop: "1px solid var(--color-border-subtle)",
          display: "flex",
        }}
      >
        {[
          {
            icon: CalendarIcon,
            label: "Active days",
            value: String(stats.activeDays),
            tone: "default" as const,
          },
          {
            icon: StarIcon,
            label: "Best streak",
            value: `${stats.longestStreak}d`,
            tone: "default" as const,
          },
          stats.currentStreak > 0
            ? { icon: ClockIcon, label: "Current streak", value: `${stats.currentStreak}d`, tone: "accent" as const }
            : {
                icon: ClockIcon,
                label: "Last active",
                value: stats.lastActiveDate ? shortDay(stats.lastActiveDate) : "—",
                tone: "default" as const,
              },
          {
            icon: AlertCircleIcon,
            label: "Overdue",
            value: String(stats.overdueCount),
            tone: stats.overdueCount > 0 ? ("error" as const) : ("default" as const),
          },
        ].map((stat, index) => (
          <div
            key={stat.label}
            style={{
              flex: 1,
              minWidth: 0,
              paddingLeft: index === 0 ? 0 : 18,
              borderLeft: index === 0 ? "none" : "1px solid var(--color-border-subtle)",
            }}
          >
            <stat.icon
              size={16}
              strokeWidth={1.75}
              style={{
                display: "block",
                marginBottom: 6,
                color:
                  stat.tone === "error"
                    ? "var(--color-error)"
                    : "var(--color-accent-primary)",
              }}
            />
            <div
              className="tabular"
              style={{
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: -0.3,
                fontFamily: "var(--font-sans)",
                color:
                  stat.tone === "accent"
                    ? "var(--color-accent-primary)"
                    : stat.tone === "error"
                      ? "var(--color-error)"
                      : "var(--color-text-primary)",
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                marginTop: 2,
                fontSize: 9.5,
                fontFamily: "var(--font-mono)",
                letterSpacing: 0.8,
                textTransform: "uppercase",
                color: "var(--color-text-dim)",
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
