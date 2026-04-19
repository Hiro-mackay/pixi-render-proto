import type { Anchor, Point, Rect, Side } from "../types";

/**
 * Returns the side of `rect` closest to `point`.
 * Tiebreak order: right > bottom > left > top (horizontal edges preferred).
 */
export function getNearestSide(rect: Rect, point: Point): Side {
  const sides: readonly { side: Side; dist: number }[] = [
    { side: "right", dist: Math.abs(point.x - (rect.x + rect.width)) },
    { side: "bottom", dist: Math.abs(point.y - (rect.y + rect.height)) },
    { side: "left", dist: Math.abs(point.x - rect.x) },
    { side: "top", dist: Math.abs(point.y - rect.y) },
  ];

  let best = sides[0]!;
  for (let i = 1; i < sides.length; i++) {
    if (sides[i]!.dist < best.dist) best = sides[i]!;
  }
  return best.side;
}

// Near 45-degree boundaries, prefer horizontal to avoid rapid side flipping during drag.
const DEAD_ZONE_RATIO = 0.15;

export function computeOptimalSides(
  srcRect: Rect,
  tgtRect: Rect,
): { readonly srcSide: Side; readonly tgtSide: Side } {
  const srcCx = srcRect.x + srcRect.width / 2;
  const srcCy = srcRect.y + srcRect.height / 2;
  const tgtCx = tgtRect.x + tgtRect.width / 2;
  const tgtCy = tgtRect.y + tgtRect.height / 2;
  const dx = tgtCx - srcCx;
  const dy = tgtCy - srcCy;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  // Overlap detection
  const overlapX = srcRect.x < tgtRect.x + tgtRect.width && tgtRect.x < srcRect.x + srcRect.width;
  const overlapY = srcRect.y < tgtRect.y + tgtRect.height && tgtRect.y < srcRect.y + srcRect.height;

  let useHorizontal: boolean;

  if (adx === 0 && ady === 0) {
    // Fully overlapping centers → fallback
    useHorizontal = true;
  } else if (overlapX && !overlapY) {
    // Horizontal overlap → use vertical sides
    useHorizontal = false;
  } else if (overlapY && !overlapX) {
    // Vertical overlap → use horizontal sides
    useHorizontal = true;
  } else {
    // Both have gap or both overlap → use dominant axis with dead zone
    const maxD = Math.max(adx, ady, 1);
    useHorizontal = (adx - ady) / maxD >= -DEAD_ZONE_RATIO;
  }

  if (useHorizontal) {
    return dx >= 0 ? { srcSide: "right", tgtSide: "left" } : { srcSide: "left", tgtSide: "right" };
  }
  return dy >= 0 ? { srcSide: "bottom", tgtSide: "top" } : { srcSide: "top", tgtSide: "bottom" };
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
