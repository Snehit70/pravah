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
  areaPath,
  monotoneLinePath,
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
