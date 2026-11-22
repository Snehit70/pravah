"use no memo";
import {
  FlexWidget,
  ImageWidget,
  ListWidget,
  SvgWidget,
  TextWidget,
  type ColorProp,
  type ImageWidgetSource,
} from "react-native-android-widget";
import ICON_SOURCE from "../../assets/icon.png";
import {
  attentionRows,
  rowsThatFit,
  type WidgetRow,
  type WidgetView,
} from "./widgetModel";
import { widgetFonts, type WidgetPalette } from "./widgetTheme";
import { widgetLink } from "./widgetLinks";
import { COMPLETE_ACTION, WIDGET_NAMES } from "./widgetNames";

/**
 * Home-screen widget layouts. These are not React Native views: the library
 * walks this JSX once and turns it into Android RemoteViews, so only its own
 * primitives (FlexWidget, TextWidget, ...) are allowed, there is no state, and
 * every colour must be a hex string.
 *
 * The tree builder calls each component as a plain function, so fragments
 * (`<>`) and components that return `null` crash it. Use conditional children
 * (`{x ? <A /> : null}`) instead.
 */

type Size = { width: number; height: number };

type Props = { view: WidgetView; palette: WidgetPalette; size: Size };

// ── Primitives ───────────────────────────────────────────────────────────

function Mono({ text, color, size = 10 }: { text: string; color: ColorProp; size?: number }) {
  return (
    <TextWidget
      text={text.toUpperCase()}
      maxLines={1}
      truncate="END"
      style={{ fontFamily: widgetFonts.mono, fontSize: size, color, letterSpacing: size * 0.06 }}
    />
  );
}

function Spacer() {
  return <FlexWidget style={{ flex: 1, height: 1 }} />;
}

function PlusButton({ palette, size = 28 }: { palette: WidgetPalette; size?: number }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: widgetLink("capture") }}
      accessibilityLabel="Capture a task"
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        backgroundColor: palette.accentSoft,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <TextWidget
        text="+"
        style={{ fontFamily: widgetFonts.medium, fontSize: size * 0.64, color: palette.accent }}
      />
    </FlexWidget>
  );
}

function BrandMark({ size }: { size: number }) {
  return (
    <ImageWidget
      image={ICON_SOURCE as ImageWidgetSource}
      imageWidth={size}
      imageHeight={size}
      radius={Math.round(size * 0.28)}
    />
  );
}

function checkSvg(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="${color}"/><path d="M4.6 8.3l2.2 2.2 4.6-4.8" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function ringColor(row: WidgetRow, palette: WidgetPalette): ColorProp {
  if (row.priority === "p1") return palette.p1;
  if (row.priority === "p2") return palette.p2;
  return palette.p3;
}

function Chip({ text, fg, bg, uri }: { text: string; fg: ColorProp; bg: ColorProp; uri?: string }) {
  return (
    <FlexWidget
      {...(uri ? { clickAction: "OPEN_URI", clickActionData: { uri } } : {})}
      style={{ backgroundColor: bg, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 }}
    >
      <TextWidget text={text} style={{ fontFamily: widgetFonts.medium, fontSize: 11, color: fg }} />
    </FlexWidget>
  );
}

function TaskRow({ row, palette }: { row: WidgetRow; palette: WidgetPalette }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: widgetLink("task", row.id) }}
      accessibilityLabel={row.title}
      style={{
        width: "match_parent",
        height: 30,
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: palette.row,
        borderRadius: 11,
        paddingRight: 9,
        marginBottom: 3,
      }}
    >
      <FlexWidget
        {...(row.done
          ? {}
          : {
              clickAction: COMPLETE_ACTION,
              clickActionData: { taskId: row.id, title: row.title },
              accessibilityLabel: `Complete ${row.title}`,
            })}
        style={{ width: 32, height: 30, justifyContent: "center", alignItems: "center" }}
      >
        {row.done ? (
          <SvgWidget svg={checkSvg(palette.success)} style={{ width: 15, height: 15 }} />
        ) : (
          <FlexWidget
            style={{
              width: 15,
              height: 15,
              borderRadius: 8,
              borderWidth: 1.6,
              borderColor: ringColor(row, palette),
            }}
          />
        )}
      </FlexWidget>
      <FlexWidget style={{ flex: 1, height: 30, justifyContent: "center" }}>
        <TextWidget
          text={row.title}
          maxLines={1}
          truncate="END"
          style={{
            fontFamily: widgetFonts.regular,
            fontSize: 13,
            color: row.done ? palette.textMuted : palette.text,
          }}
        />
      </FlexWidget>
      <TextWidget
        text={row.meta}
        maxLines={1}
        style={{
          fontFamily: widgetFonts.mono,
          fontSize: 10.5,
          marginLeft: 8,
          color: row.overdue ? palette.error : palette.textMuted,
        }}
      />
    </FlexWidget>
  );
}

