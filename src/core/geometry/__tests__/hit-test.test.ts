import { describe, test, expect } from "vitest";
import { pointInRect, findElementAtPoint, type HitTestable } from "../hit-test";

describe("point-in-rect collision", () => {
  const rect = { x: 10, y: 20, width: 100, height: 50 };

  test("should detect clicks inside an element", () => {
    expect(pointInRect({ x: 50, y: 40 }, rect)).toBe(true);
  });

  test("should detect clicks on element border", () => {
    expect(pointInRect({ x: 10, y: 20 }, rect)).toBe(true);
    expect(pointInRect({ x: 110, y: 70 }, rect)).toBe(true);
  });

  test("should reject clicks outside an element", () => {
    expect(pointInRect({ x: 5, y: 40 }, rect)).toBe(false);
    expect(pointInRect({ x: 50, y: 15 }, rect)).toBe(false);
  });
});

describe("finding the topmost element at a point", () => {
  const elements: HitTestable[] = [
    { visible: true, rect: { x: 0, y: 0, width: 100, height: 100 } },
    { visible: true, rect: { x: 50, y: 50, width: 100, height: 100 } },
    { visible: false, rect: { x: 80, y: 80, width: 100, height: 100 } },
  ];

  test("should return the topmost (last) visible element when overlapping", () => {
    const result = findElementAtPoint(elements, { x: 75, y: 75 });
    expect(result).toBe(elements[1]);
  });

  test("should skip hidden elements even if they overlap", () => {
    const result = findElementAtPoint(elements, { x: 90, y: 90 });
    expect(result).toBe(elements[1]);
  });

  test("should return null when clicking empty space", () => {
    expect(findElementAtPoint(elements, { x: 500, y: 500 })).toBeNull();
  });
});
