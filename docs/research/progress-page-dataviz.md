# Progress Page Data-Viz — Implementation Craft Research

Research notes for building the Pravah mobile "Progress" analytics page.

**Hard stack constraint:** charts render with **react-native-svg + react-native-reanimated (v4.3.1) + react-native-gesture-handler (v2.31) ONLY**. No Skia, no Victory, no chart library. Everything below is JS/TS-only and therefore OTA-safe (EAS Update / no native rebuild).

Every non-obvious claim is followed by its source URL. Code is written to drop into a React Native component with minimal edits.

---

## 1. Smooth gradient area chart

### 1.1 Path interpolation: monotone cubic vs Catmull-Rom → Bézier

For daily count data (steps, tasks, minutes) you almost always want **monotone cubic interpolation**, because it is guaranteed not to overshoot between data points — the curve never dips below/above a local run of values, so a series like `[0, 0, 5]` will not draw a negative-looking dip before the rise. Catmull-Rom produces a rounder, more "organic" curve but **overshoots** on sharp changes, which reads as fake data (a bar that "goes negative"). Use monotone for the hero chart; keep Catmull-Rom only if you deliberately want a decorative, non-quantitative flourish.

Both methods convert a polyline into a sequence of SVG cubic Bézier commands (`C c1x,c1y c2x,c2y x,y`). They differ only in **how the tangent (slope) at each point is chosen**. Given a Hermite tangent `m_i` at point `i`, the Bézier control points for the segment `p_i → p_{i+1}` are placed at one-third of the x-distance:

```
dx  = (x_{i+1} - x_i) / 3
c1  = ( x_i + dx ,       y_i + dx * m_i     )
c2  = ( x_{i+1} - dx ,   y_{i+1} - dx * m_{i+1} )
```

This "cubic Hermite spline expressed as cubic Bézier" placement is exactly what d3-shape's monotone curve emits in its `point()` function (`bezierCurveTo(x0+dx, y0+dx*t0, x1-dx, y1-dx*t1, x1, y1)`). Source: https://github.com/d3/d3-shape/blob/main/src/curve/monotone.js

**Monotone tangent selection (Fritsch–Carlson / Steffen).** The interior slope is the sign-matched minimum of the two adjacent secant slopes, clamped so it can never exceed them — this is the anti-overshoot guarantee. d3 computes `p = (s0*h1 + s1*h0)/(h0+h1)` and returns `(sign(s0)+sign(s1)) * min(|s0|, |s1|, 0.5*|p|)`, and forces the tangent to `0` at any local extremum (`s0*s1 <= 0`). Source: https://github.com/d3/d3-shape/blob/main/src/curve/monotone.js and the d3 curve API https://d3js.org/d3-shape/curve#curveMonotoneX

**Catmull-Rom tangent selection.** Uniform Catmull-Rom uses `m_i = (p_{i+1} - p_{i-1}) / 2`, which substituted into the 1/3 control-point rule gives the well-known closed form `c1 = p_i + (p_{i+1} - p_{i-1})/6`, `c2 = p_{i+1} - (p_{i+2} - p_i)/6`. It has no clamping term, hence the overshoot. Source (d3 implementation): https://github.com/d3/d3-shape/blob/main/src/curve/catmullRom.js

**Reference implementation — points → SVG `d` string (monotone, self-contained, no d3):**

