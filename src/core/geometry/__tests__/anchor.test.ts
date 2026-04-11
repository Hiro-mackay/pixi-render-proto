import { describe, test, expect } from "vitest";
import { getNearestSide, getFixedSideAnchor } from "../anchor";
import type { Rect } from "../../types";

const NODE: Rect = { x: 100, y: 100, width: 200, height: 100 };

describe("nearest side detection for edge routing", () => {
  test("should snap to the side closest to the other node", () => {
    expect(getNearestSide(NODE, { x: 200, y: 50 })).toBe("top");
    expect(getNearestSide(NODE, { x: 350, y: 150 })).toBe("right");
    expect(getNearestSide(NODE, { x: 200, y: 250 })).toBe("bottom");
    expect(getNearestSide(NODE, { x: 50, y: 150 })).toBe("left");
  });

  test("should work for points inside the rect (overlapping nodes)", () => {
    // Point near top edge inside rect
    expect(getNearestSide(NODE, { x: 200, y: 110 })).toBe("top");
  });
});

describe("anchor point on node border", () => {
  test("should place anchor at the midpoint of each side", () => {
    expect(getFixedSideAnchor(NODE, "top")).toEqual({ x: 200, y: 100, side: "top" });
    expect(getFixedSideAnchor(NODE, "right")).toEqual({ x: 300, y: 150, side: "right" });
    expect(getFixedSideAnchor(NODE, "bottom")).toEqual({ x: 200, y: 200, side: "bottom" });
    expect(getFixedSideAnchor(NODE, "left")).toEqual({ x: 100, y: 150, side: "left" });
  });
});
