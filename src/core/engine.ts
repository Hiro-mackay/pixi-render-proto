import { Container, type FederatedPointerEvent } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import type {
  CanvasEdge,
  EdgeOptions,
  EngineOptions,
  GroupMeta,
  GroupElement,
  GroupOptions,
  NodeMeta,
  NodeElement,
  NodeOptions,
} from "./types";
import { COLLAPSED_HEIGHT } from "./types";
import { initViewport, type ViewportContext } from "./viewport/viewport-setup";
import { ElementRegistry, type ReadonlyElementRegistry } from "./registry/element-registry";
import { syncToContainer, syncElement } from "./registry/sync";
import { RedrawManager } from "./viewport/redraw-manager";
import { CommandHistory } from "./commands/command";
import { MoveCommand } from "./commands/move-command";
import { ResizeCommand } from "./commands/resize-command";
import { createNodeGraphics } from "./elements/node-renderer";
import { createGroupGraphics, preloadChevronTextures } from "./elements/group-renderer";
import { createEdgeGraphics, updateEdgeGraphics, removeEdgeGraphics } from "./elements/edge-renderer";
import { createPortGraphics } from "./elements/port-renderer";
import { SelectionState } from "./interaction/selection-state";
import { enableItemDrag } from "./interaction/drag-handler";
import { enableResizeHandles } from "./interaction/resize-handles";
import { KeyboardManager } from "./interaction/keyboard-manager";
import { applyParentChange, updateVisibility } from "./hierarchy/group-ops";
import { AssignCommand } from "./commands/assign-command";
import { DeleteCommand } from "./commands/delete-command";

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
  // Exposed as ReadonlyElementRegistry via CanvasEngine interface
  readonly registry = new ElementRegistry();
  private readonly redraw = new RedrawManager();
  private readonly history = new CommandHistory();
  private readonly edgeLineLayer = new Container();
  private readonly edgeLabelLayer = new Container();
  private readonly selectionLayer = new Container();
  private selection!: SelectionState;
  private keyboard!: KeyboardManager;
  private readonly dragCleanups = new Map<string, () => void>();
  private resizeCleanup: (() => void) | null = null;
  private downPos = { x: 0, y: 0 };
  private downOnViewport = false;
  private handleViewportPointerDown!: (e: FederatedPointerEvent) => void;
  private handleViewportPointerUp!: (e: FederatedPointerEvent) => void;

  constructor(ctx: ViewportContext) {
    this.ctx = ctx;
    this.edgeLineLayer.label = "edge-line-layer";
    this.edgeLabelLayer.label = "edge-label-layer";
    this.selectionLayer.label = "selection-layer";
    ctx.viewport.addChild(this.edgeLineLayer);
    ctx.viewport.addChild(this.edgeLabelLayer);

    ctx.onZoom((scale) => {
      this.redraw.updateTextResolutions(scale);
      this.redraw.markAllDirty();
      this.redraw.flush();
    });

    ctx.onPan(() => {
      this.redraw.markAllDirty();
      this.redraw.flush();
    });

    this.selection = new SelectionState(
      this.selectionLayer, this.registry, this.getScale,
      (handles) => {
        this.resizeCleanup?.();
        this.resizeCleanup = enableResizeHandles(
          handles, this.selection, ctx.viewport,
          this.registry, this.history, this.getScale, syncElement,
        );
      },
    );
    ctx.viewport.addChild(this.selectionLayer);

    this.keyboard = new KeyboardManager(
      () => this.deleteSelected(),
      () => this.clearSelection(),
      () => this.undo(),
      () => this.redo(),
    );

    // Deselect on empty click (only when clicking directly on the viewport background)
    this.handleViewportPointerDown = (e) => {
      this.downOnViewport = e.target === ctx.viewport;
      this.downPos = { x: e.globalX, y: e.globalY };
    };
    this.handleViewportPointerUp = (e) => {
      if (!this.downOnViewport) return;
      const dist = Math.hypot(e.globalX - this.downPos.x, e.globalY - this.downPos.y);
      if (dist < 5) this.clearSelection();
    };
    ctx.viewport.on("pointerdown", this.handleViewportPointerDown);
    ctx.viewport.on("pointerup", this.handleViewportPointerUp);
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
  private onDragStateChange = (dragging: boolean): void => {
    this.keyboard.enabled = !dragging;
  };

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ctx?.viewport.off("pointerdown", this.handleViewportPointerDown);
    this.ctx?.viewport.off("pointerup", this.handleViewportPointerUp);
    for (const fn of this.dragCleanups.values()) fn();
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
    // Container is set to placeholder and immediately replaced by createNodeGraphics.
    // Element is not registered until container is assigned, so the gap is safe.
    const element = {
      id, type: "node" as const, x: opts.x, y: opts.y, width: opts.width, height: opts.height,
      visible: true, parentGroupId: null, container: new Container(), meta,
    } satisfies NodeElement;
    element.container = createNodeGraphics(element, this.getScale);
    createPortGraphics(element, this.getScale);
    this.registry.addElement(id, element);
    this.getCtx().viewport.addChild(element.container);
    this.redraw.registerTree(element.container);
    this.dragCleanups.set(id,
      enableItemDrag(element, this.getCtx().viewport, this.registry, this.history,
        this.selection, this.getScale, syncToContainer, this.onDragStateChange),
    );
  }

  addGroup(id: string, opts: GroupOptions): void {
    const meta: GroupMeta = { label: opts.label, color: opts.color, collapsed: false, expandedHeight: opts.height };
    const element = {
      id, type: "group" as const, x: opts.x, y: opts.y, width: opts.width, height: opts.height,
      visible: true, parentGroupId: null, container: new Container(), meta,
    } satisfies GroupElement;
    element.container = createGroupGraphics(element, this.getScale);
    this.registry.addElement(id, element);
    this.getCtx().viewport.addChild(element.container);
    this.redraw.registerTree(element.container);

    const toggleBtn = element.container.children.find((c) => c.label === "group-toggle");
    if (toggleBtn) {
      toggleBtn.on("pointerdown", (e) => {
        e.stopPropagation();
        this.toggleCollapse(id);
      });
    }

    this.dragCleanups.set(id,
      enableItemDrag(element, this.getCtx().viewport, this.registry, this.history,
        this.selection, this.getScale, syncToContainer, this.onDragStateChange),
    );
  }

  addEdge(id: string, opts: EdgeOptions): void {
    this.registry.getElementOrThrow(opts.sourceId);
    this.registry.getElementOrThrow(opts.targetId);

    const gfx = createEdgeGraphics(opts.label, this.edgeLineLayer, this.edgeLabelLayer);
    const edge: CanvasEdge = {
      id, sourceId: opts.sourceId, sourceSide: opts.sourceSide,
      targetId: opts.targetId, targetSide: opts.targetSide,
      label: opts.label ?? null, labelColor: opts.labelColor ?? null,
      line: gfx.line, hitLine: gfx.hitLine,
      labelPill: gfx.labelPill, labelText: gfx.labelText, selected: false,
    };

    try { this.registry.addEdge(id, edge); }
    catch (err) { removeEdgeGraphics(edge); throw err; }

    updateEdgeGraphics(edge, this.registry, this.getScale);
    gfx.line.__redraw = () => updateEdgeGraphics(edge, this.registry, this.getScale);
    this.redraw.register(gfx.line);
    if (gfx.labelPill) this.redraw.register(gfx.labelPill);

    // Ensure selection layer stays on top
    const vp = this.getCtx().viewport;
    vp.setChildIndex(this.selectionLayer, vp.children.length - 1);
  }

  removeElement(id: string): void {
    const element = this.registry.getElementOrThrow(id);
    this.dragCleanups.get(id)?.();
    this.dragCleanups.delete(id);

    // Detach children before removing a group to prevent orphaned parentGroupId refs
    if (element.type === "group") {
      for (const child of [...this.registry.getChildrenOf(id)]) {
        applyParentChange(child.id, element.parentGroupId, this.registry, syncElement);
      }
    }

    for (const edge of this.registry.getEdgesForNode(id)) this.removeEdge(edge.id);
    this.redraw.unregisterTree(element.container);
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
    this.history.execute(new MoveCommand(id, this.registry, x, y, syncToContainer, crypto.randomUUID()));
    this.afterCommand();
  }

  resizeElement(id: string, width: number, height: number): void {
    const el = this.registry.getElementOrThrow(id);
    this.history.execute(new ResizeCommand({
      elementId: id, registry: this.registry,
      target: { x: el.x, y: el.y, width, height },
      sync: syncElement, sessionId: crypto.randomUUID(),
    }));
    this.afterCommand();
  }

  assignToGroup(childId: string, groupId: string): void {
    this.history.execute(new AssignCommand(childId, groupId, this.registry, syncElement));
    this.afterCommand();
  }

  removeFromGroup(childId: string): void {
    this.history.execute(new AssignCommand(childId, null, this.registry, syncElement));
    this.afterCommand();
  }

  toggleCollapse(groupId: string): void {
    const group = this.registry.getElementOrThrow(groupId);
    if (group.type !== "group") throw new Error(`Element "${groupId}" is not a group`);
    const meta = group.meta;
    if (meta.collapsed) {
      meta.collapsed = false;
      group.height = meta.expandedHeight;
    } else {
      meta.expandedHeight = group.height;
      meta.collapsed = true;
      group.height = COLLAPSED_HEIGHT;
    }
    syncElement(group);
    updateVisibility(groupId, this.registry, syncElement);
    this.selection.update();
    this.redraw.markAllDirty();
    this.redraw.flush();
  }

  // --- Selection ---

  select(ids: readonly string[]): void {
    if (ids.length > 1) {
      throw new Error("Multi-select is not yet supported (Phase 4). Pass a single id.");
    }
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
    this.afterCommand();
  }

  redo(): void {
    this.history.redo();
    this.afterCommand();
  }

  // --- Private ---

  private deleteSelected(): void {
    const id = this.selection.getSelectedId();
    if (!id) return;
    this.clearSelection();
    this.history.execute(new DeleteCommand(
      id, this.registry, syncElement, {
        doRemove: (eid) => this.removeElement(eid),
        doAddNode: (eid, opts) => this.addNode(eid, opts),
        doAddGroup: (eid, opts) => this.addGroup(eid, opts),
        doAddEdge: (eid, opts) => this.addEdge(eid, opts),
        onRestore: (eid) => this.selection.select(eid),
      },
    ));
    this.afterCommand();
  }

  private afterCommand(): void {
    this.selection.update();
    this.redraw.markAllDirty();
    this.redraw.flush();
  }

}

export async function createCanvasEngine(
  container: HTMLElement,
  options: EngineOptions = {},
): Promise<CanvasEngine> {
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const ctx = await initViewport(container, options);
  if (options.signal?.aborted) { ctx.destroy(); throw new DOMException("Aborted", "AbortError"); }
  await preloadChevronTextures();
  if (options.signal?.aborted) { ctx.destroy(); throw new DOMException("Aborted", "AbortError"); }
  return new CanvasEngineImpl(ctx);
}
