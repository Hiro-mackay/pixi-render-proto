import { describe, test, expect } from "vitest";
import { computeOptimalSides, getFixedSideAnchor, getNearestSide } from "../anchor";
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

describe("computeOptimalSides", () => {
  const rect = (x: number, y: number, w = 100, h = 60): Rect => ({ x, y, width: w, height: h });

  describe("cardinal directions", () => {
    test("target to the right → src:right, tgt:left", () => {
      const result = computeOptimalSides(rect(0, 0), rect(300, 0));
      expect(result).toEqual({ srcSide: "right", tgtSide: "left" });
    });

    test("target to the left → src:left, tgt:right", () => {
      const result = computeOptimalSides(rect(300, 0), rect(0, 0));
      expect(result).toEqual({ srcSide: "left", tgtSide: "right" });
    });

    test("target below → src:bottom, tgt:top", () => {
      const result = computeOptimalSides(rect(0, 0), rect(0, 300));
      expect(result).toEqual({ srcSide: "bottom", tgtSide: "top" });
    });

    test("target above → src:top, tgt:bottom", () => {
      const result = computeOptimalSides(rect(0, 300), rect(0, 0));
      expect(result).toEqual({ srcSide: "top", tgtSide: "bottom" });
    });
  });

  describe("diagonal placement", () => {
    test("horizontal dominant (dx > dy) → horizontal sides", () => {
      const result = computeOptimalSides(rect(0, 0), rect(400, 100));
      expect(result).toEqual({ srcSide: "right", tgtSide: "left" });
    });

    test("vertical dominant (dy > dx) → vertical sides", () => {
      const result = computeOptimalSides(rect(0, 0), rect(100, 400));
      expect(result).toEqual({ srcSide: "bottom", tgtSide: "top" });
    });

    test("near-45-degree prefers horizontal (dead zone)", () => {
      const result = computeOptimalSides(rect(0, 0), rect(200, 200));
      expect(result).toEqual({ srcSide: "right", tgtSide: "left" });
    });
  });

  describe("overlapping rects", () => {
    test("horizontal overlap, target below → vertical sides", () => {
      const result = computeOptimalSides(rect(0, 0, 100, 60), rect(50, 200, 100, 60));
      expect(result).toEqual({ srcSide: "bottom", tgtSide: "top" });
    });

    test("vertical overlap, target to the right → horizontal sides", () => {
      const result = computeOptimalSides(rect(0, 0, 100, 200), rect(300, 50, 100, 200));
      expect(result).toEqual({ srcSide: "right", tgtSide: "left" });
    });

    test("fully overlapping rects → fallback right/left", () => {
      const result = computeOptimalSides(rect(100, 100), rect(100, 100));
      expect(result).toEqual({ srcSide: "right", tgtSide: "left" });
    });
  });

  describe("edge cases", () => {
    test("adjacent nodes (very close, < 10px gap)", () => {
      const result = computeOptimalSides(rect(0, 0, 100, 60), rect(105, 0, 100, 60));
      expect(result).toEqual({ srcSide: "right", tgtSide: "left" });
    });

    test("one node contains the other (target center right of source center)", () => {
      // Large center (250,250), small center (325,325) → target is right-and-below
      const result = computeOptimalSides(
        rect(0, 0, 500, 500),
        rect(300, 300, 50, 50),
      );
      expect(result.srcSide).toBe("right");
      expect(result.tgtSide).toBe("left");
    });

    test("same center but different sizes", () => {
      const result = computeOptimalSides(
        rect(0, 0, 100, 100),
        rect(25, 25, 50, 50),
      );
      expect(result).toEqual({ srcSide: "right", tgtSide: "left" });
    });
  });
});
