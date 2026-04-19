import { Graphics } from "pixi.js";
import type { Container } from "pixi.js";
import { ACCENT_COLOR, type Redrawable } from "../types";
import type { ReadonlyElementRegistry } from "../registry/element-registry";

const OUTLINE_COLOR = ACCENT_COLOR;
const OUTLINE_WIDTH = 2;
const HANDLE_SIZE = 8;
const EDGE_HIT_WIDTH = 6;
const CORNER_COUNT = 4;

const HANDLE_CURSORS = [
  "nwse-resize", "nesw-resize", "nesw-resize", "nwse-resize",
  "ns-resize", "ew-resize", "ns-resize", "ew-resize",
] as const;

export function createOutlineGraphic(
  id: string,
  registry: ReadonlyElementRegistry,
  getScale: () => number,
  layer: Container,
): Redrawable {
  const outline = new Graphics() as Redrawable;
  outline.__redraw = () => {
    const el = registry.getElement(id);
    if (!el) return;
    const s = getScale();
    outline.clear();
    outline.rect(el.x, el.y, el.width, el.height);
    outline.stroke({ color: OUTLINE_COLOR, width: OUTLINE_WIDTH / s });
  };
  outline.__redraw();
  layer.addChild(outline);
  return outline;
}

export function createSelectionHandles(
  x: number, y: number, w: number, h: number,
  getScale: () => number,
  layer: Container,
): Graphics[] {
  const handles: Graphics[] = [];
  const corners = cornerPositions(x, y, w, h);
  for (let idx = 0; idx < CORNER_COUNT; idx++) {
    const [cx, cy] = corners[idx]!;
    const handle = new Graphics();
    handle.eventMode = "static";
    handle.cursor = HANDLE_CURSORS[idx];
    drawCornerHandle(handle, cx, cy, getScale());
    layer.addChild(handle);
    handles.push(handle);
  }

  const edges = edgeRects(x, y, w, h, getScale());
  for (let idx = 0; idx < 4; idx++) {
    const handle = new Graphics();
    handle.eventMode = "static";
    handle.cursor = HANDLE_CURSORS[CORNER_COUNT + idx];
    drawEdgeHandle(handle, edges[idx]!);
    layer.addChild(handle);
    handles.push(handle);
  }

  return handles;
}

export function positionSelectionHandles(
  handles: Graphics[],
  x: number, y: number, w: number, h: number,
  scale: number,
): void {
  const corners = cornerPositions(x, y, w, h);
  for (let idx = 0; idx < CORNER_COUNT; idx++) {
    const [cx, cy] = corners[idx]!;
    const handle = handles[idx];
    if (handle) drawCornerHandle(handle, cx, cy, scale);
  }
  const edges = edgeRects(x, y, w, h, scale);
  for (let idx = 0; idx < 4; idx++) {
    const handle = handles[CORNER_COUNT + idx];
    if (handle) drawEdgeHandle(handle, edges[idx]!);
  }
}

function drawCornerHandle(g: Graphics, cx: number, cy: number, scale: number): void {
  const half = HANDLE_SIZE / (2 * scale);
  g.clear();
  g.rect(cx - half, cy - half, half * 2, half * 2);
  g.fill({ color: 0xffffff });
  g.stroke({ color: OUTLINE_COLOR, width: 1 / scale });
}

function drawEdgeHandle(
  g: Graphics, r: { x: number; y: number; w: number; h: number },
): void {
  g.clear();
  g.rect(r.x, r.y, r.w, r.h);
  g.fill({ color: 0xffffff, alpha: 0.001 });
}

function cornerPositions(
  x: number, y: number, w: number, h: number,
): readonly [number, number][] {
  return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
}

function edgeRects(
  x: number, y: number, w: number, h: number, scale: number,
): readonly { x: number; y: number; w: number; h: number }[] {
  const half = EDGE_HIT_WIDTH / (2 * scale);
  const inset = HANDLE_SIZE / scale;
  return [
    { x: x + inset, y: y - half, w: w - inset * 2, h: half * 2 },
    { x: x + w - half, y: y + inset, w: half * 2, h: h - inset * 2 },
    { x: x + inset, y: y + h - half, w: w - inset * 2, h: half * 2 },
    { x: x, y: y + inset, w: half * 2, h: h - inset * 2 },
  ];
}
