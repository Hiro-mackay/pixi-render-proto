import { describe, expect, test } from "vitest";
import type { Rect } from "../../types";
import { computeOptimalSides, facingSide, getFixedSideAnchor, getNearestSide } from "../anchor";

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

describe("facingSide", () => {
  const RECT: Rect = { x: 100, y: 100, width: 100, height: 100 };
  // center is (150, 150)

  test("returns right when point is to the right (horizontal dominant)", () => {
    expect(facingSide(RECT, { x: 300, y: 160 })).toBe("right");
  });

  test("returns left when point is to the left (horizontal dominant)", () => {
    expect(facingSide(RECT, { x: 0, y: 160 })).toBe("left");
  });

  test("returns bottom when point is below (vertical dominant)", () => {
    expect(facingSide(RECT, { x: 160, y: 400 })).toBe("bottom");
  });

  test("returns top when point is above (vertical dominant)", () => {
    expect(facingSide(RECT, { x: 160, y: 0 })).toBe("top");
  });

  test("prefers horizontal on 45-degree tie (|dx| >= |dy|)", () => {
    // dx = 100, dy = 100 → horizontal wins by >=
    expect(facingSide(RECT, { x: 250, y: 250 })).toBe("right");
  });

  test("returns right when point equals center (dx=dy=0)", () => {
    // Degenerate: both |dx| and |dy| are 0 → horizontal branch → dx >= 0 → right
    expect(facingSide(RECT, { x: 150, y: 150 })).toBe("right");
  });

  test("picks the side corresponding to direction, not nearest edge", () => {
    // Point is just barely right of center but far below. dy dominates → bottom.
    expect(facingSide(RECT, { x: 155, y: 500 })).toBe("bottom");
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
      const result = computeOptimalSides(rect(0, 0, 500, 500), rect(300, 300, 50, 50));
      expect(result.srcSide).toBe("right");
      expect(result.tgtSide).toBe("left");
    });

    test("same center but different sizes", () => {
      const result = computeOptimalSides(rect(0, 0, 100, 100), rect(25, 25, 50, 50));
      expect(result).toEqual({ srcSide: "right", tgtSide: "left" });
    });
  });
});
