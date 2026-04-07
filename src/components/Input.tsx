import { cn } from "../lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label className="block text-[11px] text-zinc-500 uppercase tracking-[0.08em] font-medium mb-1.5">
          {label}
        </label>
      )}
      <input
        className={cn(
          "w-full bg-zinc-800/80 rounded-xl p-3 text-zinc-100",
          "border border-zinc-700/50",
          "placeholder:text-zinc-600",
          "transition-all duration-150",
          "focus:border-amber-500/50 focus:outline-none focus:shadow-[0_0_0_3px_rgba(232,169,69,0.15)]",
          "hover:border-zinc-600",
          error && "border-red-500/50 focus:border-red-500/50 focus:shadow-[0_0_0_3px_rgba(248,113,113,0.2)]",
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
  return (
    <div>
      {label && (
        <label className="block text-[11px] text-zinc-500 uppercase tracking-[0.08em] font-medium mb-1.5">
          {label}
        </label>
      )}
      <textarea
        className={cn(
          "w-full bg-zinc-800/80 rounded-xl p-3 text-zinc-100 resize-none",
          "border border-zinc-700/50",
          "placeholder:text-zinc-600",
          "transition-all duration-150",
          "focus:border-amber-500/50 focus:outline-none focus:shadow-[0_0_0_3px_rgba(232,169,69,0.15)]",
          "hover:border-zinc-600",
          error && "border-red-500/50 focus:border-red-500/50 focus:shadow-[0_0_0_3px_rgba(248,113,113,0.2)]",
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
