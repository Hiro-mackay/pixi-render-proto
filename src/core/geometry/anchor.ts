import type { Anchor, Point, Rect, Side } from "../types";

/**
 * Returns the side of `rect` closest to `point`.
 * Tiebreak order: right > bottom > left > top (horizontal edges preferred).
 */
export function getNearestSide(rect: Rect, point: Point): Side {
  const sides: readonly { side: Side; dist: number }[] = [
    { side: "right",  dist: Math.abs(point.x - (rect.x + rect.width)) },
    { side: "bottom", dist: Math.abs(point.y - (rect.y + rect.height)) },
    { side: "left",   dist: Math.abs(point.x - rect.x) },
    { side: "top",    dist: Math.abs(point.y - rect.y) },
  ];

  let best = sides[0]!;
  for (let i = 1; i < sides.length; i++) {
    if (sides[i]!.dist < best.dist) best = sides[i]!;
  }
  return best.side;
}

export function getFixedSideAnchor(rect: Rect, side: Side): Anchor {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  switch (side) {
    case "top":
      return { x: cx, y: rect.y, side };
    case "right":
      return { x: rect.x + rect.width, y: cy, side };
    case "bottom":
      return { x: cx, y: rect.y + rect.height, side };
    case "left":
      return { x: rect.x, y: cy, side };
  }
}
