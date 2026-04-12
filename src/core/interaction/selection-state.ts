import { Container, Graphics } from "pixi.js";
import type { Redrawable } from "../types";
import type { ReadonlyElementRegistry } from "../registry/element-registry";

const OUTLINE_COLOR = 0x3b82f6;
const OUTLINE_WIDTH = 2;
const HANDLE_SIZE = 8;
const HANDLE_CURSORS = [
  "nwse-resize",
  "nesw-resize",
  "nesw-resize",
  "nwse-resize",
] as const;

export class SelectionState {
  private selectedId: string | null = null;
  private outline: Redrawable | null = null;
  private handles: Graphics[] = [];
  private resizing = false;
  onHandlesCreated: ((handles: Graphics[]) => void) | null = null;

  getHandles(): Graphics[] {
    return this.handles;
  }

  constructor(
    private readonly selectionLayer: Container,
    private readonly registry: ReadonlyElementRegistry,
    private readonly getScale: () => number,
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
    const corners: readonly [number, number][] = [
      [x, y], [x + w, y], [x, y + h], [x + w, y + h],
    ];
    for (const [idx, [cx, cy]] of corners.entries()) {
      const handle = new Graphics();
      handle.eventMode = "static";
      handle.cursor = HANDLE_CURSORS[idx];
      this.drawHandle(handle, cx, cy);
      this.selectionLayer.addChild(handle);
      this.handles.push(handle);
    }
    this.onHandlesCreated?.(this.handles);
  }

  private positionHandles(
    x: number, y: number, w: number, h: number,
  ): void {
    const corners: readonly [number, number][] = [
      [x, y], [x + w, y], [x, y + h], [x + w, y + h],
    ];
    for (const [idx, [cx, cy]] of corners.entries()) {
      const handle = this.handles[idx];
      if (handle) this.drawHandle(handle, cx, cy);
    }
  }

  private drawHandle(g: Graphics, cx: number, cy: number): void {
    const s = this.getScale();
    const half = HANDLE_SIZE / (2 * s);
    g.clear();
    g.rect(cx - half, cy - half, half * 2, half * 2);
    g.fill({ color: 0xffffff });
    g.stroke({ color: OUTLINE_COLOR, width: 1 / s });
  }
}
