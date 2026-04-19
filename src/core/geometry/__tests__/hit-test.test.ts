import type { Container } from "pixi.js";
import { describe, expect, test } from "vitest";
import { ElementRegistry } from "../../registry/element-registry";
import type { CanvasElement } from "../../types";
import { findNodeAt } from "../hit-test";

function makeNode(id: string, x = 100, y = 100, w = 140, h = 68): CanvasElement {
  return {
    id,
    type: "node",
    x,
    y,
    width: w,
    height: h,
    visible: true,
    parentGroupId: null,
    container: { x, y, visible: true } as unknown as Container,
    meta: { label: id, color: 0x2d3748 },
  };
}

function makeRegistry(...elements: CanvasElement[]): ElementRegistry {
  const registry = new ElementRegistry();
  for (const el of elements) registry.addElement(el.id, el);
  return registry;
}

describe("findNodeAt", () => {
  test("should find a node when point is inside its bounds", () => {
    const n1 = makeNode("n1", 100, 100, 140, 68);
    const registry = makeRegistry(n1);
    const result = findNodeAt({ x: 150, y: 130 }, registry);
    expect(result?.id).toBe("n1");
  });

  test("should return null when point is outside all nodes", () => {
    const n1 = makeNode("n1", 100, 100, 140, 68);
    const registry = makeRegistry(n1);
    expect(findNodeAt({ x: 0, y: 0 }, registry)).toBeNull();
  });

  test("should exclude the specified node", () => {
    const n1 = makeNode("n1", 100, 100, 140, 68);
    const registry = makeRegistry(n1);
    expect(findNodeAt({ x: 150, y: 130 }, registry, "n1")).toBeNull();
  });

  test("should skip invisible nodes", () => {
    const n1 = makeNode("n1", 100, 100, 140, 68);
    n1.visible = false;
    const registry = makeRegistry(n1);
    expect(findNodeAt({ x: 150, y: 130 }, registry)).toBeNull();
  });

  test("should return the topmost (last-added) node when overlapping", () => {
    const n1 = makeNode("n1", 100, 100, 140, 68);
    const n2 = makeNode("n2", 120, 110, 140, 68);
    const registry = makeRegistry(n1, n2);
    const result = findNodeAt({ x: 150, y: 130 }, registry);
    expect(result?.id).toBe("n2");
  });
});
