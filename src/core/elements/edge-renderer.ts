import { Graphics, Text, TextStyle } from "pixi.js";
import type { Container } from "pixi.js";
import { getTextResolution } from "../types";
import type { CanvasEdge, Redrawable } from "../types";
import type { ReadonlyElementRegistry } from "../registry/element-registry";
import { computeBezierControlPoints, cubicBezierPoint, sideDirection } from "../geometry/bezier";
import { getFixedSideAnchor } from "../geometry/anchor";

const EDGE_COLOR = 0xa5b4cb;
const EDGE_ALPHA = 0.75;
const STROKE_WIDTH = 1.25;
const ARROW_SIZE = 8;
const HIT_STROKE_WIDTH = 10;
const SELECTED_COLOR = 0x3b82f6;
const SELECTED_STROKE_WIDTH = 2.5;
const DEFAULT_LABEL_BG = 0x475569;
const LABEL_STYLE = new TextStyle({
  fontFamily: "system-ui, -apple-system, sans-serif",
  fontSize: 9, fill: 0xffffff, fontWeight: "600", letterSpacing: 0.3,
});

export interface EdgeGraphicsResult {
  readonly line: Redrawable;
  readonly hitLine: Graphics;
  readonly labelPill: Redrawable | null;
  readonly labelText: Text | null;
}

export function createEdgeGraphics(
  label: string | undefined,
  lineParent: Container,
  labelParent: Container,
): EdgeGraphicsResult {
  const line: Redrawable = new Graphics();
  lineParent.addChild(line);
  const hitLine = new Graphics();
  hitLine.eventMode = "static";
  hitLine.cursor = "pointer";
  lineParent.addChild(hitLine);

  let labelPill: Redrawable | null = null;
  let labelText: Text | null = null;
  if (label) {
    labelPill = new Graphics();
    labelParent.addChild(labelPill);
    labelText = new Text({ text: label, style: LABEL_STYLE.clone(), resolution: getTextResolution() });
    labelText.anchor.set(0.5, 0.5);
    labelParent.addChild(labelText);
  }

  return { line, hitLine, labelPill, labelText };
}

function resolveVisibleElement(elementId: string, registry: ReadonlyElementRegistry): string | null {
  const visited = new Set<string>();
  let el = registry.getElementOrThrow(elementId);
  while (!el.visible && el.parentGroupId) {
    if (visited.has(el.parentGroupId)) return null;
    visited.add(el.parentGroupId);
    el = registry.getElementOrThrow(el.parentGroupId);
  }
  return el.visible ? el.id : null;
}

function setEdgeVisible(edge: CanvasEdge, visible: boolean): void {
  edge.line.visible = visible;
  edge.hitLine.visible = visible;
  if (edge.labelPill) edge.labelPill.visible = visible;
  if (edge.labelText) edge.labelText.visible = visible;
  if (!visible) edge._posCache = undefined;
}

