/**
 * chartGeometry tests
 *
 * The load-bearing property is anti-overshoot: monotone-cubic control points
 * must stay within each segment's endpoint y-range, so count data never draws
 * a fake dip/spike between points. We verify it by parsing the emitted Bézier
 * commands rather than trusting the curve by eye.
 */

import { describe, expect, it } from "vitest";
import {
  anchoredMorph,
  areaPath,
  lerpPts,
  monotoneLinePath,
  nearestIndex,
  pathLengthUpperBound,
  type Pt,
} from "../lib/chartGeometry";

function pts(ys: number[]): Pt[] {
  return ys.map((y, x) => ({ x, y }));
}

/** Extract [p0, c1, c2, p1] y-values for each cubic segment of a `d` string. */
function segments(d: string): Array<{ p0y: number; c1y: number; c2y: number; p1y: number }> {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  // M x0 y0  then repeating C c1x c1y c2x c2y x1 y1
  const out: Array<{ p0y: number; c1y: number; c2y: number; p1y: number }> = [];
  let p0y = nums[1];
  let i = 2;
  while (i + 5 < nums.length) {
    const c1y = nums[i + 1];
    const c2y = nums[i + 3];
    const p1y = nums[i + 5];
    out.push({ p0y, c1y, c2y, p1y });
    p0y = p1y;
    i += 6;
  }
  return out;
}

describe("monotoneLinePath", () => {
  it("handles degenerate inputs", () => {
    expect(monotoneLinePath([])).toBe("");
    expect(monotoneLinePath([{ x: 1, y: 2 }])).toBe("M1,2");
    expect(monotoneLinePath([{ x: 0, y: 0 }, { x: 2, y: 4 }])).toBe("M0,0L2,4");
  });

  it("emits cubic segments for 3+ points", () => {
    const d = monotoneLinePath(pts([0, 3, 1, 5]));
    expect(d.startsWith("M0,0")).toBe(true);
    expect((d.match(/C/g) ?? []).length).toBe(3);
  });

  it("never overshoots: control points stay within each segment's y-range", () => {
    // Includes local minima/maxima (0→8→2) to exercise the extremum branch.
    for (const series of [[5, 0, 0, 8, 2], [0, 0, 5], [10, 8, 3, 0], [1, 9, 1, 9, 1]]) {
      const d = monotoneLinePath(pts(series));
      for (const seg of segments(d)) {
        const lo = Math.min(seg.p0y, seg.p1y) - 1e-6;
        const hi = Math.max(seg.p0y, seg.p1y) + 1e-6;
        expect(seg.c1y).toBeGreaterThanOrEqual(lo);
        expect(seg.c1y).toBeLessThanOrEqual(hi);
        expect(seg.c2y).toBeGreaterThanOrEqual(lo);
        expect(seg.c2y).toBeLessThanOrEqual(hi);
      }
    }
  });
});

describe("areaPath", () => {
  it("closes the line down to the baseline", () => {
    const line = monotoneLinePath(pts([1, 2, 3]));
    const area = areaPath(line, 0, 2, 10);
    expect(area.startsWith(line)).toBe(true);
    expect(area.endsWith("Z")).toBe(true);
    expect(area).toContain("L2,10");
    expect(area).toContain("L0,10");
  });

  it("returns empty for an empty line", () => {
    expect(areaPath("", 0, 1, 10)).toBe("");
  });
});

describe("nearestIndex", () => {
  // Powers the hero scrubber: finger x → nearest day. Ties resolve to the
  // lower index (deterministic), and out-of-range x clamps to the ends so a
  // finger dragged past the chart edge still reads the first/last day.
  const xs = [0, 10, 20, 30, 40]; // 5 uniformly-spaced days

  it("returns -1 for an empty domain", () => {
    expect(nearestIndex([], 5)).toBe(-1);
  });

  it("returns 0 for a single-point domain", () => {
    expect(nearestIndex([12], -99)).toBe(0);
    expect(nearestIndex([12], 99)).toBe(0);
  });

  it("clamps below the first and above the last point", () => {
    expect(nearestIndex(xs, -50)).toBe(0);
    expect(nearestIndex(xs, 9999)).toBe(4);
  });

  it("snaps to exact and near hits", () => {
    expect(nearestIndex(xs, 20)).toBe(2);
    expect(nearestIndex(xs, 21)).toBe(2);
    expect(nearestIndex(xs, 27)).toBe(3);
  });

  it("resolves an exact midpoint tie to the lower index", () => {
    // 15 is equidistant from x=10 (idx 1) and x=20 (idx 2) → picks 1.
    expect(nearestIndex(xs, 15)).toBe(1);
  });

  it("handles non-uniform spacing (missing days / gaps)", () => {
    const gappy = [0, 5, 40, 42]; // a wide gap between idx 1 and idx 2
    expect(nearestIndex(gappy, 6)).toBe(1);
    expect(nearestIndex(gappy, 30)).toBe(2);
    expect(nearestIndex(gappy, 41.5)).toBe(3);
  });
});

