import { describe, expect, it } from "vitest";
import {
  clampViewerTranslation,
  zoomViewerAtPoint,
} from "../lib/taskImageViewerTransform";

describe("Task image viewer transform", () => {
  const viewport = { width: 400, height: 800 };

  it("keeps the touched image point stable while zooming and clamps to 5x", () => {
    expect(zoomViewerAtPoint(
      { scale: 1, translateX: 0, translateY: 0 },
      8,
      { x: 300, y: 600 },
      viewport,
    )).toEqual({ scale: 5, translateX: -400, translateY: -800 });
  });

  it("resets translation at 1x and bounds panning while zoomed", () => {
    expect(clampViewerTranslation(
      { scale: 1, translateX: 90, translateY: -120 },
      viewport,
    )).toEqual({ scale: 1, translateX: 0, translateY: 0 });
    expect(clampViewerTranslation(
      { scale: 2, translateX: 900, translateY: -900 },
      viewport,
    )).toEqual({ scale: 2, translateX: 200, translateY: -400 });
  });

  it("bounds letterboxed image axes to the contained image", () => {
    expect(clampViewerTranslation(
      { scale: 2, translateX: 900, translateY: -900 },
      { ...viewport, contentAspectRatio: 4 },
    )).toEqual({ scale: 2, translateX: 200, translateY: 0 });
  });
});
