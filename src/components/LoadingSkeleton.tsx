import { motion } from "framer-motion";

export function LoadingSkeleton() {
  return (
    <div className="flex h-screen bg-[var(--color-bg-base)]">
      {/* Inbox skeleton */}
      <div className="w-[var(--sidebar-width-expanded)] border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-4 w-4 bg-[var(--color-bg-elevated)] rounded animate-pulse" />
          <div className="h-4 w-16 bg-[var(--color-bg-elevated)] rounded animate-pulse" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className="h-16 bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] animate-pulse"
            />
          ))}
        </div>
      </div>

      {/* Timeline skeleton */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border-subtle)] h-[var(--header-height)]">
          <div className="h-6 w-24 bg-[var(--color-bg-elevated)] rounded animate-pulse" />
          <div className="h-8 w-8 bg-[var(--color-bg-elevated)] rounded-full animate-pulse" />
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
                className="flex-shrink-0 w-[var(--timeline-day-min-width)]"
              >
                <div className="h-12 bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] mb-3 animate-pulse" />
                <div className="space-y-2">
                  {[1, 2].map((j) => (
                    <div
                      key={j}
                      className="h-16 bg-[var(--color-bg-elevated)] rounded-[var(--radius-md)] animate-pulse"
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
  );
}