function Header({
  palette,
  dateLabel,
  countLabel,
}: {
  palette: WidgetPalette;
  dateLabel: string;
  countLabel?: string;
}) {
  return (
    <FlexWidget
      style={{ width: "match_parent", flexDirection: "row", alignItems: "center", marginBottom: 8 }}
    >
      <FlexWidget
        clickAction="OPEN_URI"
        clickActionData={{ uri: widgetLink("today") }}
        accessibilityLabel="Open today"
        style={{ flex: 1, flexDirection: "row", alignItems: "center" }}
      >
        <TextWidget
          text="Today"
          style={{ fontFamily: widgetFonts.semibold, fontSize: 15, color: palette.text, marginRight: 8 }}
        />
        <Mono text={dateLabel} color={palette.textMuted} />
        <Spacer />
        {countLabel ? (
          <TextWidget
            text={countLabel}
            style={{ fontFamily: widgetFonts.regular, fontSize: 11, color: palette.textSecondary, marginRight: 8 }}
          />
        ) : null}
      </FlexWidget>
      <PlusButton palette={palette} />
    </FlexWidget>
  );
}

function Shell({
  palette,
  children,
  padding = 12,
  uri,
}: {
  palette: WidgetPalette;
  children: unknown;
  padding?: number;
  uri?: string;
}) {
  return (
    <FlexWidget
      {...(uri ? { clickAction: "OPEN_URI", clickActionData: { uri } } : {})}
      style={{
        width: "match_parent",
        height: "match_parent",
        backgroundColor: palette.bg,
        borderRadius: 22,
        padding,
        flexDirection: "column",
      }}
    >
      {children}
    </FlexWidget>
  );
}

function CenterMessage({
  palette,
  title,
  body,
  chip,
  button,
}: {
  palette: WidgetPalette;
  title: string;
  body?: string;
  chip?: { text: string; fg: ColorProp; bg: ColorProp };
  button?: { label: string; uri: string };
}) {
  return (
    <FlexWidget
      style={{ width: "match_parent", flex: 1, justifyContent: "center", alignItems: "center" }}
    >
      {chip ? (
        <FlexWidget style={{ marginBottom: 6 }}>
          <Chip text={chip.text} fg={chip.fg} bg={chip.bg} />
        </FlexWidget>
      ) : null}
      <TextWidget
        text={title}
        style={{ fontFamily: widgetFonts.semibold, fontSize: 15, color: palette.text, textAlign: "center" }}
      />
      {body ? (
        <TextWidget
          text={body}
          maxLines={2}
          truncate="END"
          style={{
            fontFamily: widgetFonts.regular,
            fontSize: 12,
            color: palette.textSecondary,
            textAlign: "center",
            marginTop: 3,
          }}
        />
      ) : null}
      {button ? (
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: button.uri }}
          style={{
            marginTop: 8,
            backgroundColor: palette.accent,
            borderRadius: 10,
            paddingHorizontal: 14,
            paddingVertical: 6,
          }}
        >
          <TextWidget
            text={button.label}
            style={{ fontFamily: widgetFonts.semibold, fontSize: 12, color: palette.onAccent }}
          />
        </FlexWidget>
      ) : null}
    </FlexWidget>
  );
}

function SignedOut({ palette }: { palette: WidgetPalette }) {
  return (
    <Shell palette={palette} uri={widgetLink("today")}>
      <FlexWidget style={{ flexDirection: "row", alignItems: "center" }}>
        <BrandMark size={22} />
        <TextWidget
          text="Pravah"
          style={{ fontFamily: widgetFonts.semibold, fontSize: 15, color: palette.text, marginLeft: 8 }}
        />
      </FlexWidget>
      <CenterMessage
        palette={palette}
        title="Signed out"
        body="Sign in to see today's tasks here"
        button={{ label: "Open Pravah", uri: widgetLink("today") }}
      />
    </Shell>
  );
}

