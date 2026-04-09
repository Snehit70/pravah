import { motion } from "framer-motion";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { TRANSITION_XFAST } from "../lib/motion";
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
    "relative rounded-xl font-medium",
    "transition-all duration-200",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
  );

  const variants = {
    primary: cn(
      "bg-amber-500 text-zinc-900",
      "hover:bg-amber-400",
      "shadow-md hover:shadow-lg hover:shadow-amber-500/20"
    ),
    secondary: cn(
      "bg-zinc-800 text-zinc-300",
      "hover:bg-zinc-700 hover:text-zinc-100",
      "border border-zinc-700/50"
    ),
    danger: cn(
      "bg-red-500/15 text-red-400",
      "hover:bg-red-500/25",
      "border border-red-500/30"
    ),
    ghost: cn(
      "bg-transparent text-zinc-400",
      "hover:bg-zinc-800/60 hover:text-zinc-200"
    ),
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <motion.button
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={TRANSITION_XFAST}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      disabled={disabled}
      {...props}
    >
      {children}
    </motion.button>
  );
}
