import type { Point, CanvasElement } from "../types";
import type { ReadonlyElementRegistry } from "../registry/element-registry";

/**
 * Find the topmost node at the given point.
 * Iterates in reverse insertion order so that later-added (visually on top) nodes win.
 */
export function findNodeAt(
  point: Point,
  registry: ReadonlyElementRegistry,
  excludeId?: string,
): CanvasElement | null {
  const nodes = registry.getAllNodes();
  for (let i = nodes.length - 1; i >= 0; i--) {
    const el = nodes[i]!;
    if (el.id === excludeId) continue;
    if (!el.visible) continue;
    if (
      point.x >= el.x && point.x <= el.x + el.width &&
      point.y >= el.y && point.y <= el.y + el.height
    ) {
      return el;
    }
  }
  return null;
}

/**
 * Walk up the parent chain to find the nearest visible ancestor.
 * Returns null if the element and all ancestors are hidden.
 */
export function resolveVisibleElement(
  elementId: string,
  registry: ReadonlyElementRegistry,
): string | null {
  const visited = new Set<string>();
  let el = registry.getElement(elementId);
  if (!el) return null;
  while (!el.visible && el.parentGroupId) {
    if (visited.has(el.parentGroupId)) return null;
    visited.add(el.parentGroupId);
    el = registry.getElement(el.parentGroupId);
    if (!el) return null;
  }
  return el.visible ? el.id : null;
}