function Skeleton({ palette, rows }: { palette: WidgetPalette; rows: number }) {
  return (
    <FlexWidget style={{ width: "match_parent", flexDirection: "column" }}>
      {Array.from({ length: rows }, (_, index) => (
        <FlexWidget
          key={index}
          style={{
            width: "match_parent",
            height: 26,
            borderRadius: 11,
            backgroundColor: palette.row,
            marginBottom: 5,
            marginRight: index === 1 ? 40 : index === 2 ? 80 : 0,
          }}
        />
      ))}
    </FlexWidget>
  );
}

type ReadyView = Extract<WidgetView, { kind: "ready" }>;

/** Footer priority: rejected write > stale > saving > summary. */
function FooterLine({
  view,
  palette,
  summary,
}: {
  view: ReadyView;
  palette: WidgetPalette;
  summary: string | null;
}) {
  let text: string | null = summary;
  let color: ColorProp = palette.textMuted;
  let uri: string | undefined;
  let mono = false;
  if (view.notice) {
    text = view.notice;
    color = palette.error;
    uri = widgetLink("today");
    mono = true;
  } else if (view.stale) {
    text = `● Last synced ${view.syncedAgo} · tap to refresh`;
    color = palette.warning;
    uri = widgetLink("today");
    mono = true;
  } else if (view.savingCount > 0) {
    text = view.savingCount === 1 ? "Saving… syncs when online" : `Saving ${view.savingCount}… syncs when online`;
  }
  if (!text) return <FlexWidget style={{ width: "match_parent", height: 1 }} />;
  return (
    <FlexWidget
      {...(uri ? { clickAction: "OPEN_URI", clickActionData: { uri } } : {})}
      style={{ width: "match_parent", paddingTop: 3, paddingLeft: 2 }}
    >
      {mono ? (
        <Mono text={text} color={color} />
      ) : (
        <TextWidget
          text={text}
          maxLines={1}
          truncate="END"
          style={{ fontFamily: widgetFonts.regular, fontSize: 11, color }}
        />
      )}
    </FlexWidget>
  );
}

function plural(count: number, word: string) {
  return `${count} ${word}`;
}

function allClearMessage(view: ReadyView, palette: WidgetPalette) {
  if (view.done.length > 0) {
    const next = view.tomorrow[0];
    return (
      <CenterMessage
        palette={palette}
        chip={{
          text: `${view.done.length} of ${view.done.length} done`,
          fg: palette.success,
          bg: palette.successSoft,
        }}
        title="Clear for today"
        body={
          next
            ? `Tomorrow: ${next.title}${view.tomorrow.length > 1 ? ` +${view.tomorrow.length - 1}` : ""}`
            : undefined
        }
      />
    );
  }
  if (view.inboxCount > 0) {
    return (
      <CenterMessage
        palette={palette}
        title="Nothing scheduled"
        body={`${plural(view.inboxCount, view.inboxCount === 1 ? "task" : "tasks")} waiting in Inbox`}
        button={{ label: "Triage Inbox", uri: widgetLink("inbox") }}
      />
    );
  }
  return <CenterMessage palette={palette} title="Nothing scheduled" body="Tap + to capture a task" />;
}

// ── Medium 4×2: Today ────────────────────────────────────────────────────

export function TodayWidget({ view, palette, size }: Props) {
  if (view.kind === "signedOut") return <SignedOut palette={palette} />;
  if (view.kind === "loading") {
    return (
      <Shell palette={palette}>
        <Header palette={palette} dateLabel={view.dateLabel} />
        <Skeleton palette={palette} rows={3} />
      </Shell>
    );
  }
  const rows = [...attentionRows(view), ...view.done.filter((row) => row.saving)];
  if (rows.length === 0) {
    return (
      <Shell palette={palette}>
        <Header palette={palette} dateLabel={view.dateLabel} />
        {allClearMessage(view, palette)}
        <FooterLine view={view} palette={palette} summary={null} />
      </Shell>
    );
  }
  const capacity = rowsThatFit(size.height, 76, 33);
  const shown = rows.slice(0, capacity);
  const hidden = rows.length - shown.length;
  const hiddenOverdue = view.overdue.filter((row) => !shown.includes(row)).length;
  const parts = [
    hidden > 0 ? `+${hidden} more` : null,
    hiddenOverdue > 0 ? `${hiddenOverdue} overdue` : null,
    view.done.length > 0 ? `${view.done.length} done` : null,
  ].filter(Boolean);
  return (
    <Shell palette={palette}>
      <Header
        palette={palette}
        dateLabel={view.dateLabel}
        countLabel={view.remaining > 0 ? `${view.remaining} left` : undefined}
      />
      <FlexWidget style={{ width: "match_parent", flex: 1, flexDirection: "column" }}>
        {shown.map((row) => (
          <TaskRow key={row.id} row={row} palette={palette} />
        ))}
      </FlexWidget>
      <FooterLine view={view} palette={palette} summary={parts.length > 0 ? parts.join(" · ") : null} />
    </Shell>
  );
}

