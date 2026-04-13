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

  test("should produce a U-curve when both sides are the same (right-right)", () => {
    const cp = computeBezierControlPoints(0, 0, "right", 0, 200, "right");

    // Both control points should extend to the right
    expect(cp.cp1x).toBeGreaterThan(0);
    expect(cp.cp2x).toBeGreaterThan(0);
    // Control points must be displaced perpendicular to form a U-curve, not collapse
    expect(cp.cp1y).not.toBe(0);
    expect(cp.cp2y).not.toBe(200);
    // Both should be displaced in the same perpendicular direction
    const cp1Perp = cp.cp1y;
    const cp2Perp = cp.cp2y - 200;
    expect(Math.sign(cp1Perp)).toBe(Math.sign(cp2Perp));
  });

  test("should produce a U-curve when both sides are the same (top-top)", () => {
    const cp = computeBezierControlPoints(0, 0, "top", 200, 0, "top");

    // Both control points should extend upward
    expect(cp.cp1y).toBeLessThan(0);
    expect(cp.cp2y).toBeLessThan(0);
    // Control points should be displaced horizontally
    expect(cp.cp1x).not.toBe(0);
    expect(cp.cp2x).not.toBe(200);
  });

  test("should handle zero-length edge (same start and end)", () => {
    const cp = computeBezierControlPoints(100, 100, "right", 100, 100, "left");

    // Should still produce valid offsets (minimum offsets apply)
    expect(cp.cp1x).toBeGreaterThan(100);
    expect(cp.cp2x).toBeLessThan(100);
  });

  test("should handle extremely close coordinates (1px apart)", () => {
    const cp = computeBezierControlPoints(0, 0, "right", 1, 0, "left");

    // Minimum forward offset should apply
    expect(cp.cp1x).toBeGreaterThanOrEqual(30);
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

  test("should clamp t values outside 0-1 range", () => {
    const cp1 = { x: 50, y: 0 };
    const cp2 = { x: 150, y: 100 };

    const belowZero = cubicBezierPoint(-0.5, start, cp1, cp2, end);
    const atZero = cubicBezierPoint(0, start, cp1, cp2, end);
    expect(belowZero.x).toBeCloseTo(atZero.x);
    expect(belowZero.y).toBeCloseTo(atZero.y);

    const aboveOne = cubicBezierPoint(2.0, start, cp1, cp2, end);
    const atOne = cubicBezierPoint(1, start, cp1, cp2, end);
    expect(aboveOne.x).toBeCloseTo(atOne.x);
    expect(aboveOne.y).toBeCloseTo(atOne.y);
  });
});
