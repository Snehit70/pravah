import { motion } from "framer-motion";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
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
  ...props
}: ButtonProps) {
  const baseStyles = "rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    primary: "bg-white text-zinc-900 hover:bg-zinc-200",
    secondary: "bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
    danger: "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30",
    ghost: "bg-transparent text-zinc-400 hover:bg-zinc-800/50",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </motion.button>
  );
}
