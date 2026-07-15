/**
 * chartGeometry
 *
 * Pure, dependency-free helpers that turn a series of points into SVG path
 * strings for the Progress hero chart. Kept out of the component so the
 * (non-trivial) monotone-cubic math is unit-testable in isolation.
 *
 * Interpolation is **monotone cubic** (Fritsch–Carlson / Steffen tangents),
 * not Catmull-Rom: for count data it is guaranteed never to overshoot between
 * points, so a run like [0, 0, 5] cannot draw a fake negative dip before the
 * rise. This is the same tangent rule d3-shape's curveMonotoneX emits, ported
 * so we carry no d3 dependency (OTA-safe).
 *
 * See docs/research/progress-page-dataviz.md §1 for derivation + sources.
 */

export type Pt = { x: number; y: number };

/**
 * Everything here carries `'worklet'` so the reanimated Babel plugin compiles a
 * UI-thread copy. The hero's range morph rebuilds its `d` every frame from
 * interpolated points, which has to happen on the UI thread — a JS round-trip
 * per frame would drop the animation to render speed. A worklet may only call
 * other worklets, so the whole call graph (`sgn` → `monotoneTangents` →
 * `monotoneLinePath`, plus `r` and `areaPath`) is marked, not just the entry
 * point. The directive is inert when these are called from JS, so useMemo and
 * the unit tests keep working unchanged.
 */

const sgn = (x: number): number => {
  "worklet";
  return x < 0 ? -1 : 1;
};

/** Fritsch–Carlson / Steffen monotone tangents. Never overshoots. */
function monotoneTangents(pts: Pt[]): number[] {
  "worklet";
  const n = pts.length;
  const h: number[] = [];
  const s: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h[i] = pts[i + 1].x - pts[i].x;
    s[i] = h[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / h[i];
  }
  const m = new Array<number>(n);
  m[0] = s[0];
  m[n - 1] = s[n - 2];
  for (let i = 1; i < n - 1; i++) {
    const s0 = s[i - 1];
    const s1 = s[i];
    if (s0 * s1 <= 0) {
      // Local extremum → flat tangent. This is the anti-overshoot guarantee.
      m[i] = 0;
    } else {
      const p = (s0 * h[i] + s1 * h[i - 1]) / (h[i - 1] + h[i]);
      m[i] = (sgn(s0) + sgn(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p));
    }
  }
  return m;
}

/**
 * Monotone-cubic SVG path (`M … C …`) through points with x ascending.
 * Degenerate inputs fall back to a move / straight line so callers never get
 * an empty `d` for 1–2 points.
 */
export function monotoneLinePath(pts: Pt[]): string {
  "worklet";
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${r(pts[0].x)},${r(pts[0].y)}`;
  if (pts.length === 2) return `M${r(pts[0].x)},${r(pts[0].y)}L${r(pts[1].x)},${r(pts[1].y)}`;
  const m = monotoneTangents(pts);
  let d = `M${r(pts[0].x)},${r(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const dx = (p1.x - p0.x) / 3;
    d +=
      `C${r(p0.x + dx)},${r(p0.y + dx * m[i])} ` +
      `${r(p1.x - dx)},${r(p1.y - dx * m[i + 1])} ${r(p1.x)},${r(p1.y)}`;
  }
  return d;
}

/**
 * Close a line path into a filled area by dropping to the baseline under the
 * last point, running back along the baseline, and closing.
 */
export function areaPath(
  line: string,
  firstX: number,
  lastX: number,
  baselineY: number,
): string {
  "worklet";
  if (!line) return "";
  return `${line}L${r(lastX)},${r(baselineY)}L${r(firstX)},${r(baselineY)}Z`;
}

/**
 * Upper bound on the path's arc length via the Bézier control polygon
 * (|p0→c1| + |c1→c2| + |c2→p1| per segment ≥ true length). Used to seed
 * `strokeDasharray`/`strokeDashoffset` for the draw-on reveal without calling
 * the native `getTotalLength` (which isn't reliably available and isn't
 * worklet-safe). Over-estimating only makes the reveal finish imperceptibly
 * early — never leaves the line dashed.
 */
export function pathLengthUpperBound(pts: Pt[]): number {
  if (pts.length < 2) return 0;
  const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
  if (pts.length === 2) return dist(pts[0], pts[1]);
  const m = monotoneTangents(pts);
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const dx = (p1.x - p0.x) / 3;
    const c1 = { x: p0.x + dx, y: p0.y + dx * m[i] };
    const c2 = { x: p1.x - dx, y: p1.y - dx * m[i + 1] };
    L += dist(p0, c1) + dist(c1, c2) + dist(c2, p1);
  }
  return L;
}

