import type { BezierPoints, Point, Side } from "../types";

// Control-point offset: large base for consistent S-curves, near-zero distance scaling.
const BASE_OFFSET = 100;
const DISTANCE_FACTOR = 0.1;
const MIN_OFFSET = 100;
const MAX_OFFSET = 300;

const SAME_SIDE_PERPENDICULAR_RATIO = 0.6;
const SAME_SIDE_MIN_PERPENDICULAR = 40;
const SAME_SIDE_DISTANCE_RATIO = 0.3;
const FALLBACK_RATIO = 0.25;

export function sideDirection(side: Side): Point {
  switch (side) {
    case "right":
      return { x: 1, y: 0 };
    case "left":
      return { x: -1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "top":
      return { x: 0, y: -1 };
  }
}

export function computeBezierControlPoints(
  startX: number,
  startY: number,
  startSide: Side,
  endX: number,
  endY: number,
  endSide: Side | null,
): BezierPoints {
  const dx = endX - startX;
  const dy = endY - startY;
  const distance = Math.hypot(dx, dy);
  const startDir = sideDirection(startSide);

  const offset = Math.min(
    Math.max(BASE_OFFSET + distance * DISTANCE_FACTOR, MIN_OFFSET),
    MAX_OFFSET,
  );

  let cp1x = startX + startDir.x * offset;
  let cp1y = startY + startDir.y * offset;

  let cp2x: number;
  let cp2y: number;
  if (endSide) {
    const endDir = sideDirection(endSide);
    cp2x = endX + endDir.x * offset;
    cp2y = endY + endDir.y * offset;

    // Same-side connections need perpendicular displacement to form a U-curve
    if (startSide === endSide) {
      const perpDist = Math.abs(dx * startDir.y - dy * startDir.x);
      const dynamicMinPerp = Math.min(
        Math.max(distance * SAME_SIDE_DISTANCE_RATIO, 15),
        SAME_SIDE_MIN_PERPENDICULAR,
      );
      const perpOffset = Math.max(perpDist * SAME_SIDE_PERPENDICULAR_RATIO, dynamicMinPerp);
      const perpX = -startDir.y;
      const perpY = startDir.x;
      // Choose direction away from the midpoint between start and end
      const midPerpProj =
        ((startX + endX) / 2 - startX) * perpX + ((startY + endY) / 2 - startY) * perpY;
      const sign = midPerpProj >= 0 ? 1 : -1;
      cp1x += perpX * perpOffset * sign;
      cp1y += perpY * perpOffset * sign;
      cp2x += perpX * perpOffset * sign;
      cp2y += perpY * perpOffset * sign;
    }
  } else {
    cp2x = endX - dx * FALLBACK_RATIO;
    cp2y = endY - dy * FALLBACK_RATIO;
  }
  return { cp1x, cp1y, cp2x, cp2y };
}

export function cubicBezierPoint(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const ct = Math.max(0, Math.min(1, t));
  const mt = 1 - ct;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = ct * ct;
  const t3 = t2 * ct;
  return {
    x: mt3 * p0.x + 3 * mt2 * ct * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * ct * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
}