// ── Large 4×4: Agenda ────────────────────────────────────────────────────

function SectionLabel({ text, color }: { text: string; color: ColorProp }) {
  return (
    <FlexWidget style={{ width: "match_parent", paddingTop: 6, paddingBottom: 4, paddingLeft: 2 }}>
      <Mono text={text} color={color} />
    </FlexWidget>
  );
}

export function AgendaWidget({ view, palette }: Props) {
  if (view.kind === "signedOut") return <SignedOut palette={palette} />;
  if (view.kind === "loading") {
    return (
      <Shell palette={palette}>
        <Header palette={palette} dateLabel={view.dateLabel} />
        <Skeleton palette={palette} rows={6} />
      </Shell>
    );
  }
  const hasAttention = view.overdue.length + view.today.length > 0;
  const items: { key: string; node: unknown }[] = [];
  if (view.overdue.length > 0) {
    items.push({ key: "h-overdue", node: <SectionLabel text={`Overdue · ${view.overdue.length}`} color={palette.error} /> });
    for (const row of view.overdue) items.push({ key: row.id, node: <TaskRow row={row} palette={palette} /> });
  }
  if (view.today.length > 0 || view.done.length > 0) {
    const label = view.today.length > 0 ? `Today · ${view.today.length} left` : "Today · all done";
    items.push({ key: "h-today", node: <SectionLabel text={label} color={palette.textMuted} /> });
    for (const row of view.today) items.push({ key: row.id, node: <TaskRow row={row} palette={palette} /> });
    for (const row of view.done) items.push({ key: `done-${row.id}`, node: <TaskRow row={row} palette={palette} /> });
  }
  if (view.tomorrow.length > 0) {
    items.push({ key: "h-tomorrow", node: <SectionLabel text="Tomorrow" color={palette.textMuted} /> });
    for (const row of view.tomorrow) items.push({ key: `t-${row.id}`, node: <TaskRow row={row} palette={palette} /> });
  }

  return (
    <Shell palette={palette}>
      <Header palette={palette} dateLabel={view.dateLabel} />
      {!hasAttention && view.done.length === 0 && view.tomorrow.length === 0 ? (
        allClearMessage(view, palette)
      ) : (
        <FlexWidget style={{ width: "match_parent", flex: 1 }}>
          <ListWidget style={{ width: "match_parent", height: "match_parent" }}>
            {items.map((item) => (
              <FlexWidget key={item.key} style={{ width: "match_parent", flexDirection: "column" }}>
                {item.node}
              </FlexWidget>
            ))}
          </ListWidget>
        </FlexWidget>
      )}
      <FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "center", paddingTop: 6 }}>
        {view.inboxCount > 0 ? (
          <Chip text={`Inbox ${view.inboxCount}`} fg={palette.accent} bg={palette.accentSoft} uri={widgetLink("inbox")} />
        ) : null}
        <Spacer />
        {view.notice || view.stale || view.savingCount > 0 ? (
          <FooterLine view={view} palette={palette} summary={null} />
        ) : (
          <Mono text={`Synced ${view.syncedAgo}`} color={palette.textMuted} />
        )}
      </FlexWidget>
    </Shell>
  );
}

// ── Small 2×2: Focus ─────────────────────────────────────────────────────

