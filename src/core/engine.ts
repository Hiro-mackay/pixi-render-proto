import { Container } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import type {
  CanvasEdge,
  CanvasElement,
  EdgeOptions,
  EngineOptions,
  GroupMeta,
  GroupOptions,
  NodeMeta,
  NodeOptions,
  Redrawable,
} from "./types";
import { initViewport, type ViewportContext } from "./viewport/viewport-setup";
import { ElementRegistry, syncToContainer, type ReadonlyElementRegistry } from "./registry/element-registry";
import { RedrawManager } from "./viewport/redraw-manager";
import { CommandHistory } from "./commands/command";
import { MoveCommand } from "./commands/move-command";
import { ResizeCommand } from "./commands/resize-command";
import { createNodeGraphics } from "./elements/node-renderer";
import { createGroupGraphics } from "./elements/group-renderer";
import { createEdgeGraphics, updateEdgeGraphics, removeEdgeGraphics } from "./elements/edge-renderer";
import { createPortGraphics } from "./elements/port-renderer";
import { SelectionState } from "./interaction/selection-state";
import { enableItemDrag } from "./interaction/drag-handler";
import { enableResizeHandles } from "./interaction/resize-handles";
import { KeyboardManager } from "./interaction/keyboard-manager";
import { assignToGroup, removeFromGroup, updateVisibility } from "./hierarchy/group-ops";

export interface CanvasEngine {
  readonly viewport: Viewport;
  readonly scale: number;
  readonly registry: ReadonlyElementRegistry;
  destroy(): void;

  addNode(id: string, opts: NodeOptions): void;
  addGroup(id: string, opts: GroupOptions): void;
  addEdge(id: string, opts: EdgeOptions): void;
  removeElement(id: string): void;
  removeEdge(id: string): void;

  moveElement(id: string, x: number, y: number): void;
  resizeElement(id: string, width: number, height: number): void;
  assignToGroup(childId: string, groupId: string): void;
  removeFromGroup(childId: string): void;
  toggleCollapse(groupId: string): void;

  select(ids: readonly string[]): void;
  clearSelection(): void;
  getSelection(): readonly string[];

  undo(): void;
  redo(): void;
}

const DEFAULT_NODE_COLOR = 0x2d3748;

class CanvasEngineImpl implements CanvasEngine {
  private ctx: ViewportContext | null;
  private destroyed = false;
  readonly registry = new ElementRegistry();
  private readonly redraw = new RedrawManager();
  private readonly history = new CommandHistory();
  private readonly edgeLineLayer = new Container();
  private readonly edgeLabelLayer = new Container();
  private readonly selectionLayer = new Container();
  private selection!: SelectionState;
  private keyboard!: KeyboardManager;
  private readonly dragCleanups: Array<() => void> = [];
  private resizeCleanup: (() => void) | null = null;

  constructor(ctx: ViewportContext) {
    this.ctx = ctx;
    this.edgeLineLayer.label = "edge-line-layer";
    this.edgeLabelLayer.label = "edge-label-layer";
    this.selectionLayer.label = "selection-layer";
    ctx.viewport.addChild(this.edgeLineLayer);

    ctx.onZoom(() => {
      this.redraw.markAllDirty();
      this.redraw.flush();
    });

    this.selection = new SelectionState(
      this.selectionLayer, this.registry, this.getScale,
    );
    ctx.viewport.addChild(this.selectionLayer);

    this.selection.onHandlesCreated = (handles) => {
      this.resizeCleanup?.();
      this.resizeCleanup = enableResizeHandles(
        handles, this.selection, ctx.viewport,
        this.registry, this.history, this.getScale, syncToContainer,
      );
    };

    this.keyboard = new KeyboardManager(
      () => this.deleteSelected(),
      () => this.clearSelection(),
      () => this.undo(),
      () => this.redo(),
    );

    // Deselect on empty click
    let downPos = { x: 0, y: 0 };
    ctx.viewport.on("pointerdown", (e) => {
      downPos = { x: e.globalX, y: e.globalY };
    });
    ctx.viewport.on("pointerup", (e) => {
      const dist = Math.hypot(e.globalX - downPos.x, e.globalY - downPos.y);
      if (dist < 5) this.clearSelection();
    });
  }

