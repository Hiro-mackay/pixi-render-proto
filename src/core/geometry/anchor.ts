import type { Anchor, Rect, Side } from "../types";

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
