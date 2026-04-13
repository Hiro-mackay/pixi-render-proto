import { describe, test, expect } from "vitest";
import { halveColor } from "../group-renderer";

describe("halveColor", () => {
  test("should halve each RGB channel independently", () => {
    expect(halveColor(0xffffff)).toBe(0x7f7f7f);
  });

  test("should return 0 for black", () => {
    expect(halveColor(0x000000)).toBe(0x000000);
  });

  test("should not bleed across channel boundaries", () => {
    // G=1 must not bleed into B channel
    expect(halveColor(0x010200)).toBe(0x000100);
  });

  test("should halve pure red correctly", () => {
    expect(halveColor(0xff0000)).toBe(0x7f0000);
  });

  test("should halve pure green correctly", () => {
    expect(halveColor(0x00ff00)).toBe(0x007f00);
  });

  test("should halve pure blue correctly", () => {
    expect(halveColor(0x0000ff)).toBe(0x00007f);
  });

  test("should handle odd channel values", () => {
    // 0x030507: r=3>>1=1, g=5>>1=2, b=7>>1=3
    expect(halveColor(0x030507)).toBe(0x010203);
  });
});
