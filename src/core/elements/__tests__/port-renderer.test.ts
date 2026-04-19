import { describe, expect, test } from "vitest";
import { getPortPosition } from "../port-renderer";

const ANCHOR_SCREEN_PX = 16;

describe("getPortPosition", () => {
  const width = 100;
  const height = 50;

  test("should return top center with negative y offset", () => {
    const pos = getPortPosition("top", width, height, 1);
    expect(pos).toEqual({ x: 50, y: -ANCHOR_SCREEN_PX });
  });

  test("should return right center with positive x offset", () => {
    const pos = getPortPosition("right", width, height, 1);
    expect(pos).toEqual({ x: width + ANCHOR_SCREEN_PX, y: 25 });
  });

  test("should return bottom center with positive y offset", () => {
    const pos = getPortPosition("bottom", width, height, 1);
    expect(pos).toEqual({ x: 50, y: height + ANCHOR_SCREEN_PX });
  });

  test("should return left center with negative x offset", () => {
    const pos = getPortPosition("left", width, height, 1);
    expect(pos).toEqual({ x: -ANCHOR_SCREEN_PX, y: 25 });
  });

  test("should scale offset inversely with zoom", () => {
    const pos = getPortPosition("top", width, height, 2);
    expect(pos).toEqual({ x: 50, y: -(ANCHOR_SCREEN_PX / 2) });
  });

  test("should double offset when zoomed out to 0.5", () => {
    const pos = getPortPosition("right", width, height, 0.5);
    expect(pos).toEqual({ x: width + ANCHOR_SCREEN_PX * 2, y: 25 });
  });
});
