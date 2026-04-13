import { describe, test, expect, beforeEach } from "vitest";
import { ElementRegistry } from "../../registry/element-registry";
import { findGroupAt, isInsideGroup } from "../membership";
import { makeNode, makeGroup } from "../../commands/__tests__/helpers";

describe("findGroupAt", () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
  });

  test("should return group id when point is inside group body", () => {
    const group = makeGroup("g1", { width: 400, height: 300 });
    registry.addElement("g1", group);

    const result = findGroupAt({ x: 200, y: 150 }, registry);
    expect(result).toBe("g1");
  });

  test("should return null when point is in header area", () => {
    const group = makeGroup("g1", { width: 400, height: 300 });
    registry.addElement("g1", group);

    const result = findGroupAt({ x: 200, y: 10 }, registry);
    expect(result).toBeNull();
  });

  test("should return null when point is outside all groups", () => {
    const group = makeGroup("g1", { width: 400, height: 300 });
    registry.addElement("g1", group);

    const result = findGroupAt({ x: 500, y: 500 }, registry);
    expect(result).toBeNull();
  });

  test("should return smallest group when nested", () => {
    const outer = makeGroup("g-outer", { width: 600, height: 500 });
    const inner = makeGroup("g-inner", { x: 50, y: 50, width: 200, height: 200 });
    registry.addElement("g-outer", outer);
    registry.addElement("g-inner", inner);

    const result = findGroupAt({ x: 100, y: 100 }, registry);
    expect(result).toBe("g-inner");
  });

  test("should exclude specified ids", () => {
    const group = makeGroup("g1", { width: 400, height: 300 });
    registry.addElement("g1", group);

    const result = findGroupAt({ x: 200, y: 150 }, registry, new Set(["g1"]));
    expect(result).toBeNull();
  });

  test("should skip invisible groups", () => {
    const group = makeGroup("g1", { width: 400, height: 300 });
    group.visible = false;
    registry.addElement("g1", group);

    const result = findGroupAt({ x: 200, y: 150 }, registry);
    expect(result).toBeNull();
  });

  test("should not match collapsed group body area", () => {
    // Collapsed group has height === HEADER_HEIGHT (28), so body region is zero
    const group = makeGroup("g1", { width: 400, height: 28, collapsed: true });
    registry.addElement("g1", group);

    // bodyTop === 0 + 28 === 28, group bottom === 28
    // Any point below header is outside (y > 28 fails), inside header (y < 28) is excluded by bodyTop check
    const headerPoint = findGroupAt({ x: 200, y: 14 }, registry);
    expect(headerPoint).toBeNull();

    const belowPoint = findGroupAt({ x: 200, y: 29 }, registry);
    expect(belowPoint).toBeNull();
  });

  test("should match collapsed group when another non-collapsed group contains the point", () => {
    const collapsed = makeGroup("g-collapsed", { width: 400, height: 28, collapsed: true });
    const expanded = makeGroup("g-expanded", { width: 400, height: 300 });
    registry.addElement("g-collapsed", collapsed);
    registry.addElement("g-expanded", expanded);

    // Point at y=100 is inside expanded group body but outside collapsed group
    const result = findGroupAt({ x: 200, y: 100 }, registry);
    expect(result).toBe("g-expanded");
  });
});

describe("isInsideGroup", () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
  });

  test("should return true when element center is inside group body", () => {
    const group = makeGroup("g1", { width: 400, height: 300 });
    const node = makeNode("n1", 100, 100);
    registry.addElement("g1", group);
    registry.addElement("n1", node);

    expect(isInsideGroup("n1", "g1", registry)).toBe(true);
  });

  test("should return false when element center is in header area", () => {
    const group = makeGroup("g1", { width: 400, height: 300 });
    const node = makeNode("n1", 100, 0, 100, 50);
    registry.addElement("g1", group);
    registry.addElement("n1", node);

    expect(isInsideGroup("n1", "g1", registry)).toBe(false);
  });

  test("should return false when element does not exist", () => {
    const group = makeGroup("g1", { width: 400, height: 300 });
    registry.addElement("g1", group);

    expect(isInsideGroup("missing", "g1", registry)).toBe(false);
  });
});