  private getCtx(): ViewportContext {
    if (this.destroyed || !this.ctx) {
      throw new Error("CanvasEngine has been destroyed");
    }
    return this.ctx;
  }

  get viewport(): Viewport { return this.getCtx().viewport; }
  get scale(): number { return this.ctx?.getScale() ?? 1; }
  private getScale = (): number => this.scale;

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const fn of this.dragCleanups) fn();
    this.resizeCleanup?.();
    this.keyboard.destroy();
    this.selection.destroy();
    this.redraw.clear();
    this.ctx?.destroy();
    this.ctx = null;
  }

  // --- CRUD ---

  addNode(id: string, opts: NodeOptions): void {
    const meta: NodeMeta = { label: opts.label, color: opts.color ?? DEFAULT_NODE_COLOR, icon: opts.icon };
    const container = createNodeGraphics(
      { id, meta, x: opts.x, y: opts.y, width: opts.width, height: opts.height }, this.getScale,
    );
    const element: CanvasElement = {
      id, type: "node", x: opts.x, y: opts.y, width: opts.width, height: opts.height,
      visible: true, parentGroupId: null, container, meta,
    };
    createPortGraphics(element, this.getScale);
    this.registry.addElement(id, element);
    this.getCtx().viewport.addChild(container);
    this.registerRedrawables(container);
    this.dragCleanups.push(
      enableItemDrag(element, this.getCtx().viewport, this.registry, this.history,
        this.selection, this.getScale, syncToContainer),
    );
  }

  addGroup(id: string, opts: GroupOptions): void {
    const meta: GroupMeta = { label: opts.label, color: opts.color, collapsed: false, expandedHeight: opts.height };
    const container = createGroupGraphics(
      { id, meta, x: opts.x, y: opts.y, width: opts.width, height: opts.height }, this.getScale,
    );
    const element: CanvasElement = {
      id, type: "group", x: opts.x, y: opts.y, width: opts.width, height: opts.height,
      visible: true, parentGroupId: null, container, meta,
    };
    this.registry.addElement(id, element);
    this.getCtx().viewport.addChild(container);
    this.registerRedrawables(container);
    this.dragCleanups.push(
      enableItemDrag(element, this.getCtx().viewport, this.registry, this.history,
        this.selection, this.getScale, syncToContainer),
    );
  }

  addEdge(id: string, opts: EdgeOptions): void {
    this.registry.getElementOrThrow(opts.sourceId);
    this.registry.getElementOrThrow(opts.targetId);
    this.getCtx().viewport.addChild(this.edgeLabelLayer);

    const gfx = createEdgeGraphics(opts.label, this.edgeLineLayer, this.edgeLabelLayer);
    const edge: CanvasEdge = {
      id, sourceId: opts.sourceId, sourceSide: opts.sourceSide,
      targetId: opts.targetId, targetSide: opts.targetSide,
      label: opts.label ?? null, line: gfx.line, hitLine: gfx.hitLine,
      labelPill: gfx.labelPill, labelText: gfx.labelText, selected: false,
    };

    try { this.registry.addEdge(id, edge); }
    catch (err) { removeEdgeGraphics(edge); throw err; }

    updateEdgeGraphics(edge, this.registry, this.getScale);
    gfx.line.__redraw = () => updateEdgeGraphics(edge, this.registry, this.getScale);
    this.redraw.register(gfx.line);
    if (gfx.labelPill) this.redraw.register(gfx.labelPill);

    // Re-add selection layer on top
    this.getCtx().viewport.addChild(this.selectionLayer);
  }

  removeElement(id: string): void {
    const element = this.registry.getElementOrThrow(id);
    for (const edge of this.registry.getEdgesForNode(id)) this.removeEdge(edge.id);
    this.unregisterRedrawables(element.container);
    element.container.removeFromParent();
    element.container.destroy({ children: true });
    this.registry.removeElement(id);
  }

  removeEdge(id: string): void {
    const edge = this.registry.getEdge(id);
    if (!edge) return;
    this.redraw.unregister(edge.line);
    const pill = edge.labelPill;
    if (pill) this.redraw.unregister(pill);
    removeEdgeGraphics(edge);
    this.registry.removeEdge(id);
  }

  // --- Mutations (Command-based) ---

  moveElement(id: string, x: number, y: number): void {
    const el = this.registry.getElementOrThrow(id);
    this.history.execute(new MoveCommand(el, x, y, syncToContainer, crypto.randomUUID()));
    this.updateEdgesForElement(id);
  }

  resizeElement(id: string, width: number, height: number): void {
    const el = this.registry.getElementOrThrow(id);
    this.history.execute(new ResizeCommand(el, el.x, el.y, width, height, syncToContainer, crypto.randomUUID()));
    if (el.type === "group" && !(el.meta as GroupMeta).collapsed) {
      (el.meta as GroupMeta).expandedHeight = height;
    }
    this.updateEdgesForElement(id);
  }

  assignToGroup(childId: string, groupId: string): void {
    assignToGroup(childId, groupId, this.registry);
  }

  removeFromGroup(childId: string): void {
    removeFromGroup(childId, this.registry);
  }

  toggleCollapse(groupId: string): void {
    const group = this.registry.getElementOrThrow(groupId);
    const meta = group.meta as GroupMeta;
    meta.collapsed = !meta.collapsed;

    if (meta.collapsed) {
      meta.expandedHeight = group.height;
      group.height = 28;
    } else {
      group.height = meta.expandedHeight;
    }
    syncToContainer(group);
    updateVisibility(groupId, this.registry);

    // Update all edges since visibility changed
    for (const [, edge] of this.registry.getAllEdges()) {
      updateEdgeGraphics(edge, this.registry, this.getScale);
    }
    this.redraw.markAllDirty();
    this.redraw.flush();
  }

  // --- Selection ---

  select(ids: readonly string[]): void {
    if (ids.length > 0) this.selection.select(ids[0]!);
  }

  clearSelection(): void { this.selection.clear(); }

  getSelection(): readonly string[] {
    const id = this.selection.getSelectedId();
    return id ? [id] : [];
  }

  // --- Undo/Redo ---

  undo(): void {
    this.history.undo();
    this.selection.update();
    this.redraw.markAllDirty();
    this.redraw.flush();
  }

  redo(): void {
    this.history.redo();
    this.selection.update();
    this.redraw.markAllDirty();
    this.redraw.flush();
  }

  // --- Private ---

  private deleteSelected(): void {
    const id = this.selection.getSelectedId();
    if (!id) return;
    this.clearSelection();
    this.removeElement(id);
  }

  private updateEdgesForElement(id: string): void {
    for (const edge of this.registry.getEdgesForNode(id)) {
      updateEdgeGraphics(edge, this.registry, this.getScale);
    }
  }

  private registerRedrawables(container: Container): void {
    const walk = (c: Container) => {
      const r = c as Redrawable;
      if (typeof r.__redraw === "function") this.redraw.register(r);
      for (const child of c.children) {
        if (child instanceof Container) walk(child);
      }
    };
    walk(container);
  }

  private unregisterRedrawables(container: Container): void {
    const walk = (c: Container) => {
      const r = c as Redrawable;
      if (typeof r.__redraw === "function") this.redraw.unregister(r);
      for (const child of c.children) {
        if (child instanceof Container) walk(child);
      }
    };
    walk(container);
  }
}

export async function createCanvasEngine(
  container: HTMLElement,
  options: EngineOptions = {},
): Promise<CanvasEngine> {
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const ctx = await initViewport(container, options);
  if (options.signal?.aborted) { ctx.destroy(); throw new DOMException("Aborted", "AbortError"); }
  return new CanvasEngineImpl(ctx);
}
