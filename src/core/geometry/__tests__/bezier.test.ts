import { describe, test, expect } from "vitest";
import {
  sideDirection,
  computeBezierControlPoints,
  cubicBezierPoint,
} from "../bezier";

describe("sideDirection", () => {
  test("should return unit vector pointing right for right side", () => {
    expect(sideDirection("right")).toEqual({ x: 1, y: 0 });
  });

  test("should return unit vector pointing left for left side", () => {
    expect(sideDirection("left")).toEqual({ x: -1, y: 0 });
  });

  test("should return unit vector pointing down for bottom side", () => {
    expect(sideDirection("bottom")).toEqual({ x: 0, y: 1 });
  });

  test("should return unit vector pointing up for top side", () => {
    expect(sideDirection("top")).toEqual({ x: 0, y: -1 });
  });
});

describe("computeBezierControlPoints", () => {
  test("should produce control points offset along start direction when forward projection", () => {
    const result = computeBezierControlPoints(0, 0, "right", 200, 0, "left");

    // cp1 should be to the right of start
    expect(result.cp1x).toBeGreaterThan(0);
    expect(result.cp1y).toBe(0);

    // cp2 should be to the left of end (endSide = left, direction = -1)
    expect(result.cp2x).toBeLessThan(200);
    expect(result.cp2y).toBe(0);
  });

  test("should handle reverse-direction edges with larger offsets", () => {
    // End is behind start direction (left of start when startSide = right)
    const result = computeBezierControlPoints(200, 0, "right", 0, 0, "left");

    // cp1 should still extend right from start
    expect(result.cp1x).toBeGreaterThan(200);
    // cp2 should extend left from end
    expect(result.cp2x).toBeLessThan(0);
  });

  test("should use quadratic fallback when endSide is null", () => {
    const result = computeBezierControlPoints(0, 0, "right", 200, 100, null);

    // cp1 should be on the right side of start
    expect(result.cp1x).toBeGreaterThan(0);
    expect(result.cp1y).toBe(0);

    // cp2 should be computed as end - delta*0.25
    const dx = 200;
    const dy = 100;
    expect(result.cp2x).toBeCloseTo(200 - dx * 0.25);
    expect(result.cp2y).toBeCloseTo(100 - dy * 0.25);
  });

  test("should clamp start offset between 30 and 200 for forward projection", () => {
    // Very short edge: offset should be clamped to minimum 30
    const short = computeBezierControlPoints(0, 0, "right", 10, 0, "left");
    expect(short.cp1x).toBeGreaterThanOrEqual(30);

    // Very long edge: offset should be clamped to maximum 200
    const long = computeBezierControlPoints(0, 0, "right", 2000, 0, "left");
    expect(long.cp1x).toBeLessThanOrEqual(200);
  });

  test("should produce vertical control points for top/bottom sides", () => {
    const result = computeBezierControlPoints(100, 0, "bottom", 100, 200, "top");

    // cp1 should be below start
    expect(result.cp1x).toBe(100);
    expect(result.cp1y).toBeGreaterThan(0);

    // cp2 should be above end
    expect(result.cp2x).toBe(100);
    expect(result.cp2y).toBeLessThan(200);
  });
});

describe("cubicBezierPoint", () => {
  const p0 = { x: 0, y: 0 };
  const p1 = { x: 100, y: 0 };
  const p2 = { x: 100, y: 100 };
  const p3 = { x: 200, y: 100 };

  test("should return start point at t=0", () => {
    const result = cubicBezierPoint(0, p0, p1, p2, p3);
    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(0);
  });

  test("should return end point at t=1", () => {
    const result = cubicBezierPoint(1, p0, p1, p2, p3);
    expect(result.x).toBeCloseTo(200);
    expect(result.y).toBeCloseTo(100);
  });

  test("should return midpoint at t=0.5", () => {
    const result = cubicBezierPoint(0.5, p0, p1, p2, p3);
    // Midpoint of cubic bezier: 0.125*p0 + 0.375*p1 + 0.375*p2 + 0.125*p3
    const expectedX = 0.125 * 0 + 0.375 * 100 + 0.375 * 100 + 0.125 * 200;
    const expectedY = 0.125 * 0 + 0.375 * 0 + 0.375 * 100 + 0.125 * 100;
    expect(result.x).toBeCloseTo(expectedX);
    expect(result.y).toBeCloseTo(expectedY);
  });

  test("should return straight line midpoint when all points are collinear", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 100 };
    const result = cubicBezierPoint(0.5, a, a, b, b);
    expect(result.x).toBeCloseTo(50);
    expect(result.y).toBeCloseTo(50);
  });
});
