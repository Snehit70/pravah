import { motion } from "framer-motion";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const TASK_WIDTHS = [82, 104, 64, 116, 92, 74, 108];

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
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
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
      transition={{ delay: index * 0.035, duration: 0.28 }}
      className="w-[136px] shrink-0 border-r border-white/[0.07]"
    >
      <div className="flex h-[58px] flex-col justify-center border-b border-white/[0.07] px-3">
        <span className="font-mono text-[10px] tracking-[0.12em] text-zinc-600">{day}</span>
        <SkeletonLine width={index === 2 ? 52 : 34} tone={index === 2 ? "bright" : "soft"} />
      </div>

      <div className="min-h-[240px] border-b border-white/[0.07] p-2">
        <div
          className="mb-2 rounded-[4px] border border-white/[0.07] bg-white/[0.025] px-2 py-2"
          style={{ borderLeft: "2px solid oklch(0.78 0.14 260 / 0.7)" }}
        >
          <SkeletonLine width={TASK_WIDTHS[index % TASK_WIDTHS.length]} tone="bright" />
          <div className="mt-2">
            <SkeletonLine width={48} />
          </div>
        </div>
        {index % 3 === 0 ? (
          <div
            className="rounded-[4px] border border-white/[0.07] bg-white/[0.018] px-2 py-2"
            style={{ borderLeft: "2px solid oklch(0.78 0.14 260 / 0.45)" }}
          >
            <SkeletonLine width={72} />
          </div>
        ) : null}
      </div>

      <div className="min-h-[220px] p-2">
        {index % 2 === 0 ? (
          <div
            className="rounded-[4px] border border-white/[0.07] bg-white/[0.025] px-2 py-2"
            style={{ borderLeft: "2px solid oklch(0.72 0.16 30 / 0.8)" }}
          >
            <SkeletonLine width={index === 4 ? 94 : 66} tone="bright" />
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
      className="hidden w-[300px] shrink-0 flex-col border-l lg:flex"
      style={{ background: "#101013", borderColor: "rgba(255,255,255,.07)" }}
    >
      <div className="flex items-start gap-2 border-b border-white/[0.07] px-[14px] py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-zinc-100">Inbox</span>
            <span className="rounded-full bg-[oklch(0.72_0.16_260_/_0.2)] px-2 py-0.5 font-mono text-[10px] text-[oklch(0.78_0.14_260)]">
              ...
            </span>
          </div>
          <div className="mt-1">
            <SkeletonLine width={88} />
          </div>
        </div>
        <div className="flex-1" />
        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[oklch(0.78_0.18_150)]" />
      </div>

      <div className="border-b border-white/[0.07] px-2.5 py-2">
        <div className="h-[31px] rounded-[4px] border border-white/[0.09] bg-black/25" />
      </div>

      <div className="flex flex-1 flex-col gap-[5px] p-[10px]">
        {[0, 1, 2, 3, 4].map((item) => (
          <motion.div
            key={item}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + item * 0.04, duration: 0.24 }}
            className="rounded-[4px] border border-white/[0.07] bg-white/[0.025] px-3 py-2.5"
            style={{
              borderLeft:
                item % 2 === 0
                  ? "2px solid oklch(0.78 0.14 260 / 0.7)"
                  : "2px solid oklch(0.72 0.16 30 / 0.7)",
            }}
          >
            <SkeletonLine width={[128, 92, 144, 106, 76][item]} tone="bright" />
            <div className="mt-2 flex gap-2">
              <SkeletonLine width={34} />
              <SkeletonLine width={28} />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="border-t border-white/[0.07] p-[10px]">
        <div className="h-9 rounded-[4px] border border-[oklch(0.78_0.14_260_/_0.35)] bg-[oklch(0.72_0.16_260_/_0.16)]" />
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

          <main className="min-w-0 flex-1 overflow-hidden">
            <div className="h-full overflow-hidden">
              <div className="flex min-w-max">
                {DAYS.map((day, index) => (
                  <DayColumnSkeleton key={day} index={index} day={day} />
                ))}
              </div>
            </div>
          </main>
        </div>

        <InboxSkeleton />
      </div>
    </div>
  );
}
