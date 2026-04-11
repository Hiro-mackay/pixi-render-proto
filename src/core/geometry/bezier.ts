import type { BezierPoints, Point, Side } from "../types";

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
  const startDir = sideDirection(startSide);

  const startProj = dx * startDir.x + dy * startDir.y;
  const startOffset =
    startProj > 0
      ? Math.min(Math.max(startProj * 0.4, 30), 200)
      : Math.min(Math.abs(startProj) * 0.6 + 60, 300);

  const cp1x = startX + startDir.x * startOffset;
  const cp1y = startY + startDir.y * startOffset;

  let cp2x: number;
  let cp2y: number;
  if (endSide) {
    const endDir = sideDirection(endSide);
    const endProj = -dx * endDir.x + -dy * endDir.y;
    const endOffset =
      endProj > 0
        ? Math.min(Math.max(endProj * 0.4, 30), 200)
        : Math.min(Math.abs(endProj) * 0.6 + 60, 300);
    cp2x = endX + endDir.x * endOffset;
    cp2y = endY + endDir.y * endOffset;
  } else {
    cp2x = endX - dx * 0.25;
    cp2y = endY - dy * 0.25;
  }
  return { cp1x, cp1y, cp2x, cp2y };
}

export function cubicBezierPoint(
  t: number,
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
}
