import type { Graphics, Container } from "pixi.js";
import type { CanvasElement, Redrawable } from "../types";
import type { ReadonlyElementRegistry } from "../registry/element-registry";
import {
  createOutlineGraphic,
  createSelectionHandles,
  positionSelectionHandles,
} from "./selection-renderer";

function showPorts(el: CanvasElement): void {
  el.initPorts?.();
  const ports = el.container.children.find((c) => c.label === "ports");
  if (ports) ports.visible = true;
}

function hidePorts(el: CanvasElement): void {
  const ports = el.container.children.find((c) => c.label === "ports");
  if (ports) ports.visible = false;
}

export class SelectionState {
  private readonly selectedIds = new Set<string>();
  private selectedEdgeId: string | null = null;
  private readonly outlines = new Map<string, Redrawable>();
  private handles: Graphics[] = [];
  private resizing = false;
  private onSelectionChange?: (selectedIds: readonly string[]) => void;
  private _onEdgeUpdate?: () => void;

  getHandles(): readonly Graphics[] {
    return this.handles;
  }

  constructor(
    private readonly selectionLayer: Container,
    private readonly registry: ReadonlyElementRegistry,
    private readonly getScale: () => number,
    private readonly onHandlesCreated?: (handles: Graphics[]) => void,
  ) {}

  setOnSelectionChange(cb: (selectedIds: readonly string[]) => void): void {
    this.onSelectionChange = cb;
  }

  setOnEdgeUpdate(cb: (() => void) | undefined): void {
    this._onEdgeUpdate = cb;
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
      this.outlines.set(id, createOutlineGraphic(id, this.registry, this.getScale, this.selectionLayer));
    }
    if (this.selectedIds.size === 1) {
      const id = this.selectedIds.values().next().value ?? null;
      if (!id) return;
      const el = this.registry.getElement(id);
      if (!el) return;
      this.handles = createSelectionHandles(el.x, el.y, el.width, el.height, this.getScale, this.selectionLayer);
      this.onHandlesCreated?.(this.handles);
      showPorts(el);
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

  // --- Resize state ---

  isResizing(): boolean { return this.resizing; }
  setResizing(v: boolean): void { this.resizing = v; }

  // --- Update (reposition outlines + handles after command) ---

  update(): void {
    for (const [id, outline] of this.outlines) {
      if (!this.registry.getElement(id)) {
        outline.destroy();
        this.outlines.delete(id);
        this.selectedIds.delete(id);
        continue;
      }
      outline.__redraw?.();
    }

    if (this.handles.length > 0 && this.selectedIds.size === 1) {
      const id = this.selectedIds.values().next().value ?? null;
      const el = id ? this.registry.getElement(id) : undefined;
      if (el) {
        positionSelectionHandles(this.handles, el.x, el.y, el.width, el.height, this.getScale());
      }
    }

    if (this.selectedEdgeId) {
      this._onEdgeUpdate?.();
    }
  }

  destroy(): void {
    this.clear();
  }

  // --- Private ---

  private addToSelection(id: string): void {
    const el = this.registry.getElement(id);
    if (!el) return;

    if (this.selectedIds.size > 0) {
      this.destroyHandles();
    }

    this.selectedIds.add(id);
    this.outlines.set(id, createOutlineGraphic(id, this.registry, this.getScale, this.selectionLayer));

    if (this.selectedIds.size === 1) {
      this.handles = createSelectionHandles(el.x, el.y, el.width, el.height, this.getScale, this.selectionLayer);
      this.onHandlesCreated?.(this.handles);
      showPorts(el);
    }
  }

  private removeFromSelection(id: string): void {
    this.selectedIds.delete(id);
    const outline = this.outlines.get(id);
    if (outline) { outline.destroy(); this.outlines.delete(id); }
    this.destroyHandles();

    const removedEl = this.registry.getElement(id);
    if (removedEl) hidePorts(removedEl);

    if (this.selectedIds.size === 1) {
      const remainingId = this.selectedIds.values().next().value ?? null;
      const remainingEl = remainingId ? this.registry.getElement(remainingId) : undefined;
      if (remainingEl) {
        this.handles = createSelectionHandles(remainingEl.x, remainingEl.y, remainingEl.width, remainingEl.height, this.getScale, this.selectionLayer);
        this.onHandlesCreated?.(this.handles);
        showPorts(remainingEl);
      }
    }
  }

  private clearEdge(): void {
    if (!this.selectedEdgeId) return;
    const edge = this.registry.getEdge(this.selectedEdgeId);
    if (edge) {
      edge.selected = false;
      edge._posCache = undefined;
    }
    this.selectedEdgeId = null;
  }

  private clearElements(): void {
    if (this.selectedIds.size === 0) return;
    this.hidePortsForAll();
    this.destroyHandles();
    for (const outline of this.outlines.values()) outline.destroy();
    this.outlines.clear();
    this.selectedIds.clear();
  }

  private hidePortsForAll(): void {
    for (const id of this.selectedIds) {
      const el = this.registry.getElement(id);
      if (el) hidePorts(el);
    }
  }

  private destroyHandles(): void {
    for (const h of this.handles) h.destroy();
    this.handles = [];
  }
}
