import type { Container } from "pixi.js";
import { Graphics } from "pixi.js";
import { ElementRegistry } from "../../registry/element-registry";
import type { CanvasEdge, CanvasElement, GroupMeta, Redrawable } from "../../types";

export function makeNode(id: string, x = 100, y = 200, w = 140, h = 68): CanvasElement {
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

export function makeGroup(
  id: string,
  opts: { x?: number; y?: number; width?: number; height?: number; collapsed?: boolean } = {},
): CanvasElement {
  const { x = 0, y = 0, width = 400, height = 300, collapsed = false } = opts;
  const actualHeight = collapsed ? 28 : height;
  return {
    id,
    type: "group",
    x,
    y,
    width,
    height: actualHeight,
    visible: true,
    parentGroupId: null,
    container: { x, y, visible: true } as unknown as Container,
    meta: {
      label: id,
      color: 0x38a169,
      collapsed,
      expandedHeight: height,
    } satisfies GroupMeta,
  };
}

export function makeEdge(id: string, sourceId: string, targetId: string): CanvasEdge {
  return {
    id,
    sourceId,
    sourceSide: "right",
    targetId,
    targetSide: "left",
    label: "HTTPS :443",
    labelColor: 0x3b82f6,
    line: new Graphics() as Redrawable,
    hitLine: new Graphics(),
    labelPill: null,
    labelText: null,
    selected: false,
  };
}

export function makeRegistry(...elements: CanvasElement[]): ElementRegistry {
  const registry = new ElementRegistry();
  for (const el of elements) {
    registry.addElement(el.id, el);
  }
  return registry;
}
