import type { Graphics } from "pixi.js";
import { getFixedSideAnchor, getNearestSide } from "../geometry/anchor";
import { computeBezierControlPoints } from "../geometry/bezier";
import type { Rect, Side } from "../types";

const GHOST_STROKE_WIDTH = 1.5;
const GHOST_ENDPOINT_RADIUS = 4;
const HIGHLIGHT_PAD = 4;
const HIGHLIGHT_STROKE_WIDTH = 2.5;

export function drawHighlight(
  graphics: Graphics,
  el: Rect | null,
  scale: number,
  color: number,
): void {
  graphics.clear();
  if (!el) {
    graphics.visible = false;
    return;
  }
  const pad = HIGHLIGHT_PAD / scale;
  const strokeW = HIGHLIGHT_STROKE_WIDTH / scale;
  graphics.roundRect(el.x - pad, el.y - pad, el.width + pad * 2, el.height + pad * 2, 10);
  graphics.stroke({ width: strokeW, color, alpha: 0.8 });
  graphics.visible = true;
}

export function drawGhostLine(
  graphics: Graphics,
  from: { x: number; y: number },
  fromSide: Side,
  cursor: { x: number; y: number },
  snapTarget: Rect | null,
  scale: number,
  color: number,
): void {
  let endX = cursor.x;
  let endY = cursor.y;
  let endSide: Side | null = null;

  if (snapTarget) {
    const side = getNearestSide(snapTarget, cursor);
    const anchor = getFixedSideAnchor(snapTarget, side);
    endX = anchor.x;
    endY = anchor.y;
    endSide = side;
  }

  const { cp1x, cp1y, cp2x, cp2y } = computeBezierControlPoints(
    from.x,
    from.y,
    fromSide,
    endX,
    endY,
    endSide,
  );

  graphics.clear();
  graphics.moveTo(from.x, from.y);
  graphics.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
  graphics.stroke({ width: GHOST_STROKE_WIDTH / scale, color, alpha: 0.9 });
  graphics.circle(endX, endY, GHOST_ENDPOINT_RADIUS / scale);
  graphics.fill({ color, alpha: 0.9 });
}