describe("pathLengthUpperBound", () => {
  it("is zero for < 2 points and the segment length for 2 points", () => {
    expect(pathLengthUpperBound([])).toBe(0);
    expect(pathLengthUpperBound([{ x: 0, y: 0 }])).toBe(0);
    expect(pathLengthUpperBound([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5);
  });

  it("bounds the straight-line distance from below (control polygon ≥ chord)", () => {
    const p = pts([0, 5, 0]);
    const chord = Math.hypot(1, 5) + Math.hypot(1, 5);
    expect(pathLengthUpperBound(p)).toBeGreaterThanOrEqual(chord - 1e-9);
  });
});

describe("anchoredMorph", () => {
  const BOUNDS = { width: 300, height: 100, padTop: 10, padBottom: 6 };
  const days = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ count: (i % 5) + 1 }));

  it("pins today to the right edge in both windows", () => {
    // The whole animation rests on this: both ranges end today, so today must
    // not move. If it drifts, the morph stops reading as a zoom-out.
    const m = anchoredMorph(days(30), days(90), BOUNDS);
    expect(m.fromXs[m.fromXs.length - 1]).toBeCloseTo(300);
    expect(m.toXs[m.toXs.length - 1]).toBeCloseTo(300);
  });

  it("describes both windows over the same points, so the spline never re-steps", () => {
    const m = anchoredMorph(days(30), days(90), BOUNDS);
    expect(m.fromXs).toHaveLength(90);
    expect(m.toXs).toHaveLength(90);
    expect(m.fromYs).toHaveLength(90);
    expect(m.toYs).toHaveLength(90);
  });

  it("parks days outside the narrow window off-screen to the left", () => {
    const m = anchoredMorph(days(30), days(90), BOUNDS);
    // In the 30d state only the last 30 days are on screen; the earlier 60 sit
    // at negative x, which is what lets them slide in.
    expect(m.fromXs[59]).toBeLessThan(0);
    expect(m.fromXs[60]).toBeCloseTo(0);
    expect(m.fromXs.filter((x) => x >= 0)).toHaveLength(30);
  });

  it("keeps a uniform step in each state", () => {
    const m = anchoredMorph(days(30), days(90), BOUNDS);
    const stepFrom = m.fromXs[1] - m.fromXs[0];
    const stepTo = m.toXs[1] - m.toXs[0];
    expect(stepFrom).toBeCloseTo(300 / 29);
    expect(stepTo).toBeCloseTo(300 / 89);
    for (let i = 1; i < 90; i++) {
      expect(m.fromXs[i] - m.fromXs[i - 1]).toBeCloseTo(stepFrom);
      expect(m.toXs[i] - m.toXs[i - 1]).toBeCloseTo(stepTo);
    }
  });

  it("gives every point a real height in both states, never a baseline stub", () => {
    // Incoming days must slide in already-shaped; starting them at the baseline
    // makes them inflate, which is what read as rough.
    const m = anchoredMorph(days(30), days(90), BOUNDS);
    const baseline = BOUNDS.height - BOUNDS.padBottom;
    expect(m.fromYs.every((y) => y < baseline)).toBe(true);
  });

  it("narrowing is the same interpolation, reversed", () => {
    const wide = anchoredMorph(days(30), days(90), BOUNDS);
    const narrow = anchoredMorph(days(90), days(30), BOUNDS);
    expect(narrow.fromXs).toEqual(wide.toXs);
    expect(narrow.toXs).toEqual(wide.fromXs);
  });

  it("lerpPts walks from one state to the other", () => {
    const m = anchoredMorph(days(30), days(90), BOUNDS);
    const at = (t: number) => lerpPts(m.fromXs, m.fromYs, m.toXs, m.toYs, t);
    expect(at(0)[0].x).toBeCloseTo(m.fromXs[0]);
    expect(at(1)[0].x).toBeCloseTo(m.toXs[0]);
    expect(at(0.5)[0].x).toBeCloseTo((m.fromXs[0] + m.toXs[0]) / 2);
    // Today stays put for the entire animation.
    expect(at(0.37)[89].x).toBeCloseTo(300);
  });
});
