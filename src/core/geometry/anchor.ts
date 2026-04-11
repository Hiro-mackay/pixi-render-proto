import type { Anchor, Point, Rect, Side } from "../types";

export function getNearestSide(rect: Rect, point: Point): Side {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const sides: ReadonlyArray<{ side: Side; x: number; y: number }> = [
    { side: "top", x: cx, y: rect.y },
    { side: "right", x: rect.x + rect.width, y: cy },
    { side: "bottom", x: cx, y: rect.y + rect.height },
    { side: "left", x: rect.x, y: cy },
  ];
  let best = sides[0]!;
  let bestDist = Infinity;
  for (const s of sides) {
    const d = Math.hypot(s.x - point.x, s.y - point.y);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
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
