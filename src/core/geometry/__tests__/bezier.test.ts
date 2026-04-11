import { describe, test, expect } from "vitest";
import { computeBezierControlPoints, cubicBezierPoint } from "../bezier";

describe("bezier control points", () => {
  test("should produce a smooth forward curve between two horizontal nodes", () => {
    const cp = computeBezierControlPoints(0, 0, "right", 200, 0, "left");

    // Control points should extend outward from their respective sides
    expect(cp.cp1x).toBeGreaterThan(0);
    expect(cp.cp2x).toBeLessThan(200);
    // Horizontal edge: no vertical deviation in control points
    expect(cp.cp1y).toBe(0);
    expect(cp.cp2y).toBe(0);
  });

  test("should route reverse-direction edges with wider arcs to avoid overlap", () => {
    const forward = computeBezierControlPoints(0, 0, "right", 200, 0, "left");
    const reverse = computeBezierControlPoints(200, 0, "right", 0, 0, "left");

    // Reverse edges need larger offsets to curve around nodes
    expect(Math.abs(reverse.cp1x - 200)).toBeGreaterThan(forward.cp1x);
  });

  test("should keep control point offsets within reasonable bounds regardless of distance", () => {
    // Very short edge
    const short = computeBezierControlPoints(0, 0, "right", 10, 0, "left");
    expect(short.cp1x).toBeGreaterThanOrEqual(30);

    // Very long edge
    const long = computeBezierControlPoints(0, 0, "right", 5000, 0, "left");
    expect(long.cp1x).toBeLessThanOrEqual(200);
  });

  test("should handle vertical connections (top/bottom)", () => {
    const cp = computeBezierControlPoints(100, 0, "bottom", 100, 300, "top");

    // Control points extend vertically, not horizontally
    expect(cp.cp1x).toBe(100);
    expect(cp.cp1y).toBeGreaterThan(0);
    expect(cp.cp2x).toBe(100);
    expect(cp.cp2y).toBeLessThan(300);
  });

  test("should fall back to simpler curve when target side is unknown (drag preview)", () => {
    const cp = computeBezierControlPoints(0, 0, "right", 200, 100, null);

    expect(cp.cp1x).toBeGreaterThan(0);
    expect(cp.cp2x).toBeCloseTo(200 - 200 * 0.25);
    expect(cp.cp2y).toBeCloseTo(100 - 100 * 0.25);
  });
});

describe("bezier point evaluation", () => {
  const start = { x: 0, y: 0 };
  const end = { x: 200, y: 100 };

  test("should return exact endpoints at t=0 and t=1", () => {
    const cp1 = { x: 50, y: 0 };
    const cp2 = { x: 150, y: 100 };

    const atStart = cubicBezierPoint(0, start, cp1, cp2, end);
    expect(atStart.x).toBeCloseTo(0);
    expect(atStart.y).toBeCloseTo(0);

    const atEnd = cubicBezierPoint(1, start, cp1, cp2, end);
    expect(atEnd.x).toBeCloseTo(200);
    expect(atEnd.y).toBeCloseTo(100);
  });

  test("should compute midpoint for edge label positioning", () => {
    // Straight-line case: label should be at geometric center
    const mid = cubicBezierPoint(0.5, start, start, end, end);
    expect(mid.x).toBeCloseTo(100);
    expect(mid.y).toBeCloseTo(50);
  });
});
