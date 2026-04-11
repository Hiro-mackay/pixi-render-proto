import { describe, test, expect } from "vitest";
import { pointInRect, findElementAtPoint, type HitTestable } from "../hit-test";
import type { Rect } from "../../types";

const RECT: Rect = { x: 10, y: 20, width: 100, height: 50 };

describe("pointInRect", () => {
  test("should return true when point is inside rect", () => {
    expect(pointInRect({ x: 50, y: 40 }, RECT)).toBe(true);
  });

  test("should return true when point is on rect edge", () => {
    expect(pointInRect({ x: 10, y: 20 }, RECT)).toBe(true);
    expect(pointInRect({ x: 110, y: 70 }, RECT)).toBe(true);
  });

  test("should return false when point is outside rect", () => {
    expect(pointInRect({ x: 5, y: 40 }, RECT)).toBe(false);
    expect(pointInRect({ x: 50, y: 15 }, RECT)).toBe(false);
    expect(pointInRect({ x: 115, y: 40 }, RECT)).toBe(false);
    expect(pointInRect({ x: 50, y: 75 }, RECT)).toBe(false);
  });
});

describe("findElementAtPoint", () => {
  const elements: HitTestable[] = [
    { visible: true, rect: { x: 0, y: 0, width: 100, height: 100 } },
    { visible: true, rect: { x: 50, y: 50, width: 100, height: 100 } },
    { visible: false, rect: { x: 80, y: 80, width: 100, height: 100 } },
  ];

  test("should return last (topmost) visible element at point", () => {
    // Point (75, 75) is in both element 0 and 1. Element 1 is on top (later index).
    const result = findElementAtPoint(elements, { x: 75, y: 75 });
    expect(result).toBe(elements[1]);
  });

  test("should skip invisible elements", () => {
    // Point (90, 90) is in elements 0, 1, and 2. Element 2 is invisible.
    const result = findElementAtPoint(elements, { x: 90, y: 90 });
    expect(result).toBe(elements[1]);
  });

  test("should return null when no element is at point", () => {
    const result = findElementAtPoint(elements, { x: 500, y: 500 });
    expect(result).toBeNull();
  });

  test("should return null for empty array", () => {
    const result = findElementAtPoint([], { x: 50, y: 50 });
    expect(result).toBeNull();
  });

  test("should return only visible element when point hits single element", () => {
    const result = findElementAtPoint(elements, { x: 25, y: 25 });
    expect(result).toBe(elements[0]);
  });
});
