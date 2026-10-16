import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/utils";

export function SkeletonBlock({ width = "100%", height = 10, className, style }: {
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: CSSProperties;
}) {
  return <div aria-hidden="true" className={cn("skeleton-block", className)} style={{ width, maxWidth: "100%", height, ...style }} />;
}

export function LoadingRegion({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return <div role="status" aria-label={label} aria-busy="true" className={className}>
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="contents">{children}</div>
  </div>;
}
