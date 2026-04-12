import { motion } from "framer-motion";

export function LoadingSkeleton() {
  return (
    <div className="flex h-screen bg-[#191919]">
      {/* Timeline skeleton */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#202020] h-[var(--header-height)]">
          <div className="h-6 w-24 bg-zinc-700 rounded animate-pulse" />
          <div className="h-8 w-8 bg-zinc-700 rounded-full animate-pulse" />
        </div>

        {/* Timeline columns */}
        <div className="flex-1 overflow-hidden px-4 py-4">
          <div className="h-full flex items-center">
            <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex-shrink-0 w-[var(--timeline-day-min-width)] bg-[#252525] border border-white/10 rounded-2xl p-3 min-h-[360px]"
              >
                <div className="h-12 bg-zinc-700 rounded-xl mb-5 animate-pulse" />
                <div className="h-[2px] bg-zinc-600 rounded-full mb-5 animate-pulse" />
                <div className="space-y-2">
                  {[1, 2].map((j) => (
                    <div
                      key={j}
                      className="h-4 bg-zinc-700 rounded-md animate-pulse"
                      style={{ opacity: 1 - j * 0.2 }}
                    />
                  ))}
                </div>
              </motion.div>
            ))}
            </div>
          </div>
        </div>
      </div>

      {/* Inbox skeleton */}
      <div className="w-[var(--sidebar-width-expanded)] border-l border-white/10 bg-[#202020] p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-4 w-4 bg-zinc-700 rounded animate-pulse" />
          <div className="h-4 w-16 bg-zinc-700 rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className="h-16 bg-[#252525] border border-white/10 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
