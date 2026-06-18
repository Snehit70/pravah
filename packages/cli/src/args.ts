import type { ParsedArgs } from "./types";

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith("--")) {
      positionals.push(part);
      continue;
    }

    const key = part.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = true;
      continue;
    }

    options[key] = next;
    index += 1;
  }

  return { positionals, options };
}

export function readOption(
  options: Record<string, string | boolean>,
  key: string
): string | undefined {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

export function hasFlag(
  options: Record<string, string | boolean>,
  key: string
): boolean {
  return options[key] === true;
}
