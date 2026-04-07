import { motion } from "framer-motion";
import { cn } from "../lib/utils";

export function LoadingSkeleton() {
  return (
    <div className="flex h-screen bg-[#09090b]">
      {/* Inbox skeleton */}
      <div className="w-[260px] border-r border-zinc-800/60 bg-zinc-900/40 p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-4 w-4 bg-zinc-800 rounded animate-pulse" />
          <div className="h-4 w-16 bg-zinc-800 rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className="h-16 bg-zinc-800/50 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>

      {/* Timeline skeleton */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800/60">
          <div className="h-6 w-24 bg-zinc-800 rounded animate-pulse" />
          <div className="h-8 w-8 bg-zinc-800 rounded-full animate-pulse" />
        </div>

        {/* Timeline columns */}
        <div className="flex-1 overflow-hidden p-6">
          <div className="flex gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex-shrink-0 w-64"
              >
                <div className="h-12 bg-zinc-800/50 rounded-xl mb-3 animate-pulse" />
                <div className="space-y-2">
                  {[1, 2].map((j) => (
                    <div
                      key={j}
                      className={cn(
                        "h-20 bg-zinc-800/30 rounded-xl animate-pulse",
                        "opacity-" + (100 - j * 20)
                      )}
                    />
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
