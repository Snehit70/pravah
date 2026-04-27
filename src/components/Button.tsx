import { motion } from "framer-motion";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { T_INSTANT } from "../lib/motion";
import { cn } from "../lib/utils";

interface ButtonProps extends Omit<ComponentPropsWithoutRef<typeof motion.button>, "children"> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = cn(
    "relative inline-flex items-center justify-center rounded-[6px] font-medium",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
    "tracking-[0.01em]"
  );

  // Accent: oklch(0.78 0.14 260). All variants converge on this color so the
  // app reads as one design language rather than Tailwind defaults.
  const variants = {
    primary: cn(
      "text-zinc-950",
      "hover:brightness-110",
      "shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_8px_20px_-8px_oklch(0.78_0.14_260/0.6)]",
      "focus-visible:ring-[oklch(0.78_0.14_260/0.55)]",
      "[background-color:oklch(0.78_0.14_260)]"
    ),
    secondary: cn(
      "text-zinc-100",
      "border border-white/[0.09]",
      "bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/[0.14]",
      "focus-visible:ring-white/30"
    ),
    danger: cn(
      "text-red-300",
      "border border-red-400/25",
      "bg-red-500/[0.08] hover:bg-red-500/[0.16] hover:border-red-400/40",
      "focus-visible:ring-red-400/40"
    ),
    ghost: cn(
      "bg-transparent text-zinc-400",
      "hover:bg-white/[0.04] hover:text-zinc-100",
      "focus-visible:ring-white/20"
    ),
  };

  const sizes = {
    sm: "px-2.5 py-1 text-[11px]",
    md: "px-3.5 py-1.5 text-[12px]",
    lg: "px-5 py-2.5 text-[13px]",
  };

  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.015 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={T_INSTANT}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled}
      style={{ transition: "background-color var(--dur-instant) var(--ease-out-expo), color var(--dur-instant) var(--ease-out-expo), box-shadow var(--dur-fast) var(--ease-out-expo), border-color var(--dur-instant) var(--ease-out-expo)" }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
