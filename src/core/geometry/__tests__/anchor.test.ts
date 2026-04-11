import { describe, test, expect } from "vitest";
import { getNearestSide, getFixedSideAnchor } from "../anchor";
import type { Rect } from "../../types";

const RECT: Rect = { x: 100, y: 100, width: 200, height: 100 };

describe("getNearestSide", () => {
  test("should return top when point is above rect", () => {
    expect(getNearestSide(RECT, { x: 200, y: 50 })).toBe("top");
  });

  test("should return bottom when point is below rect", () => {
    expect(getNearestSide(RECT, { x: 200, y: 250 })).toBe("bottom");
  });

  test("should return left when point is to the left of rect", () => {
    expect(getNearestSide(RECT, { x: 50, y: 150 })).toBe("left");
  });

  test("should return right when point is to the right of rect", () => {
    expect(getNearestSide(RECT, { x: 350, y: 150 })).toBe("right");
  });

  test("should return nearest side when point is at a corner", () => {
    // Point near top-right corner, slightly closer to right
    const side = getNearestSide(RECT, { x: 310, y: 95 });
    expect(["top", "right"]).toContain(side);
  });

  test("should return a side when point is inside rect", () => {
    const side = getNearestSide(RECT, { x: 200, y: 110 });
    expect(side).toBe("top");
  });
});

describe("getFixedSideAnchor", () => {
  test("should return top center anchor", () => {
    const anchor = getFixedSideAnchor(RECT, "top");
    expect(anchor).toEqual({ x: 200, y: 100, side: "top" });
  });

  test("should return right center anchor", () => {
    const anchor = getFixedSideAnchor(RECT, "right");
    expect(anchor).toEqual({ x: 300, y: 150, side: "right" });
  });

  test("should return bottom center anchor", () => {
    const anchor = getFixedSideAnchor(RECT, "bottom");
    expect(anchor).toEqual({ x: 200, y: 200, side: "bottom" });
  });

  test("should return left center anchor", () => {
    const anchor = getFixedSideAnchor(RECT, "left");
    expect(anchor).toEqual({ x: 100, y: 150, side: "left" });
  });
});
