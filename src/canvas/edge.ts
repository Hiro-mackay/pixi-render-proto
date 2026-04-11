import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { viewState } from "./view-state";
import type { Redrawable, ProtocolLabel, Side } from "./types";
import { sideDirection, textResolution, getNodeWorldRect } from "./types";

export type EdgeData = {
  id: string;
  sourceNode: Container;
  targetNode?: Container;
  targetPos?: { x: number; y: number };
  label?: string;
};

/**
 * Edge visual design
 * ------------------
 * - Lines start/end at the node border (not center), on the side facing
 *   the other node. Prevents lines from passing through nodes.
 * - Smooth cubic bezier with control points extending perpendicular to
 *   the anchor side. This creates an organized "conduit" appearance.
 * - Uniform low-opacity slate color keeps the lines as a background
 *   layer; nodes remain the visual focus.
 * - Labels are colored pills carrying the semantic information.
 * - Filled triangle arrow heads for a clean, solid look.
 */

const EDGE_COLOR = 0xa5b4cb;
const EDGE_ALPHA = 0.75;
const STROKE_WIDTH = 1.25;
const ARROW_SIZE = 8;

const PROTOCOL_COLORS: Record<ProtocolLabel, number> = {
  "HTTPS :443": 0x3b82f6,
  "gRPC :50051": 0x06b6d4,
  "TCP :5432": 0x10b981,
  "Redis :6379": 0xef4444,
  "AMQP :5672": 0xf59e0b,
};
const DEFAULT_LABEL_BG = 0x475569;

const EDGE_LABEL_STYLE = new TextStyle({
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 9,
  fill: 0xffffff,
  fontWeight: "600",
  letterSpacing: 0.3,
});

type Anchor = {
  x: number;
  y: number;
  side: Side;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const HIT_STROKE_WIDTH = 10;
const SELECTED_COLOR = 0x3b82f6;
const SELECTED_STROKE_WIDTH = 2.5;

export type EdgeDisplay = {
  id: string;
  line: Redrawable;
  hitLine: Graphics;
  labelPill: Redrawable | null;
  labelText: Text | null;
  sourceNode: Container;
  targetNode: Container | null;
  targetPos: { x: number; y: number } | null;
  selected: boolean;
};

export function createEdge(
  data: EdgeData,
  lineParent: Container,
  labelParent: Container,
): EdgeDisplay {
  const line: Redrawable = new Graphics();
  lineParent.addChild(line);

  const hitLine = new Graphics();
  hitLine.eventMode = "static";
  hitLine.cursor = "pointer";
  lineParent.addChild(hitLine);

  let labelText: Text | null = null;
  let labelPill: Redrawable | null = null;
  if (data.label) {
    labelPill = new Graphics();
    labelParent.addChild(labelPill);

    labelText = new Text({
      text: data.label,
      style: EDGE_LABEL_STYLE,
      resolution: textResolution(),
    });
    labelText.anchor.set(0.5, 0.5);
    labelParent.addChild(labelText);
  }

  const display: EdgeDisplay = {
    id: data.id,
    line,
    hitLine,
    labelPill,
    labelText,
    sourceNode: data.sourceNode,
    targetNode: data.targetNode ?? null,
    targetPos: data.targetPos ?? null,
    selected: false,
  };

  updateEdge(display, data.label);
  line.__redraw = () => updateEdge(display, data.label);

  return display;
}

export function setEdgeSelected(edge: EdgeDisplay, selected: boolean): void {
  edge.selected = selected;
  updateEdge(edge);
}

export function updateEdge(edge: EdgeDisplay, label?: string): void {
  const sourceRect = getNodeWorldRect(edge.sourceNode);
  const sourceCenter = {
    x: sourceRect.x + sourceRect.width / 2,
    y: sourceRect.y + sourceRect.height / 2,
  };

  let targetCenter: { x: number; y: number };
  let endAnchor: Anchor;

  if (edge.targetNode) {
    const targetRect = getNodeWorldRect(edge.targetNode);
    targetCenter = {
      x: targetRect.x + targetRect.width / 2,
      y: targetRect.y + targetRect.height / 2,
    };
    endAnchor = getSideAnchor(targetRect, sourceCenter);
  } else if (edge.targetPos) {
    targetCenter = edge.targetPos;
    const dx = sourceCenter.x - edge.targetPos.x;
    const dy = sourceCenter.y - edge.targetPos.y;
    const side: Side = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? "right" : "left")
      : (dy > 0 ? "bottom" : "top");
    endAnchor = { x: edge.targetPos.x, y: edge.targetPos.y, side };
  } else {
    return;
  }

  const startAnchor = getSideAnchor(sourceRect, targetCenter);

  // Control points extend perpendicular to anchor sides (organized flow)
  const dist = Math.hypot(
    endAnchor.x - startAnchor.x,
    endAnchor.y - startAnchor.y,
  );
  const offset = Math.min(Math.max(dist * 0.4, 30), 120);

  const startDir = sideDirection(startAnchor.side);
  const endDir = sideDirection(endAnchor.side);

  const cp1x = startAnchor.x + startDir.x * offset;
  const cp1y = startAnchor.y + startDir.y * offset;
  const cp2x = endAnchor.x + endDir.x * offset;
  const cp2y = endAnchor.y + endDir.y * offset;

  const color = edge.selected ? SELECTED_COLOR : EDGE_COLOR;
  const alpha = edge.selected ? 1.0 : EDGE_ALPHA;
  const baseWidth = edge.selected ? SELECTED_STROKE_WIDTH : STROKE_WIDTH;
  const strokeWidth = baseWidth / viewState.scale;

  edge.line.clear();
  edge.line.moveTo(startAnchor.x, startAnchor.y);
  edge.line.bezierCurveTo(
    cp1x,
    cp1y,
    cp2x,
    cp2y,
    endAnchor.x,
    endAnchor.y,
  );
  edge.line.stroke({
    width: strokeWidth,
    color,
    alpha,
  });

  drawArrowHead(
    edge.line,
    endAnchor.x,
    endAnchor.y,
    -endDir.x,
    -endDir.y,
    strokeWidth,
    color,
    alpha,
  );

  // Wider invisible hit area for click detection
  edge.hitLine.clear();
  edge.hitLine.moveTo(startAnchor.x, startAnchor.y);
  edge.hitLine.bezierCurveTo(
    cp1x,
    cp1y,
    cp2x,
    cp2y,
    endAnchor.x,
    endAnchor.y,
  );
  edge.hitLine.stroke({
    width: HIT_STROKE_WIDTH / viewState.scale,
    color: 0xffffff,
    alpha: 0.001,
  });

  if (edge.labelText && edge.labelPill) {
    const t = 0.5;
    const mid = cubicBezierPoint(
      t,
      startAnchor,
      { x: cp1x, y: cp1y },
      { x: cp2x, y: cp2y },
      endAnchor,
    );
    edge.labelText.position.set(mid.x, mid.y);

    drawLabelPill(edge.labelPill, edge.labelText, label);
  }
}