```ts
type Pt = { x: number; y: number };
const sgn = (x: number) => (x < 0 ? -1 : 1);

/** Fritsch–Carlson / Steffen monotone tangents. Never overshoots. */
function monotoneTangents(pts: Pt[]): number[] {
  const n = pts.length;
  const h: number[] = [];   // segment widths
  const s: number[] = [];   // secant slopes
  for (let i = 0; i < n - 1; i++) {
    h[i] = pts[i + 1].x - pts[i].x;
    s[i] = (pts[i + 1].y - pts[i].y) / h[i];
  }
  const m = new Array<number>(n);
  m[0] = s[0];
  m[n - 1] = s[n - 2];
  for (let i = 1; i < n - 1; i++) {
    const s0 = s[i - 1], s1 = s[i];
    if (s0 * s1 <= 0) {
      m[i] = 0;                        // local extremum -> flat (no overshoot)
    } else {
      const p = (s0 * h[i] + s1 * h[i - 1]) / (h[i - 1] + h[i]);
      m[i] = (sgn(s0) + sgn(s1)) *
             Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p));
    }
  }
  return m;
}

/** Monotone-cubic SVG path through points (x ascending). */
export function monotoneLinePath(pts: Pt[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  if (pts.length === 2)
    return `M${pts[0].x},${pts[0].y}L${pts[1].x},${pts[1].y}`;
  const m = monotoneTangents(pts);
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1];
    const dx = (p1.x - p0.x) / 3;
    d += `C${p0.x + dx},${p0.y + dx * m[i]} ` +
         `${p1.x - dx},${p1.y - dx * m[i + 1]} ${p1.x},${p1.y}`;
  }
  return d;
}
```

The SVG `d` grammar (`M`, `L`, `C`) used above: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/d

### 1.2 Gradient fill under the line

Close the area by appending a line down to the baseline (chart bottom `y = h`) under the last point, across to the baseline under the first point, and `Z`:

```ts
export function areaPath(line: string, firstX: number, lastX: number, baselineY: number) {
  return `${line}L${lastX},${baselineY}L${firstX},${baselineY}Z`;
}
```

Fill it with a vertical `LinearGradient` declared once in `<Defs>` and referenced by `fill="url(#id)"`. In react-native-svg a vertical gradient is `x1==x2`, `y1 != y2` (the docs note horizontal gradients are `y1==y2`, so the transpose is vertical). Source: https://github.com/software-mansion/react-native-svg/blob/main/USAGE.md

```tsx
import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';

<Svg width={W} height={H}>
  <Defs>
    <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
      {/* single accent hue, fading to transparent at the baseline */}
      <Stop offset="0"   stopColor="#8B5CF6" stopOpacity="0.35" />
      <Stop offset="1"   stopColor="#8B5CF6" stopOpacity="0"    />
    </LinearGradient>
  </Defs>
  <Path d={areaPath(line, x0, xN, H)} fill="url(#area)" />
  <Path d={line} stroke="#8B5CF6" strokeWidth={2} fill="none" />
</Svg>
```

`x1/y1/x2/y2` default to objectBoundingBox coordinates (0..1) spanning the filled element's bounding box, so `y1=0 → y2=1` maps top→bottom of the area regardless of pixel height. Source: https://github.com/software-mansion/react-native-svg/blob/main/USAGE.md and gradientUnits spec https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/gradientUnits

### 1.3 Animated "draw-on"

**Driving react-native-svg props from reanimated.** SVG attributes (`d`, `cx`, `strokeDashoffset`, …) are *props, not style keys*, so you cannot animate them via `useAnimatedStyle`. Wrap the SVG element with `Animated.createAnimatedComponent` and feed it an `animatedProps` object built by `useAnimatedProps`. Source: https://docs.swmansion.com/react-native-reanimated/docs/guides/animating-svg and https://docs.swmansion.com/react-native-reanimated/docs/core/useAnimatedProps/

```tsx
import Animated, {
  useSharedValue, useAnimatedProps, withTiming, Easing,
} from 'react-native-reanimated';
import { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);
```

**Line draw-on via `strokeDashoffset`.** Set `strokeDasharray` to the path's total length so the whole line is one dash, then animate `strokeDashoffset` from `length → 0`. As the offset shrinks, the solid dash sweeps in. This is the canonical SVG line-drawing trick (`stroke-dasharray = length`, `stroke-dashoffset: length → 0`). Source: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dashoffset

