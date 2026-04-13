import { describe, test, expect } from "vitest";
import { getFixedSideAnchor } from "../anchor";
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
