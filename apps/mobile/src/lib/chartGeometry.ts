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

const sgn = (x: number): number => (x < 0 ? -1 : 1);

/** Fritsch–Carlson / Steffen monotone tangents. Never overshoots. */
function monotoneTangents(pts: Pt[]): number[] {
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

/** Round to 2dp to keep `d` strings compact without visible precision loss. */
function r(v: number): number {
  return Math.round(v * 100) / 100;
}