export function updateEdgeGraphics(
  edge: CanvasEdge, registry: ReadonlyElementRegistry, getScale: () => number,
): void {
  const srcVisId = resolveVisibleElement(edge.sourceId, registry);
  const tgtVisId = resolveVisibleElement(edge.targetId, registry);
  if (!srcVisId || !tgtVisId || (srcVisId === tgtVisId && srcVisId !== edge.sourceId)) {
    setEdgeVisible(edge, false);
    return;
  }
  const srcEl = registry.getElementOrThrow(srcVisId);
  const tgtEl = registry.getElementOrThrow(tgtVisId);
  const scale = getScale();

  const cache = edge._posCache;
  if (cache &&
      cache.srcX === srcEl.x && cache.srcY === srcEl.y &&
      cache.srcW === srcEl.width && cache.srcH === srcEl.height &&
      cache.tgtX === tgtEl.x && cache.tgtY === tgtEl.y &&
      cache.tgtW === tgtEl.width && cache.tgtH === tgtEl.height &&
      cache.scale === scale && cache.selected === edge.selected) {
    return;
  }

  setEdgeVisible(edge, true);

  const start = getFixedSideAnchor(
    { x: srcEl.x, y: srcEl.y, width: srcEl.width, height: srcEl.height }, edge.sourceSide,
  );
  const end = getFixedSideAnchor(
    { x: tgtEl.x, y: tgtEl.y, width: tgtEl.width, height: tgtEl.height }, edge.targetSide,
  );
  const cp = computeBezierControlPoints(
    start.x, start.y, start.side, end.x, end.y, end.side,
  );
  const color = edge.selected ? SELECTED_COLOR : EDGE_COLOR;
  const alpha = edge.selected ? 1.0 : EDGE_ALPHA;
  const sw = (edge.selected ? SELECTED_STROKE_WIDTH : STROKE_WIDTH) / scale;

  edge.line.clear();
  edge.line.moveTo(start.x, start.y);
  edge.line.bezierCurveTo(cp.cp1x, cp.cp1y, cp.cp2x, cp.cp2y, end.x, end.y);
  edge.line.stroke({ width: sw, color, alpha });

  const dir = sideDirection(end.side);
  drawArrowHead(edge.line, end.x, end.y, -dir.x, -dir.y, sw, color, alpha);

  edge.hitLine.clear();
  edge.hitLine.moveTo(start.x, start.y);
  edge.hitLine.bezierCurveTo(cp.cp1x, cp.cp1y, cp.cp2x, cp.cp2y, end.x, end.y);
  edge.hitLine.stroke({ width: HIT_STROKE_WIDTH / scale, color: 0xffffff, alpha: 0.001 });

  if (edge.labelText && edge.labelPill) {
    const mid = cubicBezierPoint(
      0.5, start, { x: cp.cp1x, y: cp.cp1y }, { x: cp.cp2x, y: cp.cp2y }, end,
    );
    edge.labelText.position.set(mid.x, mid.y);
    const bg = edge.labelColor ?? DEFAULT_LABEL_BG;
    const b = edge.labelText.getLocalBounds();
    const w = b.width + 12, h = b.height + 5;
    edge.labelPill.clear();
    edge.labelPill.roundRect(mid.x - w / 2, mid.y - h / 2, w, h, h / 2);
    edge.labelPill.fill({ color: bg, alpha: 0.95 });
    edge.labelPill.stroke({ width: 0.5 / scale, color: 0x0f172a, alpha: 0.5 });
  }

  edge._posCache = {
    srcX: srcEl.x, srcY: srcEl.y, srcW: srcEl.width, srcH: srcEl.height,
    tgtX: tgtEl.x, tgtY: tgtEl.y, tgtW: tgtEl.width, tgtH: tgtEl.height,
    scale, selected: edge.selected,
  };
}

function drawArrowHead(
  g: Graphics, tipX: number, tipY: number,
  dirX: number, dirY: number, sw: number, color: number, alpha: number,
): void {
  const len = Math.hypot(dirX, dirY) || 1;
  const nx = dirX / len, ny = dirY / len;
  const px = -ny, py = nx;
  const bx = tipX - nx * ARROW_SIZE, by = tipY - ny * ARROW_SIZE;
  g.moveTo(tipX, tipY);
  g.lineTo(bx + px * ARROW_SIZE * 0.5, by + py * ARROW_SIZE * 0.5);
  g.lineTo(bx - px * ARROW_SIZE * 0.5, by - py * ARROW_SIZE * 0.5);
  g.lineTo(tipX, tipY);
  g.fill({ color, alpha: Math.min(alpha + 0.2, 1.0) });
  g.stroke({ width: sw * 0.5, color, alpha });
}

export function removeEdgeGraphics(edge: CanvasEdge): void {
  edge.line.removeFromParent();
  edge.line.destroy();
  edge.hitLine.removeFromParent();
  edge.hitLine.destroy();
  if (edge.labelPill) { edge.labelPill.removeFromParent(); edge.labelPill.destroy(); }
  if (edge.labelText) { edge.labelText.removeFromParent(); edge.labelText.destroy(); }
}
