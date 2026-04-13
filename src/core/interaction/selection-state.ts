import { Container, Graphics } from "pixi.js";
import type { Redrawable } from "../types";
import type { ReadonlyElementRegistry } from "../registry/element-registry";

const OUTLINE_COLOR = 0x3b82f6;
const OUTLINE_WIDTH = 2;
const HANDLE_SIZE = 8;
const EDGE_HIT_WIDTH = 6;

// 0-3: corners (NW, NE, SW, SE), 4-7: boundary edges (N, E, S, W)
const HANDLE_CURSORS = [
  "nwse-resize", "nesw-resize", "nesw-resize", "nwse-resize",
  "ns-resize", "ew-resize", "ns-resize", "ew-resize",
] as const;

const CORNER_COUNT = 4;

export class SelectionState {
  private selectedId: string | null = null;
  private outline: Redrawable | null = null;
  private handles: Graphics[] = [];
  private resizing = false;

  getHandles(): Graphics[] {
    return this.handles;
  }

  constructor(
    private readonly selectionLayer: Container,
    private readonly registry: ReadonlyElementRegistry,
    private readonly getScale: () => number,
    private readonly onHandlesCreated?: (handles: Graphics[]) => void,
  ) {}

  select(id: string): void {
    if (this.selectedId === id) return;
    this.clear();
    const el = this.registry.getElement(id);
    if (!el) return;
    this.selectedId = id;

    const outline = new Graphics() as Redrawable;
    outline.__redraw = () => {
      const current = this.registry.getElement(id);
      if (!current) return;
      const s = this.getScale();
      outline.clear();
      outline.rect(current.x, current.y, current.width, current.height);
      outline.stroke({ color: OUTLINE_COLOR, width: OUTLINE_WIDTH / s });
    };
    outline.__redraw();
    this.selectionLayer.addChild(outline);
    this.outline = outline;

    this.createHandles(el.x, el.y, el.width, el.height);

    const ports = el.container.children.find(
      (c) => c.label === "ports",
    );
    if (ports) ports.visible = true;
  }

  clear(): void {
    if (!this.selectedId) return;
    const el = this.registry.getElement(this.selectedId);
    if (el) {
      const ports = el.container.children.find(
        (c) => c.label === "ports",
      );
      if (ports) ports.visible = false;
    }
    if (this.outline) {
      this.outline.destroy();
      this.outline = null;
    }
    for (const h of this.handles) h.destroy();
    this.handles = [];
    this.selectedId = null;
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  update(): void {
    this.outline?.__redraw?.();
    const el = this.selectedId
      ? this.registry.getElement(this.selectedId)
      : null;
    if (!el) return;
    this.positionHandles(el.x, el.y, el.width, el.height);
  }

  destroy(): void {
    this.clear();
  }

  isResizing(): boolean {
    return this.resizing;
  }

  setResizing(v: boolean): void {
    this.resizing = v;
  }

  private createHandles(
    x: number, y: number, w: number, h: number,
  ): void {
    // 4 corner handles (visible squares)
    const corners = cornerPositions(x, y, w, h);
    for (let idx = 0; idx < CORNER_COUNT; idx++) {
      const [cx, cy] = corners[idx]!;
      const handle = new Graphics();
      handle.eventMode = "static";
      handle.cursor = HANDLE_CURSORS[idx];
      this.drawCornerHandle(handle, cx, cy);
      this.selectionLayer.addChild(handle);
      this.handles.push(handle);
    }

    // 4 edge handles (transparent hit-lines along boundary)
    const edges = edgeRects(x, y, w, h, this.getScale());
    for (let idx = 0; idx < 4; idx++) {
      const handle = new Graphics();
      handle.eventMode = "static";
      handle.cursor = HANDLE_CURSORS[CORNER_COUNT + idx];
      this.drawEdgeHandle(handle, edges[idx]!);
      this.selectionLayer.addChild(handle);
      this.handles.push(handle);
    }

    this.onHandlesCreated?.(this.handles);
  }

  private positionHandles(
    x: number, y: number, w: number, h: number,
  ): void {
    const corners = cornerPositions(x, y, w, h);
    for (let idx = 0; idx < CORNER_COUNT; idx++) {
      const [cx, cy] = corners[idx]!;
      const handle = this.handles[idx];
      if (handle) this.drawCornerHandle(handle, cx, cy);
    }

    const edges = edgeRects(x, y, w, h, this.getScale());
    for (let idx = 0; idx < 4; idx++) {
      const handle = this.handles[CORNER_COUNT + idx];
      if (handle) this.drawEdgeHandle(handle, edges[idx]!);
    }
  }

  private drawCornerHandle(g: Graphics, cx: number, cy: number): void {
    const s = this.getScale();
    const half = HANDLE_SIZE / (2 * s);
    g.clear();
    g.rect(cx - half, cy - half, half * 2, half * 2);
    g.fill({ color: 0xffffff });
    g.stroke({ color: OUTLINE_COLOR, width: 1 / s });
  }

  private drawEdgeHandle(
    g: Graphics, r: { x: number; y: number; w: number; h: number },
  ): void {
    g.clear();
    g.rect(r.x, r.y, r.w, r.h);
    g.fill({ color: 0xffffff, alpha: 0.001 });
  }
}

function cornerPositions(
  x: number, y: number, w: number, h: number,
): readonly [number, number][] {
  return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
}

/** Returns N, E, S, W edge hit-area rects. */
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