export function FocusWidget({ view, palette, size }: Props) {
  if (view.kind === "signedOut") {
    return (
      <Shell palette={palette} uri={widgetLink("today")}>
        <BrandMark size={22} />
        <Spacer />
        <TextWidget text="Signed out" style={{ fontFamily: widgetFonts.semibold, fontSize: 14, color: palette.text }} />
        <TextWidget
          text="Open Pravah to sign in"
          style={{ fontFamily: widgetFonts.regular, fontSize: 11, color: palette.textSecondary, marginTop: 2 }}
        />
      </Shell>
    );
  }
  const compact = size.height < 150;
  const topRow = (dateLabel: string) => (
    <FlexWidget style={{ width: "match_parent", flexDirection: "row", alignItems: "center" }}>
      <Mono text="Today" color={palette.textMuted} />
      <Spacer />
      <Mono text={dateLabel.split(" ").slice(0, 2).join(" ")} color={palette.textMuted} />
    </FlexWidget>
  );
  if (view.kind === "loading") {
    return (
      <Shell palette={palette} uri={widgetLink("today")}>
        {topRow(view.dateLabel)}
        <FlexWidget style={{ marginTop: 10 }}>
          <Skeleton palette={palette} rows={2} />
        </FlexWidget>
      </Shell>
    );
  }
  const next = view.nextTimed;
  return (
    <Shell palette={palette} uri={widgetLink("today")}>
      {topRow(view.dateLabel)}
      <FlexWidget style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 6, marginBottom: compact ? 4 : 8 }}>
        {view.remaining > 0 ? (
          <TextWidget
            text={String(view.remaining)}
            style={{ fontFamily: widgetFonts.semibold, fontSize: compact ? 30 : 38, color: palette.text }}
          />
        ) : null}
        {view.remaining > 0 ? (
          <TextWidget
            text="left"
            style={{ fontFamily: widgetFonts.regular, fontSize: 11, color: palette.textSecondary, marginLeft: 5, marginBottom: 6 }}
          />
        ) : (
          <TextWidget
            text={view.done.length > 0 ? "All clear" : "Nothing due"}
            style={{ fontFamily: widgetFonts.semibold, fontSize: 18, color: palette.text }}
          />
        )}
      </FlexWidget>
      {next ? (
        <FlexWidget style={{ width: "match_parent", flexDirection: "column" }}>
          <Mono
            text={next.overdue ? `Overdue · ${next.meta}` : next.meta === "—" ? "Next" : `Next · ${next.meta}`}
            color={next.overdue ? palette.error : palette.accent}
          />
          <TextWidget
            text={next.title}
            maxLines={compact ? 1 : 2}
            truncate="END"
            style={{ fontFamily: widgetFonts.medium, fontSize: 12.5, color: palette.text, marginTop: 3 }}
          />
        </FlexWidget>
      ) : view.inboxCount > 0 ? (
        <TextWidget
          text={`Inbox ${view.inboxCount}`}
          style={{ fontFamily: widgetFonts.regular, fontSize: 12, color: palette.textSecondary }}
        />
      ) : null}
      <Spacer />
      {view.stale ? (
        <Mono text={`Synced ${view.syncedAgo}`} color={palette.warning} />
      ) : view.overdue.length > 0 && next && !next.overdue ? (
        <FlexWidget style={{ flexDirection: "row" }}>
          <Chip text={`${view.overdue.length} overdue`} fg={palette.error} bg={palette.errorSoft} />
        </FlexWidget>
      ) : null}
    </Shell>
  );
}

// ── Capture 2×1 and 1×1 ──────────────────────────────────────────────────

export function CaptureWidget({ palette }: { palette: WidgetPalette }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: widgetLink("capture") }}
      accessibilityLabel="Capture a task in Pravah"
      style={{
        width: "match_parent",
        height: "match_parent",
        backgroundColor: palette.bg,
        borderRadius: 22,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
      }}
    >
      <BrandMark size={24} />
      <TextWidget
        text="Capture"
        style={{ fontFamily: widgetFonts.semibold, fontSize: 13.5, color: palette.text, marginLeft: 9 }}
      />
      <Spacer />
      <FlexWidget
        style={{
          width: 24,
          height: 24,
          borderRadius: 8,
          backgroundColor: palette.accentSoft,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <TextWidget text="+" style={{ fontFamily: widgetFonts.medium, fontSize: 16, color: palette.accent }} />
      </FlexWidget>
    </FlexWidget>
  );
}

export function CaptureIconWidget({ palette }: { palette: WidgetPalette }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: widgetLink("capture") }}
      accessibilityLabel="Capture a task in Pravah"
      style={{
        width: "match_parent",
        height: "match_parent",
        backgroundColor: palette.bg,
        borderRadius: 22,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <BrandMark size={38} />
    </FlexWidget>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function renderWidgetByName(name: string, props: Props) {
  switch (name) {
    case WIDGET_NAMES.focus:
      return <FocusWidget {...props} />;
    case WIDGET_NAMES.agenda:
      return <AgendaWidget {...props} />;
    case WIDGET_NAMES.capture:
      return <CaptureWidget palette={props.palette} />;
    case WIDGET_NAMES.captureIcon:
      return <CaptureIconWidget palette={props.palette} />;
    case WIDGET_NAMES.today:
    default:
      return <TodayWidget {...props} />;
  }
}
