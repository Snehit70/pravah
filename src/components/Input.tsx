import { useId } from "react";
import { cn } from "../lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = props.id ?? generatedId;

  return (
    <div>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-[11px] text-zinc-400 uppercase tracking-[0.08em] font-medium mb-1.5"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "w-full bg-zinc-900 rounded-xl p-3 text-zinc-100",
          "border border-white/10",
          "placeholder:text-zinc-500",
          "transition-all duration-150",
          "focus:border-blue-500/60 focus:outline-none focus:shadow-[0_0_0_3px_rgba(35,131,226,0.2)]",
          "hover:border-white/20",
          error && "border-red-400/50 focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(248,113,113,0.2)]",
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-xs text-red-400 mt-1.5">{error}</p>
      )}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className, ...props }: TextareaProps) {
  const generatedId = useId();
  const textareaId = props.id ?? generatedId;

  return (
    <div>
      {label && (
        <label
          htmlFor={textareaId}
          className="block text-[11px] text-zinc-400 uppercase tracking-[0.08em] font-medium mb-1.5"
        >
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={cn(
          "w-full bg-zinc-900 rounded-xl p-3 text-zinc-100 resize-none",
          "border border-white/10",
          "placeholder:text-zinc-500",
          "transition-all duration-150",
          "focus:border-blue-500/60 focus:outline-none focus:shadow-[0_0_0_3px_rgba(35,131,226,0.2)]",
          "hover:border-white/20",
          error && "border-red-400/50 focus:border-red-400 focus:shadow-[0_0_0_3px_rgba(248,113,113,0.2)]",
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-xs text-red-400 mt-1.5">{error}</p>
      )}
    </div>
  );
}