`strokeDashoffset` is explicitly listed as an animatable react-native-svg property on Android/iOS/Web by the reanimated SVG guide. Source: https://docs.swmansion.com/react-native-reanimated/docs/guides/animating-svg

Get the length OTA-safely without native calls by using the **control-polygon upper bound** of the Bézier segments (`|p0→c1| + |c1→c2| + |c2→p1|` per segment ≥ true arc length; over-estimating only makes the reveal finish imperceptibly early, never dashed):

```ts
export function pathLengthUpperBound(pts: Pt[]): number {
  const m = monotoneTangents(pts);
  const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i], p1 = pts[i + 1], dx = (p1.x - p0.x) / 3;
    const c1 = { x: p0.x + dx, y: p0.y + dx * m[i] };
    const c2 = { x: p1.x - dx, y: p1.y - dx * m[i + 1] };
    L += dist(p0, c1) + dist(c1, c2) + dist(c2, p1);
  }
  return L;
}
```

```tsx
function DrawOnLine({ d, length, progress }: {
  d: string; length: number; progress: Animated.SharedValue<number>; // 0→1
}) {
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: length * (1 - progress.value),
  }));
  return (
    <AnimatedPath
      d={d} stroke="#8B5CF6" strokeWidth={2} fill="none"
      strokeDasharray={length}
      animatedProps={animatedProps}
    />
  );
}

// on mount / when range changes:
progress.value = 0;
progress.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
```

**Gradient rise (fill opacity + translateY).** Animate the area's `fillOpacity` and a small upward `translateY` on a wrapping `<G>` so the fill "rises" into place while the line draws. Fade slightly behind the line for depth:

```tsx
import { G } from 'react-native-svg';
const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedArea = Animated.createAnimatedComponent(Path);

const areaProps = useAnimatedProps(() => ({ fillOpacity: progress.value }));
const gProps = useAnimatedProps(() => ({
  // translate down->up as it fades in (12px lift)
  transform: [{ translateY: 12 * (1 - progress.value) }],
}));

<AnimatedG animatedProps={gProps}>
  <AnimatedArea d={areaD} fill="url(#area)" animatedProps={areaProps} />
</AnimatedG>
```

**CAVEAT — do not animate the `d` prop per frame.** Animating `d` means re-parsing/re-tessellating the whole path each frame. The reanimated SVG guide notes `d` only morphs between paths *with matching command structure* and otherwise "snaps" (on Web), and morphing is the heavy path even where supported. Prefer animating cheap scalar props — `strokeDashoffset`, `fillOpacity`, `opacity`, and `transform` (translate/scale) — and keep `d` **static** for a given range. Source: https://docs.swmansion.com/react-native-reanimated/docs/guides/animating-svg

---

## 2. Calendar heatmap (SVG `<Rect>` grid)

### 2.1 Layout math (month block, weekday columns)

Lay each month as its own block: 7 columns = weekdays (Sun..Sat), rows = the weeks the month spans. For day-of-month `dOM` (1-based) in a month whose 1st falls on weekday `firstWeekday` (`new Date(y, mo, 1).getDay()`, 0=Sun):

```ts
const CELL = 14;      // cell edge in px
const GAP  = 3;       // gap between cells
const STEP = CELL + GAP;

function cellXY(firstWeekday: number, dOM: number, originX = 0, originY = 0) {
  const idx = firstWeekday + (dOM - 1); // linear index in the month grid
  const col = idx % 7;                  // weekday column -> alignment
  const row = Math.floor(idx / 7);      // week row within the month
  return { x: originX + col * STEP, y: originY + row * STEP };
}
```

The `firstWeekday` offset is exactly what aligns every date under its correct weekday column; without it, columns drift. A month spans `Math.ceil((firstWeekday + daysInMonth) / 7)` rows, so a month block's height is `rows * STEP - GAP`. `Rect` sizing/positioning (`x`, `y`, `width`, `height`, `rx` for rounded cells): https://github.com/software-mansion/react-native-svg/blob/main/USAGE.md

