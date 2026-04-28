import { motion } from "framer-motion";
import { TIMELINE_COL_WIDTH } from "../lib/timelineLayout";
import { EASE_IN_OUT_QUART, EASE_OUT_EXPO } from "../lib/motion";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const TASK_WIDTHS = [116, 148, 92, 164, 132, 106, 152];
const INBOX_ITEM_WIDTHS = [128, 92, 144, 106, 76, 156, 118, 136, 98, 148, 84, 124, 110, 140];

function SkeletonLine({
  width,
  tone = "soft",
}: {
  width: number | string;
  tone?: "soft" | "bright";
}) {
  return (
    <div
      className="overflow-hidden rounded-[4px]"
      style={{
        width,
        height: 8,
        background:
          tone === "bright" ? "rgba(237,237,239,.16)" : "rgba(255,255,255,.07)",
      }}
    >
      <motion.div
        className="h-full w-1/2"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,.16), transparent)",
        }}
        animate={{ x: ["-120%", "240%"] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: EASE_IN_OUT_QUART }}
      />
    </div>
  );
}

function BrandMarkSkeleton() {
  return (
    <div
      className="relative h-[22px] w-[22px] overflow-hidden rounded-[5px] border"
      style={{
        background: "linear-gradient(135deg,#1a1530,#070510)",
        borderColor: "rgba(255,255,255,.08)",
      }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,.05)_1px,transparent_1px)] bg-[length:7px_7px]" />
      <div className="absolute bottom-1.5 left-1 right-1 h-[2px] rounded-full bg-[oklch(0.78_0.14_260)]" />
      <div className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.14_260)]" />
    </div>
  );
}

function NavSkeleton() {
  return (
    <header
      className="flex h-[52px] items-center gap-3 border-b px-[18px]"
      style={{ background: "#101013", borderColor: "rgba(255,255,255,.07)" }}
    >
      <div className="flex items-center gap-2.5">
        <BrandMarkSkeleton />
        <span className="text-base font-semibold tracking-[-0.025em] text-zinc-100">
          Pravah
        </span>
      </div>

      <div className="ml-3 flex gap-1 rounded-[6px] border border-white/[0.07] bg-white/[0.04] p-[3px]">
        <div className="rounded-[4px] bg-[oklch(0.72_0.16_260_/_0.2)] px-3 py-[5px] text-[11.5px] font-medium text-[oklch(0.78_0.14_260)]">
          Timeline
        </div>
        <div className="px-3 py-[5px] text-[11.5px] font-medium text-zinc-600">
          Long-term Goals
        </div>
      </div>

      <div className="flex-1" />
      <div className="hidden font-mono text-xs tracking-[0.06em] text-zinc-500 sm:block">
        SYNCING WORKSPACE
      </div>
      <div className="flex-1" />
      <div className="h-[30px] w-[30px] rounded-[6px] border border-white/[0.07]" />
    </header>
  );
}

function DayColumnSkeleton({ index, day }: { index: number; day: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.022, duration: 0.32, ease: EASE_OUT_EXPO }}
      className="shrink-0 border-r border-white/[0.07]"
      style={{ width: TIMELINE_COL_WIDTH }}
    >
      <div className="flex h-[58px] flex-col justify-center border-b border-white/[0.07] px-3">
        <span className="font-mono text-[10px] tracking-[0.12em] text-zinc-600">{day}</span>
        <SkeletonLine width={index === 2 ? 52 : 34} tone={index === 2 ? "bright" : "soft"} />
      </div>

      <div className="min-h-[240px] border-b border-white/[0.07] p-2">
        <div
          className="mb-2 rounded-[5px] border border-white/[0.07] bg-white/[0.025] px-2.5 py-2.5"
          style={{ borderLeft: "3px solid oklch(0.78 0.14 260 / 0.7)", minHeight: 34 }}
        >
          <SkeletonLine width={TASK_WIDTHS[index % TASK_WIDTHS.length]} tone="bright" />
          <div className="mt-2.5">
            <SkeletonLine width={48} />
          </div>
        </div>
        {index % 3 === 0 ? (
          <div
            className="rounded-[5px] border border-white/[0.07] bg-white/[0.018] px-2.5 py-2.5"
            style={{ borderLeft: "3px solid oklch(0.78 0.14 260 / 0.45)", minHeight: 34 }}
          >
            <SkeletonLine width={104} />
          </div>
        ) : null}
      </div>

      <div className="min-h-[220px] p-2">
        {index % 2 === 0 ? (
          <div
            className="rounded-[5px] border border-white/[0.07] bg-white/[0.025] px-2.5 py-2.5"
            style={{ borderLeft: "3px solid oklch(0.72 0.16 30 / 0.8)", minHeight: 34 }}
          >
            <SkeletonLine width={index === 4 ? 136 : 96} tone="bright" />
          </div>
        ) : (
          <div className="h-14 rounded-[4px] border border-dashed border-white/[0.04]" />
        )}
      </div>
    </motion.div>
  );
}

