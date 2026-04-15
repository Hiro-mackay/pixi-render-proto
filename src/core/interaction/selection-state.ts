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
  private readonly selectedIds = new Set<string>();
  private selectedEdgeId: string | null = null;
  private readonly outlines = new Map<string, Redrawable>();
  private handles: Graphics[] = [];
  private resizing = false;

  getHandles(): readonly Graphics[] {
    return this.handles;
  }

  private onSelectionChange?: (selectedIds: readonly string[]) => void;

  constructor(
    private readonly selectionLayer: Container,
    private readonly registry: ReadonlyElementRegistry,
    private readonly getScale: () => number,
    private readonly onHandlesCreated?: (handles: Graphics[]) => void,
  ) {}

  setOnSelectionChange(cb: (selectedIds: readonly string[]) => void): void {
    this.onSelectionChange = cb;
  }

  private notifyChange(): void {
    this.onSelectionChange?.([...this.selectedIds]);
  }

  // --- Element selection ---

  select(id: string): void {
    if (this.selectedIds.size === 1 && this.selectedIds.has(id)) return;
    this.clearEdge();
    this.clearElements();
    this.addToSelection(id);
    this.notifyChange();
  }

  selectMultiple(ids: readonly string[]): void {
    this.clearEdge();
    this.clearElements();
    for (const id of ids) {
      const el = this.registry.getElement(id);
      if (!el) continue;
      this.selectedIds.add(id);
      this.createOutline(id);
    }
    if (this.selectedIds.size === 1) {
      const id = this.selectedIds.values().next().value ?? null;
      if (!id) return;
      const el = this.registry.getElement(id);
      if (!el) return;
      this.createHandles(el.x, el.y, el.width, el.height);
      const ports = el.container.children.find((c) => c.label === "ports");
      if (ports) ports.visible = true;
    }
    this.notifyChange();
  }

  toggle(id: string): void {
    this.clearEdge();
    if (this.selectedIds.has(id)) {
      this.removeFromSelection(id);
    } else {
      this.addToSelection(id);
    }
    this.notifyChange();
  }

  clear(): void {
    const hadSelection = this.selectedIds.size > 0 || this.selectedEdgeId !== null;
    this.clearEdge();
    this.clearElements();
    if (hadSelection) this.notifyChange();
  }

  getSelectedId(): string | null {
    if (this.selectedIds.size !== 1) return null;
    return this.selectedIds.values().next().value ?? null;
  }

  getSelectedIds(): ReadonlySet<string> {
    return this.selectedIds;
  }

  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  // --- Edge selection (single, mutually exclusive with elements) ---

  selectEdge(edgeId: string): void {
    if (this.selectedEdgeId === edgeId) {
      const edge = this.registry.getEdge(edgeId);
      if (edge) edge.selected = true;
      return;
    }
    this.clear();
    const edge = this.registry.getEdge(edgeId);
    if (!edge) return;
    this.selectedEdgeId = edgeId;
    edge.selected = true;
  }

  getSelectedEdgeId(): string | null {
    return this.selectedEdgeId;
  }

  // --- State ---

  update(): void {
    for (const outline of this.outlines.values()) {
      outline.__redraw?.();
    }
    if (this.selectedIds.size === 1) {
      const id = this.selectedIds.values().next().value;
      const el = id ? this.registry.getElement(id) : null;
      if (el) this.positionHandles(el.x, el.y, el.width, el.height);
    }
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

  // --- Internal: element selection management ---

  private addToSelection(id: string): void {
    const el = this.registry.getElement(id);
    if (!el) return;

    // If going from single to multi, remove handles + ports from the single element
    if (this.selectedIds.size === 1) {
      this.destroyHandles();
      this.hidePortsForAll();
    }

    this.selectedIds.add(id);
    this.createOutline(id);

    if (this.selectedIds.size === 1) {
      // Single selection: show handles + ports
      this.createHandles(el.x, el.y, el.width, el.height);
      const ports = el.container.children.find((c) => c.label === "ports");
      if (ports) ports.visible = true;
    }
    // Multi-selection: outlines only, no handles or ports
  }

  private removeFromSelection(id: string): void {
    if (!this.selectedIds.has(id)) return;

    const wasSingle = this.selectedIds.size === 1;
    this.selectedIds.delete(id);

    // Remove outline
    const outline = this.outlines.get(id);
    if (outline) {
      outline.destroy();
      this.outlines.delete(id);
    }

    // Hide ports on the deselected element
    const el = this.registry.getElement(id);
    if (el) {
      const ports = el.container.children.find((c) => c.label === "ports");
      if (ports) ports.visible = false;
    }

    if (wasSingle) {
      this.destroyHandles();
    }

    // If now single, add handles + ports for the remaining element
    if (this.selectedIds.size === 1) {
      const remainingId = this.selectedIds.values().next().value;
      const remainingEl = remainingId ? this.registry.getElement(remainingId) : undefined;
      if (remainingEl) {
        this.createHandles(remainingEl.x, remainingEl.y, remainingEl.width, remainingEl.height);
        const ports = remainingEl.container.children.find((c) => c.label === "ports");
        if (ports) ports.visible = true;
      }
    }
  }

  private clearElements(): void {
    if (this.selectedIds.size === 0) return;
    this.hidePortsForAll();
    this.destroyHandles();
    for (const outline of this.outlines.values()) outline.destroy();
    this.outlines.clear();
    this.selectedIds.clear();
  }

  private clearEdge(): void {
    if (!this.selectedEdgeId) return;
    const edge = this.registry.getEdge(this.selectedEdgeId);
    if (edge) {
      edge.selected = false;
      // Mark the line dirty so the next redraw flush restores non-selected style
      edge._posCache = undefined;
    }
    this.selectedEdgeId = null;
  }

  private hidePortsForAll(): void {
    for (const id of this.selectedIds) {
      const el = this.registry.getElement(id);
      if (el) {
        const ports = el.container.children.find((c) => c.label === "ports");
        if (ports) ports.visible = false;
      }
    }
  }

  // --- Outline ---

  private createOutline(id: string): void {
    const outline = new Graphics() as Redrawable;
    outline.__redraw = () => {
      const el = this.registry.getElement(id);
      if (!el) return;
      const s = this.getScale();
      outline.clear();
      outline.rect(el.x, el.y, el.width, el.height);
      outline.stroke({ color: OUTLINE_COLOR, width: OUTLINE_WIDTH / s });
    };
    outline.__redraw();
    this.selectionLayer.addChild(outline);
    this.outlines.set(id, outline);
  }

  // --- Handles (single selection only) ---

  private createHandles(
    x: number, y: number, w: number, h: number,
  ): void {
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

  private destroyHandles(): void {
    for (const h of this.handles) h.destroy();
    this.handles = [];
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