```tsx
<Rect x={x} y={y} width={CELL} height={CELL} rx={3} fill={rampColor(value)} />
```

(For a GitHub-style contribution graph instead — columns = weeks, rows = weekdays — swap the axes: `col = weekIndex`, `row = date.getDay()`. Same STEP math.)

### 2.2 Single-hue intensity ramp

Quantize into a few buckets (GitHub uses ~5 including empty) so the scale reads as discrete levels rather than noisy continuous shading. Ramp a **single hue** by opacity over the theme accent, which keeps it calm and works in dark mode without a rainbow:

```ts
const ACCENT = '#8B5CF6';
const EMPTY  = 'rgba(255,255,255,0.05)'; // faint track cell on dark bg

/** 0 = empty; else 1..4 buckets -> increasing opacity of the single accent hue */
function rampColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return EMPTY;
  const bucket = Math.min(4, Math.ceil((value / max) * 4)); // 1..4
  const opacity = [0, 0.28, 0.5, 0.74, 1.0][bucket];
  return `rgba(139,92,246,${opacity})`;
}
```

Quantize/threshold buckets are the standard sequential-scale approach (d3 `scaleQuantize` concept): https://d3js.org/d3-scale/quantize . Prefer opacity-over-accent (or a single-hue lightness ramp) rather than multi-hue, so intensity maps monotonically to "more".

### 2.3 Performance with hundreds of cells

A year is ~365 `<Rect>` nodes; that is fine for a static grid, but treat it as a **render-once** surface:
- Build the `{x, y, fill, key}` array with `useMemo` keyed on the data; never rebuild per animation frame.
- Do **not** animate individual cells with per-cell shared values — that multiplies node updates. If you want an intro, fade/scale the whole `<Svg>` (one `opacity`/`transform`) via a single `useAnimatedProps`.
- Keep the whole heatmap in one `<Svg>`; each extra `<Svg>` is a separate native view. Minimizing SVG node count and re-renders is the primary lever for RN SVG perf — see the reanimated guidance to keep worklet/graphics work light: https://docs.swmansion.com/react-native-reanimated/docs/guides/animating-svg

---

## 3. Touch-scrubbing the chart (gesture-handler + reanimated)

Pattern: a `Gesture.Pan()` whose callbacks are worklets (auto-workletized when reanimated is installed), mapping finger `x` → nearest data index via **binary search**, moving a vertical indicator + readout entirely on the UI thread, and using `runOnJS` only to fire haptics / set the readout text on index change. Source (gesture + shared values, callbacks run on UI thread): https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/handling-gestures/ and Pan API: https://docs.swmansion.com/react-native-gesture-handler/docs/gestures/pan-gesture/

`runOnJS` schedules a non-worklet JS function (React setState, native module calls like haptics) from inside a worklet — required because those cannot run on the UI thread. Source: https://docs.swmansion.com/react-native-reanimated/docs/threading/runOnJS/

`expo-haptics` calls (`selectionAsync`, `impactAsync(ImpactFeedbackStyle.Light)`) return Promises and run on the JS thread — they **cannot** be called from a worklet directly, hence `runOnJS`. Source: https://docs.expo.dev/versions/latest/sdk/haptics/

