import { describe, test, expect } from "vitest";
import { getFixedSideAnchor, getNearestSide } from "../anchor";
import type { Rect } from "../../types";

const NODE: Rect = { x: 100, y: 100, width: 200, height: 100 };

describe("anchor point on node border", () => {
  test("should place anchor at the midpoint of each side", () => {
    expect(getFixedSideAnchor(NODE, "top")).toEqual({ x: 200, y: 100, side: "top" });
    expect(getFixedSideAnchor(NODE, "right")).toEqual({ x: 300, y: 150, side: "right" });
    expect(getFixedSideAnchor(NODE, "bottom")).toEqual({ x: 200, y: 200, side: "bottom" });
    expect(getFixedSideAnchor(NODE, "left")).toEqual({ x: 100, y: 150, side: "left" });
  });
});

describe("getNearestSide", () => {
  test("should return top when point is closest to top edge", () => {
    expect(getNearestSide(NODE, { x: 200, y: 90 })).toBe("top");
  });

  test("should return bottom when point is closest to bottom edge", () => {
    expect(getNearestSide(NODE, { x: 200, y: 210 })).toBe("bottom");
  });

  test("should return left when point is closest to left edge", () => {
    expect(getNearestSide(NODE, { x: 90, y: 150 })).toBe("left");
  });

  test("should return right when point is closest to right edge", () => {
    expect(getNearestSide(NODE, { x: 310, y: 150 })).toBe("right");
  });

  test("should return correct side when point is inside the rect", () => {
    // Point near top-left corner but closer to top
    expect(getNearestSide(NODE, { x: 110, y: 105 })).toBe("top");
    // Point near bottom-right corner but closer to right
    expect(getNearestSide(NODE, { x: 298, y: 160 })).toBe("right");
  });

  test("should use deterministic tiebreak when equidistant to two sides", () => {
    // Top-right corner: equidistant to top (0) and right (0) → right wins
    expect(getNearestSide(NODE, { x: 300, y: 100 })).toBe("right");
    // Top-left corner: equidistant to top (0) and left (0) → left wins (before top in order)
    expect(getNearestSide(NODE, { x: 100, y: 100 })).toBe("left");
    // Center: equidistant to all four sides for a square
    const SQUARE: Rect = { x: 0, y: 0, width: 100, height: 100 };
    const result = getNearestSide(SQUARE, { x: 50, y: 50 });
    expect(["right", "bottom", "left", "top"]).toContain(result);
  });
});
