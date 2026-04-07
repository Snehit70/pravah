import { cn } from "../lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div>
      {label && (
        <label className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
          {label}
        </label>
      )}
      <input
        className={cn(
          "w-full bg-zinc-800/80 border border-zinc-700/50 rounded-xl p-3 text-white",
          "placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none",
          "transition-colors duration-150",
          error && "border-red-500/50 focus:border-red-500",
          label && "mt-1.5",
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
        <label className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
          {label}
        </label>
      )}
      <textarea
        className={cn(
          "w-full bg-zinc-800/80 border border-zinc-700/50 rounded-xl p-3 text-white resize-none",
          "placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none",
          "transition-colors duration-150",
          error && "border-red-500/50 focus:border-red-500",
          label && "mt-1.5",
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