```tsx
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedProps, useAnimatedStyle, runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Line } from 'react-native-svg';

const AnimatedLine = Animated.createAnimatedComponent(Line);

// `xs`: precomputed screen-x per data point (ascending). `ys`: screen-y per point.
function Scrubbable({ xs, ys, data, height }: {
  xs: number[]; ys: number[]; data: number[]; height: number;
}) {
  const cursorX   = useSharedValue(0);
  const cursorY   = useSharedValue(0);
  const activeIdx = useSharedValue(-1);
  const visible   = useSharedValue(0);

  const onIndexChange = (i: number) => {
    Haptics.selectionAsync();          // JS thread only
    setReadout({ label: fmtDate(i), value: data[i] }); // React state for the text
  };
  const [readout, setReadout] = React.useState<{label: string; value: number} | null>(null);

  // Binary search for nearest x. Uniform daily data could use round((x-x0)/step),
  // but bisection is robust to non-uniform spacing (gaps / missing days).
  const update = (x: number) => {
    'worklet';
    const clamped = Math.max(xs[0], Math.min(x, xs[xs.length - 1]));
    let lo = 0, hi = xs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] < clamped) lo = mid + 1; else hi = mid;
    }
    if (lo > 0 && Math.abs(xs[lo - 1] - clamped) <= Math.abs(xs[lo] - clamped)) lo -= 1;
    cursorX.value = xs[lo];
    cursorY.value = ys[lo];
    if (lo !== activeIdx.value) {
      activeIdx.value = lo;
      runOnJS(onIndexChange)(lo);      // haptic + readout only on day change
    }
  };

  const pan = Gesture.Pan()
    .onBegin((e) => { visible.value = 1; update(e.x); })
    .onUpdate((e) => update(e.x))
    .onFinalize(() => { visible.value = 0; activeIdx.value = -1; });

  const lineProps = useAnimatedProps(() => ({
    x1: cursorX.value, x2: cursorX.value,
    opacity: visible.value,
  }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: visible.value,
    transform: [{ translateX: cursorX.value - 5 }, { translateY: cursorY.value - 5 }],
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: visible.value,
    transform: [{ translateX: cursorX.value - 40 }], // center an 80px pill
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View>
        <Svg width={W} height={height}>
          {/* ...area + line... */}
          <AnimatedLine y1={0} y2={height} stroke="#8B5CF6" strokeWidth={1}
                        animatedProps={lineProps} />
        </Svg>
        {/* dot + floating readout are RN Views overlaid, positioned by translate */}
        <Animated.View style={[styles.dot, dotStyle]} />
        <Animated.View style={[styles.readout, labelStyle]}>
          {readout && <Text>{readout.label}: {readout.value}</Text>}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}
```