/**
 * Index of the point whose x is nearest to `x`, with `x` clamped into the
 * domain first (a finger dragged past the chart edge reads the end day). Uses
 * binary search so it stays O(log n) and tolerates non-uniform spacing (gaps
 * from missing days), unlike a `round((x-x0)/step)` shortcut. Exact midpoint
 * ties resolve to the lower index.
 *
 * The `'worklet'` directive lets the reanimated Babel plugin compile a UI-thread
 * copy, so the scrub gesture can call it from a worklet without a JS round-trip;
 * it remains an ordinary function when called from JS (e.g. unit tests).
 */
export function nearestIndex(xs: number[], x: number): number {
  "worklet";
  const n = xs.length;
  if (n === 0) return -1;
  const clamped = Math.max(xs[0], Math.min(x, xs[n - 1]));
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < clamped) lo = mid + 1;
    else hi = mid;
  }
  // `lo` is the first x >= clamped; the true nearest is either it or its
  // left neighbour. `<=` biases the tie to the lower index.
  if (lo > 0 && Math.abs(xs[lo - 1] - clamped) <= Math.abs(xs[lo] - clamped)) {
    lo -= 1;
  }
  return lo;
}

/** Interpolate two point-sets of equal length. Runs per frame on the UI thread. */
export function lerpPts(
  fx: number[],
  fy: number[],
  tx: number[],
  ty: number[],
  t: number,
): Pt[] {
  "worklet";
  const pts: Pt[] = [];
  for (let i = 0; i < tx.length; i++) {
    pts.push({ x: fx[i] + (tx[i] - fx[i]) * t, y: fy[i] + (ty[i] - fy[i]) * t });
  }
  return pts;
}

export type MorphBounds = {
  width: number;
  height: number;
  padTop: number;
  padBottom: number;
};

/**
 * Describe the same days twice — once per range window — so switching range can
 * be a single interpolation instead of a crossfade.
 *
 * Both windows end today, so today is the anchor: pin it to the right edge and a
 * wider window is literally a zoom-out. Going 30d → 90d the shared 30 days
 * compress into the right third while the earlier 60 arrive from off-screen
 * left, which is what actually happened — the window widened, the days did not
 * move. A crossfade says none of that; it erases one line and draws another.
 *
 * Two rules keep it smooth rather than rough:
 *
 *  1. **The point count never changes.** Both states are laid out over the same
 *     union of days (the longer window contains the shorter — they share an end
 *     date), so the monotone spline's tangents evolve continuously instead of
 *     being recomputed on a shrinking point set, which pops. Days outside a
 *     window get negative x — off-screen by construction, so an Svg's own bounds
 *     clip them and no clip path is needed.
 *  2. **Every point keeps a real height in both states**, so incoming days slide
 *     in already-shaped instead of inflating up from the baseline.
 *
 * What is left is a uniform-step polyline whose step shrinks from width/(m-1) to
 * width/(n-1) with today pinned — a pure per-point lerp of x and y.
 */
export function anchoredMorph(
  prev: Array<{ count: number }>,
  next: Array<{ count: number }>,
  { width, height, padTop, padBottom }: MorphBounds,
) {
  const union = prev.length >= next.length ? prev : next;
  const n = union.length;
  const innerH = Math.max(1, height - padTop - padBottom);

  const state = (s: Array<{ count: number }>) => {
    const m = s.length;
    let max = 1;
    for (const p of s) max = Math.max(max, p.count);
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      const dayOffset = n - 1 - i;
      xs.push(m > 1 ? width - (dayOffset / (m - 1)) * width : width / 2);
      // Inside this window use its own (differently smoothed) value; outside it
      // fall back to the union's, which only ever renders off-screen.
      const v = dayOffset <= m - 1 ? s[m - 1 - dayOffset].count : union[i].count;
      ys.push(padTop + innerH - (v / max) * (innerH - 2));
    }
    return { xs, ys };
  };

  const a = state(prev);
  const b = state(next);
  return { fromXs: a.xs, fromYs: a.ys, toXs: b.xs, toYs: b.ys };
}

/** Round to 2dp to keep `d` strings compact without visible precision loss. */
function r(v: number): number {
  "worklet";
  return Math.round(v * 100) / 100;
}
