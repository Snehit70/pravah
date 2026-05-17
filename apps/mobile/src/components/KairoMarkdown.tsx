/**
 * KairoMarkdown
 *
 * Minimal markdown renderer for assistant bubbles. Supports the subset the
 * model actually produces in chat: paragraphs, bullet/numbered lists, bold,
 * italic, and inline code. Headers, links, and code blocks are out of scope
 * — they show up rarely and would balloon the renderer with little payoff.
 *
 * The renderer is intentionally a stand-alone module rather than a dep so
 * we control styling (token-aligned), avoid native-module surprises in Expo,
 * and don't inherit a slow-moving library's maintenance posture.
 */

import { Fragment, type ReactNode } from "react";
import { StyleSheet, Text, View, type TextStyle } from "react-native";
import { colors, fonts, spacing, typography } from "../theme/tokens";

type Props = {
  text: string;
  baseStyle?: TextStyle;
};

export function KairoMarkdown({ text, baseStyle }: Props) {
  const blocks = splitBlocks(text);
  return (
    <View style={styles.wrap}>
      {blocks.map((block, i) => (
        <Fragment key={i}>{renderBlock(block, baseStyle)}</Fragment>
      ))}
    </View>
  );
}

function splitBlocks(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
}

function renderBlock(block: string, baseStyle?: TextStyle): ReactNode {
  const lines = block.split("\n");
  if (lines.length > 0 && lines.every((l) => /^[-*]\s+/.test(l))) {
    return <BulletList lines={lines} baseStyle={baseStyle} />;
  }
  if (lines.length > 0 && lines.every((l) => /^\d+\.\s+/.test(l))) {
    return <NumberedList lines={lines} baseStyle={baseStyle} />;
  }
  return (
    <Text style={[styles.paragraph, baseStyle]}>{renderInline(block)}</Text>
  );
}

function BulletList({ lines, baseStyle }: { lines: string[]; baseStyle?: TextStyle }) {
  return (
    <View style={styles.list}>
      {lines.map((line, i) => {
        const content = line.replace(/^[-*]\s+/, "");
        return (
          <View key={i} style={styles.listRow}>
            <Text style={[styles.bullet, baseStyle]}>•</Text>
            <Text style={[styles.listText, baseStyle]}>{renderInline(content)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function NumberedList({ lines, baseStyle }: { lines: string[]; baseStyle?: TextStyle }) {
  return (
    <View style={styles.list}>
      {lines.map((line, i) => {
        const match = line.match(/^(\d+)\.\s+(.*)$/);
        const num = match?.[1] ?? `${i + 1}`;
        const content = match?.[2] ?? line;
        return (
          <View key={i} style={styles.listRow}>
            <Text style={[styles.bullet, baseStyle]}>{num}.</Text>
            <Text style={[styles.listText, baseStyle]}>{renderInline(content)}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Tokenize a string into bold/italic/code/plain runs. Sequential only —
 *  the chat model rarely nests inline formatting, and supporting it would
 *  require a real parser. */
function renderInline(text: string): ReactNode[] {
  const tokens: ReactNode[] = [];
  // Order matters: ** before * so bold beats italic.
  const regex = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }
    const piece = match[0];
    if (piece.startsWith("**")) {
      tokens.push(
        <Text key={`b-${key++}`} style={styles.bold}>
          {piece.slice(2, -2)}
        </Text>
      );
    } else if (piece.startsWith("`")) {
      tokens.push(
        <Text key={`c-${key++}`} style={styles.code}>
          {piece.slice(1, -1)}
        </Text>
      );
    } else {
      tokens.push(
        <Text key={`i-${key++}`} style={styles.italic}>
          {piece.slice(1, -1)}
        </Text>
      );
    }
    lastIndex = match.index + piece.length;
  }
  if (lastIndex < text.length) tokens.push(text.slice(lastIndex));
  return tokens;
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  paragraph: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  list: {
    gap: 2,
  },
  listRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start",
  },
  bullet: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    minWidth: 16,
  },
  listText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    flex: 1,
  },
  bold: {
    fontFamily: fonts.sansSemibold,
  },
  italic: {
    fontStyle: "italic",
  },
  code: {
    fontFamily: fonts.mono,
    backgroundColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 4,
    borderRadius: 3,
  },
});