Notes:
- The vertical line + dot are driven purely by shared values via `animatedProps`/`useAnimatedStyle` → **no React re-render while scrubbing** (60fps on the UI thread). Source: https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/handling-gestures/
- The readout *text* is the one thing that needs JS (strings can't be interpolated by reanimated), so update it via `runOnJS(setReadout)` — but gate it on `lo !== activeIdx.value` so it fires once per day crossed, not every frame. Same gate drives the haptic tick.
- `GestureDetector`/`Gesture.Pan()` require the app to be wrapped in `GestureHandlerRootView`. Source: https://docs.swmansion.com/react-native-gesture-handler/docs/gestures/pan-gesture/

---

## 4. Morphing between range toggles (7d / 30d / 90d)

The three ranges have **different point counts and different x-domains**, so a true `d`-morph is neither meaningful nor cheap (see §1.3 caveat: animating `d` is the expensive/janky path, and mismatched command counts snap on Web). Source: https://docs.swmansion.com/react-native-reanimated/docs/guides/animating-svg

What actually animates smoothly:

1. **Cross-fade + re-draw (recommended).** On toggle, compute the new static `d` (line + area) in a `useMemo` keyed on `[range, data]`, then cross-fade: fade the outgoing paths' `opacity → 0` while re-running the §1.3 draw-on for the incoming series (`strokeDashoffset` sweep + area `fillOpacity` rise). Cheap scalar props only; no `d` interpolation.

   ```tsx
   const d = useMemo(() => buildPaths(data, range, W, H), [data, range]);
   useEffect(() => {                    // on range change
     progress.value = 0;
     progress.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) });
   }, [range]);
   ```

2. **Fixed-slot morph (if you want continuity).** If you keep the visual x-range fixed and only change density, you can resample all ranges to the *same* number of slots (e.g. 30 samples) so the command count matches, making an `opacity` cross-fade between two overlaid `<Path>`s look like a morph without touching `d` mid-flight. Still avoid animating `d`; overlay-and-fade two static paths.

3. **Container layout via `LayoutAnimation`.** For the surrounding chrome (legend, stat tiles resizing, axis labels appearing/disappearing) use `LayoutAnimation.configureNext(...)` or reanimated layout animations (`entering`/`exiting`, `Layout`) rather than manual measuring. Reanimated layout animations: https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/entering-exiting-animations/

The x/y label ticks along the axis can `entering={FadeIn}` / `exiting={FadeOut}` as their count changes, which hides the fact that the underlying path was swapped, not tweened.

---

## 5. Accessibility + performance

### 5.1 Accessibility for SVG charts

react-native-svg **does** support `accessible` and `accessibilityLabel` per element — its `extractProps.ts` explicitly extracts those two and passes them to the native node. It does **not** extract `accessibilityRole`, `accessibilityHint`, or `accessibilityState` on individual SVG child nodes. Source: https://github.com/software-mansion/react-native-svg/blob/main/src/lib/extract/extractProps.ts

Because TalkBack/VoiceOver traversal of hundreds of individual SVG nodes is unreliable and exhausting, the correct pattern is a **summary label on a wrapping element**, with inner nodes hidden from the a11y tree:

```tsx
<View
  accessible
  accessibilityRole="image"
  accessibilityLabel={`Steps, last 7 days. Average 8,240 per day, up 12% from prior week. Highest Saturday, 11,300.`}
>
  <Svg importantForAccessibility="no-hide-descendants" /* Android: hide children */ >
    {/* decorative nodes; individually accessible={false} */}
  </Svg>
</View>
```

- Put the *insight* (trend, average, min/max, delta) in the label — screen-reader users need the takeaway, not raw coordinates. `accessibilityLabel`/`accessibilityRole`/`importantForAccessibility` semantics: https://reactnative.dev/docs/accessibility
- For the scrubber, mirror the visual readout to assistive tech by updating the wrapper's `accessibilityValue` (or an `accessibilityLiveRegion="polite"` label) on index change — reuse the same `runOnJS(setReadout)` from §3.
- Ensure the accent-over-track color ramp still meets contrast; do not encode meaning by hue alone (also fine here since it's single-hue intensity). RN a11y guidance: https://reactnative.dev/docs/accessibility

### 5.2 Performance

- **Keep `d` static; animate scalars.** Per-frame `d` recomputation is the main jank source (§1.3). Drive draw-on/morph with `strokeDashoffset`, `opacity`, `fillOpacity`, `transform`. Source: https://docs.swmansion.com/react-native-reanimated/docs/guides/animating-svg
- **No React re-render during interaction.** Bind everything animated to shared values via `useAnimatedProps`/`useAnimatedStyle`; reserve `runOnJS`/setState for text and gate it on real changes. Source: https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/handling-gestures/
- **`useMemo` the geometry.** Compute `line`/`area`/`xs`/`ys`/heatmap-cells once per `[data, range, size]`; recomputing paths on every render defeats the point.
- **`useDerivedValue` for computed shared values.** When one animated value depends on another (e.g., readout y from cursor index), derive it with `useDerivedValue` so it stays on the UI thread instead of round-tripping through JS. https://docs.swmansion.com/react-native-reanimated/docs/core/useDerivedValue/
- **Minimize node count.** One `<Svg>` per chart, memoized child arrays with stable `key`s, `~few hundred` `<Rect>` max for the heatmap without per-cell animation (§2.3).
- **Keep worklets small.** The gesture worklet does only clamp + binary search + assignments; heavy formatting happens in JS on index change. Source: https://docs.swmansion.com/react-native-gesture-handler/docs/gestures/pan-gesture/

---

## 6. Design reference — expressive yet calm (non-gamified)

Concrete pattern takeaways for a Progress page that feels expressive but *calm*, not gamified (synthesized from current fitness/habit/finance design writing):

1. **One soft-gradient hero chart, not a wall of charts.** Lead with a single large gradient area/trend chart; calm apps (e.g. Headspace) build the mood with soft gradients and pastel/low-saturation palettes rather than dense dashboards. Keep the rest as small supporting mini-charts. Source: https://procreator.design/blog/finance-app-design-best-practices/ and https://www.eleken.co/blog-posts/modern-fintech-design-guide
2. **Show progress against a goal, quietly.** Progress-visibility (distance to a savings/streak/target) via a trend line with a reference line or a thin goal bar communicates "how close am I" far better than a table — but frame it as information, not a reward to chase. Source: https://procreator.design/blog/finance-app-design-best-practices/
3. **Color = information, not decoration.** In habit/consistency views, assign the single-hue intensity ramp so the heatmap works as a *diagnostic* ("where are the gaps") at a glance, not as a scoreboard. Source: https://habi.app/insights/habit-tracker-ideas/
4. **Reduce friction over adding motivation mechanics.** Users abandon trackers because of friction, not lost motivation — so favor calm, immediately-legible summaries and avoid punitive streak-shaming or badge overload. Source: https://habi.app/insights/habit-tracker-ideas/ and https://www.mindfulsuite.com/reviews/best-habit-tracker-apps
5. **Rhythm mini-charts for cadence.** Small weekly/monthly comparison sparklines (time trained, minutes, tasks) give "am I keeping rhythm" feedback without a full chart each; pair the hero with a row of these. Source: https://www.zfort.com/blog/How-to-Design-a-Fitness-App-UX-UI-Best-Practices-for-Engagement-and-Retention
6. **Meaningful feedback over gamification-for-its-own-sake.** The 2026 consensus is to reinforce behavior through *clear progress and meaningful feedback*, not points/badges by default — animated goal bars and gentle milestone acknowledgements, kept subtle. Source: https://dashdevs.com/blog/gamification-in-financial-apps-unlocking-new-opportunities-for-growth-and-engagement/

---

## Source index (primary)

- d3-shape monotone curve source (interpolation math): https://github.com/d3/d3-shape/blob/main/src/curve/monotone.js
- d3-shape catmullRom source: https://github.com/d3/d3-shape/blob/main/src/curve/catmullRom.js
- d3 curve API (`curveMonotoneX`): https://d3js.org/d3-shape/curve
- Reanimated — Animating SVG guide: https://docs.swmansion.com/react-native-reanimated/docs/guides/animating-svg
- Reanimated — useAnimatedProps: https://docs.swmansion.com/react-native-reanimated/docs/core/useAnimatedProps/
- Reanimated — Handling gestures: https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/handling-gestures/
- Reanimated — runOnJS: https://docs.swmansion.com/react-native-reanimated/docs/threading/runOnJS/
- Reanimated — useDerivedValue: https://docs.swmansion.com/react-native-reanimated/docs/core/useDerivedValue/
- Reanimated — layout animations: https://docs.swmansion.com/react-native-reanimated/docs/layout-animations/entering-exiting-animations/
- Gesture Handler — Pan gesture: https://docs.swmansion.com/react-native-gesture-handler/docs/gestures/pan-gesture/
- react-native-svg — USAGE.md (LinearGradient, Rect, gradients): https://github.com/software-mansion/react-native-svg/blob/main/USAGE.md
- react-native-svg — extractProps.ts (a11y prop support): https://github.com/software-mansion/react-native-svg/blob/main/src/lib/extract/extractProps.ts
- MDN — SVG `d` attribute: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/d
- MDN — stroke-dashoffset: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dashoffset
- MDN — gradientUnits: https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/gradientUnits
- Expo — Haptics SDK: https://docs.expo.dev/versions/latest/sdk/haptics/
- React Native — Accessibility: https://reactnative.dev/docs/accessibility
- d3-scale — quantize (bucketed color ramp): https://d3js.org/d3-scale/quantize