function InboxSkeleton() {
  return (
    <aside
      className="hidden h-full w-[300px] shrink-0 flex-col border-l lg:flex"
      style={{ background: "#101013", borderColor: "rgba(255,255,255,.07)" }}
    >
      <div
        className="flex items-start gap-2 px-[14px] py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,.07)" }}
      >
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-zinc-100">Inbox</span>
            <span className="rounded-full bg-[oklch(0.72_0.16_260_/_0.2)] px-2 py-0.5 font-mono text-[10px] text-[oklch(0.78_0.14_260)]">
              ...
            </span>
          </div>
        </div>
        <div className="flex-1" />
        <div className="mt-1 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.18_150)]" />
          <span className="font-mono text-[9px] tracking-[0.06em] text-zinc-500">MCP</span>
        </div>
      </div>

      <div className="px-2.5 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,.07)" }}>
        <div className="flex h-[31px] items-center rounded-[4px] border border-white/[0.09] bg-black/25 px-[10px] shadow-[inset_0_1px_0_rgba(0,0,0,.3)]">
          <span className="text-xs text-zinc-600">Search inbox...</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-[5px] overflow-hidden p-[10px]">
        {INBOX_ITEM_WIDTHS.map((titleWidth, item) => (
          <motion.div
            key={item}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.08 + item * 0.028, duration: 0.28, ease: EASE_OUT_EXPO }}
            className="relative min-h-[51px] rounded-[4px] border border-white/[0.07] bg-white/[0.025] px-[10px] py-[7px] pl-[14px]"
            style={{
              fontSize: 12,
            }}
          >
            <span
              className="absolute left-[6px] top-1/2 w-1 -translate-y-1/2 rounded-[2px]"
              style={{
                height: "60%",
                background:
                  item % 2 === 0
                    ? "oklch(0.78 0.14 260 / 0.7)"
                    : "oklch(0.72 0.16 30 / 0.7)",
              }}
            />
            <SkeletonLine width={titleWidth} tone="bright" />
            <div className="mt-[7px] flex gap-2">
              <SkeletonLine width={42} />
              <SkeletonLine width={24} />
            </div>
          </motion.div>
        ))}
      </div>

      <div style={{ padding: 10, borderTop: "1px solid rgba(255,255,255,.07)" }}>
        <div className="flex h-[37px] items-center justify-center rounded-[4px] border border-[oklch(0.78_0.14_260_/_0.4)] bg-[oklch(0.72_0.16_260_/_0.2)]">
          <SkeletonLine width={82} tone="bright" />
        </div>
      </div>
    </aside>
  );
}

export function LoadingSkeleton() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#0a0a0b] text-zinc-100">
      <NavSkeleton />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1">
          <aside
            className="hidden w-[180px] shrink-0 flex-col border-r md:flex"
            style={{ background: "#101013", borderColor: "rgba(255,255,255,.07)" }}
          >
            <div className="flex h-[58px] items-center border-b border-white/[0.07] px-4">
              <div className="rounded-[4px] border border-white/[0.07] px-2 py-1 font-mono text-[11px] tracking-[0.07em] text-zinc-500">
                TODAY
              </div>
            </div>
            <div className="border-b border-white/[0.07] px-4 py-4">
              <div className="mb-2 font-mono text-[10px] tracking-[0.18em] text-zinc-600">
                OPEN
              </div>
              <SkeletonLine width={70} tone="bright" />
            </div>
            <div className="border-b border-white/[0.07] px-4 py-4">
              <div className="mb-2 font-mono text-[10px] tracking-[0.18em] text-zinc-600">
                DEADLINE
              </div>
              <SkeletonLine width={88} />
            </div>
            <div className="m-3 rounded-[6px] border border-white/[0.07] bg-white/[0.02] p-3">
              <SkeletonLine width="100%" tone="bright" />
              <div className="mt-3">
                <SkeletonLine width={82} />
              </div>
            </div>
          </aside>

          <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">
              <div className="flex min-w-max">
                {DAYS.map((day, index) => (
                  <DayColumnSkeleton key={day} index={index} day={day} />
                ))}
              </div>
            </div>

            <div
              className="flex h-7 shrink-0 items-center gap-4 border-t px-4 font-mono text-[11px] tracking-[0.03em] text-zinc-500"
              style={{ background: "#101013", borderColor: "rgba(255,255,255,.07)" }}
            >
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.18_150)]" />
                mcp · connecting
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.15_60)]" />
                convex · syncing
              </span>
            </div>
          </main>
        </div>

        <InboxSkeleton />
      </div>
    </div>
  );
}