function drawLabelPill(
  pill: Graphics,
  text: Text,
  label: string | undefined,
): void {
  const bgColor =
    (label && label in PROTOCOL_COLORS
      ? PROTOCOL_COLORS[label as ProtocolLabel]
      : DEFAULT_LABEL_BG);

  const padX = 6;
  const padY = 2.5;
  const localBounds = text.getLocalBounds();
  const w = localBounds.width + padX * 2;
  const h = localBounds.height + padY * 2;

  pill.clear();
  pill.roundRect(
    text.x - w / 2,
    text.y - h / 2,
    w,
    h,
    h / 2,
  );
  pill.fill({ color: bgColor, alpha: 0.95 });
  pill.stroke({
    width: 0.5 / viewState.scale,
    color: 0x0f172a,
    alpha: 0.5,
  });
}

function getSideAnchor(rect: Rect, target: { x: number; y: number }): Anchor {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;

  if (dx === 0 && dy === 0) {
    return { x: cx, y: cy, side: "right" };
  }

  // Find where the line from center toward target exits the rectangle
  const halfW = rect.width / 2;
  const halfH = rect.height / 2;
  const scaleX = halfW / Math.max(Math.abs(dx), 0.0001);
  const scaleY = halfH / Math.max(Math.abs(dy), 0.0001);
  const scale = Math.min(scaleX, scaleY);

  const ax = cx + dx * scale;
  const ay = cy + dy * scale;

  let side: Side;
  if (scaleX < scaleY) {
    side = dx > 0 ? "right" : "left";
  } else {
    side = dy > 0 ? "bottom" : "top";
  }

  return { x: ax, y: ay, side };
}

function cubicBezierPoint(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
): { x: number; y: number } {
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

function drawArrowHead(
  g: Graphics,
  tipX: number,
  tipY: number,
  dirX: number,
  dirY: number,
  strokeWidth: number,
  color: number = EDGE_COLOR,
  alpha: number = EDGE_ALPHA,
): void {
  const len = Math.hypot(dirX, dirY) || 1;
  const nx = dirX / len;
  const ny = dirY / len;

  const px = -ny;
  const py = nx;

  const baseX = tipX - nx * ARROW_SIZE;
  const baseY = tipY - ny * ARROW_SIZE;

  const leftX = baseX + px * (ARROW_SIZE * 0.5);
  const leftY = baseY + py * (ARROW_SIZE * 0.5);
  const rightX = baseX - px * (ARROW_SIZE * 0.5);
  const rightY = baseY - py * (ARROW_SIZE * 0.5);

  g.moveTo(tipX, tipY);
  g.lineTo(leftX, leftY);
  g.lineTo(rightX, rightY);
  g.lineTo(tipX, tipY);
  g.fill({ color, alpha: Math.min(alpha + 0.2, 1.0) });
  g.stroke({
    width: strokeWidth * 0.5,
    color,
    alpha,
  });
}
