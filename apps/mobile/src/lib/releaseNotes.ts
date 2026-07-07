/**
 * Minimal renderer-side parser for GitHub release bodies produced by
 * release-please. Handles only the subset that appears in those bodies —
 * headings, bullets, bold, inline code, links, and trailing commit-hash
 * links — so the What's new sheet can render notes natively without a
 * markdown dependency.
 */

export type NoteBlock =
  | { type: "heading"; text: string }
  | { type: "bullet"; text: string }
  | { type: "paragraph"; text: string };

function stripInline(text: string): string {
  return (
    text
      // Trailing commit links release-please appends: " ([abc1234](url))"
      .replace(/\s*\(\[[0-9a-f]{6,40}\]\([^)]*\)\)/gi, "")
      // Links → their label
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      // Bold / italics markers
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      // Inline code
      .replace(/`([^`]+)`/g, "$1")
      .trim()
  );
}

export function parseReleaseNotes(body: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      const text = stripInline(heading[1]);
      // Release-please's top heading repeats the version + compare link;
      // the sheet already shows the version, so drop version-only headings.
      if (text && !/^\d+\.\d+\.\d+/.test(text)) {
        blocks.push({ type: "heading", text });
      }
      continue;
    }

    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      const text = stripInline(bullet[1]);
      if (text) blocks.push({ type: "bullet", text });
      continue;
    }

    const text = stripInline(line);
    if (text) blocks.push({ type: "paragraph", text });
  }

  return blocks;
}
