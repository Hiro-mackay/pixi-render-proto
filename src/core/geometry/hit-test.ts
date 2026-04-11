import type { Point, Rect } from "../types";

export function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export interface HitTestable {
  readonly visible: boolean;
  readonly rect: Rect;
}

export function findElementAtPoint<T extends HitTestable>(
  elements: readonly T[],
  point: Point,
): T | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i]!;
    if (!el.visible) continue;
    if (pointInRect(point, el.rect)) return el;
  }
  return null;
}
