import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function command(args: string[], cwd = process.cwd()): string {
  return execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}
export function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
export function output(values: Record<string, string | boolean>): void {
  const text = Object.entries(values).map(([name, value]) => `${name}=${value}\n`).join("");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text);
  process.stdout.write(text);
}
export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
export function json<T>(path: string): T { return JSON.parse(readFileSync(path, "utf8")) as T; }
export function api<T>(path: string): T {
  return JSON.parse(command(["gh", "api", path])) as T;
}
