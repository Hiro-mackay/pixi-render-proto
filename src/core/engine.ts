import { Container, type FederatedPointerEvent, Graphics } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import { CanvasClipboard } from "./clipboard/clipboard";
import {
  AddEdgeCommand,
  type AddRemoveOps,
  RemoveEdgeCommand,
} from "./commands/add-remove-command";
import { AssignCommand } from "./commands/assign-command";
import { CollapseCommand } from "./commands/collapse-command";
import { CommandHistory } from "./commands/command";
import { DeleteCommand, type DeleteCommandOps } from "./commands/delete-command";
import { ReconnectEdgeCommand } from "./commands/edge-command";
import { MoveCommand } from "./commands/move-command";
import { ResizeCommand } from "./commands/resize-command";
import { ToggleNodeEdgeLockCommand } from "./commands/toggle-lock-command";
import {
  createEdgeGraphics,
  removeEdgeGraphics,
  updateEdgeGraphics,
} from "./elements/edge-renderer";
import { createGroupGraphics, preloadChevronTextures } from "./elements/group-renderer";
import { createNodeGraphics } from "./elements/node-renderer";
import { createPortGraphics } from "./elements/port-renderer";
import { DestroyedEngineError, InvalidArgumentError } from "./errors";
import {
  CanvasEventEmitter,
  type CanvasEventMap,
  type CanvasEventName,
} from "./events/event-emitter";
import { resolveVisibleElement } from "./geometry/hit-test";
import { applyParentChange } from "./hierarchy/group-ops";
import { enableItemDrag } from "./interaction/drag-handler";
import { EdgeCreator } from "./interaction/edge-creator";
import {
  createReconnectHandles,
  type ReconnectHandleControls,
  type ReconnectResult,
} from "./interaction/edge-reconnect";
import { KeyboardManager } from "./interaction/keyboard-manager";
import { enableMarqueeSelect } from "./interaction/multi-select";
import { enablePortDrag } from "./interaction/port-drag";
import { enableResizeHandles } from "./interaction/resize-handles";
import { SelectionState } from "./interaction/selection-state";
import { ElementRegistry, type ReadonlyElementRegistry } from "./registry/element-registry";
import { syncElement, syncToContainer } from "./registry/sync";
import { deserializeScene } from "./serialization/deserialize";
import type { SceneData } from "./serialization/schema";
import { serialize as serializeScene } from "./serialization/serialize";
import {
  ACCENT_COLOR,
  type CanvasEdge,
  type EdgeOptions,
  type EngineOptions,
  type GroupElement,
  type GroupMeta,
  type GroupOptions,
  type NodeElement,
  type NodeMeta,
  type NodeOptions,
} from "./types";
import { ViewportPauseController } from "./viewport/pause-controller";
import { RedrawManager } from "./viewport/redraw-manager";
import { centerViewportOn, fitViewportToContent, setViewportZoom } from "./viewport/view-control";
import { initViewport, type ViewportContext } from "./viewport/viewport-setup";

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
  selectAll(): void;
  clearSelection(): void;
  getSelection(): readonly string[];
  undo(): void;
  redo(): void;
  copy(): void;
  paste(): void;
  duplicate(): void;
  serialize(): SceneData;
  deserialize(data: SceneData): void;
  beginBulkLoad(): void;
  endBulkLoad(): void;
  setZoom(scale: number): void;
  centerOn(x: number, y: number): void;
  fitToContent(padding?: number): void;
  toDataURL(type?: "image/png" | "image/jpeg"): string;
  on<E extends CanvasEventName>(event: E, handler: (data: CanvasEventMap[E]) => void): () => void;
}

const DEFAULT_NODE_COLOR = 0x2d3748;

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value))
    throw new InvalidArgumentError(`${name} must be a finite number, got ${value}`);
}

function assertPositive(value: number, name: string): void {
  assertFinite(value, name);
  if (value <= 0) throw new InvalidArgumentError(`${name} must be positive, got ${value}`);
}

class CanvasEngineImpl implements CanvasEngine {
  private ctx: ViewportContext | null;
  private destroyed = false;
  readonly registry = new ElementRegistry();
  private readonly redraw = new RedrawManager();
  private readonly history = new CommandHistory(200, (cmd, direction) => {
    const domainEvents = cmd.getDomainEvents?.(direction);
    if (domainEvents) {
      for (const { event, data } of domainEvents) {
        this.events.emit(event, data);
      }
    }
  });
  private readonly events = new CanvasEventEmitter();
  private readonly edgeLineLayer = new Container();
  private readonly edgeLabelLayer = new Container();
  private readonly ghostLayer = new Container();
  private readonly selectionLayer = new Container();
  private selection!: SelectionState;
  private keyboard!: KeyboardManager;
  private edgeCreator!: EdgeCreator;
  private readonly dragCleanups = new Map<string, () => void>();
  private readonly portDragCleanups = new Map<string, () => void>();
  private reconnectHandles: ReconnectHandleControls | null = null;
  private resizeCleanup: (() => void) | null = null;
  private marqueeCleanup: (() => void) | null = null;
  private readonly hoverOutline = new Graphics();
  private hoveredId: string | null = null;
  private readonly clipboard = new CanvasClipboard();
  private readonly addRemoveOps: AddRemoveOps;
  private readonly elementOps: DeleteCommandOps;
  private readonly gridSize: number | undefined;
  private readonly pauseCtrl: ViewportPauseController;

  constructor(ctx: ViewportContext, options: EngineOptions) {
    this.ctx = ctx;
    this.gridSize = options.gridSize;
    this.pauseCtrl = new ViewportPauseController(ctx.viewport);
    this.edgeLineLayer.label = "edge-line-layer";
    this.edgeLabelLayer.label = "edge-label-layer";
    this.ghostLayer.label = "ghost-layer";
    this.selectionLayer.label = "selection-layer";
    this.hoverOutline.label = "hover-outline";
    this.hoverOutline.visible = false;
    ctx.viewport.addChild(this.edgeLineLayer);
    ctx.viewport.addChild(this.edgeLabelLayer);
    ctx.viewport.addChild(this.ghostLayer);

    ctx.onZoom((scale) => {
      this.redraw.updateTextResolutions(scale);
      this.cullToViewport();
      this.redraw.markAllDirty();
      this.redraw.flush();
    });
    ctx.onPan(() => {
      this.cullToViewport();
      this.redraw.flush();
    });

    this.selection = new SelectionState(
      this.selectionLayer,
      this.registry,
      this.getScale,
      (handles) => {
        this.resizeCleanup?.();
        this.resizeCleanup = enableResizeHandles({
          handles,
          selection: this.selection,
          viewport: ctx.viewport,
          registry: this.registry,
          history: this.history,
          getScale: this.getScale,
          sync: syncElement,
          gridSize: this.gridSize,
          pauseCtrl: this.pauseCtrl,
          onResizeEnd: this.emitResizedElement,
        });
      },
    );
    this.selection.setOnSelectionChange((selectedIds) => {
      this.events.emit("selection:change", { selectedIds });
      this.updateGroupDragHandles(new Set(selectedIds));
      // Clear hover when element becomes selected
      if (this.hoveredId && selectedIds.includes(this.hoveredId)) {
        this.clearHover();
      }
      // Tear down edge reconnect handles when selection switches away from an edge
      // (e.g. user pointerdowns on a node while an edge was selected).
      if (this.reconnectHandles && !this.selection.getSelectedEdgeId()) {
        this.reconnectHandles.destroy();
        this.reconnectHandles = null;
        this.selection.setOnEdgeUpdate(undefined);
      }
    });
    this.selectionLayer.addChild(this.hoverOutline);
    ctx.viewport.addChild(this.selectionLayer);

    this.addRemoveOps = {
      doAddEdge: (id, opts) => this.addEdge(id, opts),
      doRemoveEdge: (id) => this.removeEdge(id),
    };
    this.elementOps = {
      doAddNode: (id, opts) => this.addNode(id, opts),
      doAddGroup: (id, opts) => this.addGroup(id, opts),
      doAddEdge: (id, opts) => this.addEdge(id, opts),
      doRemove: (id) => this.removeElement(id),
    };

    this.keyboard = new KeyboardManager({
      onDelete: () => this.deleteSelected(),
      onEscape: () => this.handleEscape(),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onCopy: () => this.copy(),
      onPaste: () => this.paste(),
      onDuplicate: () => this.duplicate(),
      onSelectAll: () => this.selectAll(),
      onToggleEdgeLock: () => this.toggleEdgeLockOnSelection(),
    });

    this.edgeCreator = new EdgeCreator(
      this.ghostLayer,
      ctx.viewport,
      this.registry,
      this.getScale,
      (event) => {
        const edgeId = crypto.randomUUID();
        this.history.execute(
          new AddEdgeCommand(
            edgeId,
            {
              sourceId: event.sourceId,
              sourceSide: event.sourceSide,
              targetId: event.targetId,
              targetSide: event.targetSide,
            },
            this.addRemoveOps,
          ),
        );
        this.afterCommand();
      },
      this.pauseCtrl,
    );
    this.redraw.register(this.edgeCreator.getGhostLine());
    this.redraw.register(this.edgeCreator.getHighlightGraphic());

    this.marqueeCleanup = enableMarqueeSelect(
      ctx.viewport,
      this.registry,
      this.selection,
      this.getScale,
      () => this.clearSelection(),
      this.pauseCtrl,
    );
  }

  private getCtx(): ViewportContext {
    if (this.destroyed || !this.ctx)
      throw new DestroyedEngineError("CanvasEngine has been destroyed");
    return this.ctx;
  }

  get viewport(): Viewport {
    return this.getCtx().viewport;
  }
  get scale(): number {
    return this.getCtx().getScale();
  }
  private getScale = (): number => this.scale;
  private onDragStateChange = (dragging: boolean): void => {
    this.keyboard.enabled = !dragging;
    if (dragging) this.clearHover();
  };

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.marqueeCleanup?.();
    for (const fn of this.dragCleanups.values()) fn();
    for (const fn of this.portDragCleanups.values()) fn();
    this.reconnectHandles?.destroy();
    this.resizeCleanup?.();
    this.edgeCreator.destroy();
    this.keyboard.destroy();
    this.selection.destroy();
    this.redraw.clear();
    this.events.destroy();
    this.ctx?.destroy();
    this.ctx = null;
  }

  // --- CRUD ---

  addNode(id: string, opts: NodeOptions): void {
    assertFinite(opts.x, "x");
    assertFinite(opts.y, "y");
    assertPositive(opts.width, "width");
    assertPositive(opts.height, "height");
    const meta: NodeMeta = {
      label: opts.label,
      color: opts.color ?? DEFAULT_NODE_COLOR,
      icon: opts.icon,
    };
    const element: NodeElement = {
      id,
      type: "node" as const,
      x: opts.x,
      y: opts.y,
      width: opts.width,
      height: opts.height,
      visible: true as boolean,
      parentGroupId: null as string | null,
      container: new Container(),
      edgeSidesLocked: false,
      meta,
    };
    element.container = createNodeGraphics(element, this.getScale);
    this.registry.addElement(id, element);
    this.getCtx().viewport.addChild(element.container);
    this.redraw.registerTree(element.container);
    this.dragCleanups.set(
      id,
      enableItemDrag({
        element,
        viewport: this.getCtx().viewport,
        registry: this.registry,
        history: this.history,
        selection: this.selection,
        getScale: this.getScale,
        sync: syncToContainer,
        onDragStateChange: this.onDragStateChange,
        gridSize: this.gridSize,
        pauseCtrl: this.pauseCtrl,
        onDragEnd: this.emitMovedElements,
        ghostLayer: this.ghostLayer,
      }),
    );
    // Defer port creation until first hover or selection (saves 8 Graphics + event listeners per node).
    let portsCreated = false;
    let portDragCleanup: (() => void) | null = null;
    const initPorts = () => {
      if (portsCreated) return;
      portsCreated = true;
      createPortGraphics(element, this.getScale);
      const ports = element.container.children.find((c) => c.label === "ports");
      if (ports instanceof Container) this.redraw.registerTree(ports);
      portDragCleanup = enablePortDrag(
        element,
        this.getCtx().viewport,
        this.getScale,
        this.edgeCreator,
      );
    };
    element.initPorts = initPorts;
    const onEnter = () => {
      initPorts();
      this.showHover(id);
    };
    const onLeave = () => {
      if (this.hoveredId === id) this.clearHover();
    };
    element.container.on("pointerenter", onEnter);
    element.container.on("pointerleave", onLeave);
    this.portDragCleanups.set(id, () => {
      portDragCleanup?.();
      element.container.off("pointerenter", onEnter);
      element.container.off("pointerleave", onLeave);
    });
    this.events.emit("element:add", { id, type: "node" });
  }

  addGroup(id: string, opts: GroupOptions): void {
    assertFinite(opts.x, "x");
    assertFinite(opts.y, "y");
    assertPositive(opts.width, "width");
    assertPositive(opts.height, "height");
    const meta: GroupMeta = {
      label: opts.label,
      color: opts.color,
      collapsed: false,
      expandedHeight: opts.height,
    };
    const element = {
      id,
      type: "group" as const,
      x: opts.x,
      y: opts.y,
      width: opts.width,
      height: opts.height,
      visible: true,
      parentGroupId: null,
      container: new Container(),
      edgeSidesLocked: false,
      meta,
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
    // Hover on drag-handle (bg is eventMode="none" so edges behind it remain clickable)
    const dragHandle = element.container.children.find((c) => c.label === "group-drag-handle");
    if (dragHandle) {
      dragHandle.on("pointerenter", () => this.showHover(id));
      dragHandle.on("pointerleave", () => {
        if (this.hoveredId === id) this.clearHover();
      });
    }
    this.dragCleanups.set(
      id,
      enableItemDrag({
        element,
        viewport: this.getCtx().viewport,
        registry: this.registry,
        history: this.history,
        selection: this.selection,
        getScale: this.getScale,
        sync: syncToContainer,
        onDragStateChange: this.onDragStateChange,
        gridSize: this.gridSize,
        pauseCtrl: this.pauseCtrl,
        onDragEnd: this.emitMovedElements,
        ghostLayer: this.ghostLayer,
      }),
    );
    this.events.emit("element:add", { id, type: "group" });
  }

  addEdge(id: string, opts: EdgeOptions): void {
    this.registry.getElementOrThrow(opts.sourceId);
    this.registry.getElementOrThrow(opts.targetId);
    const gfx = createEdgeGraphics(opts.label, this.edgeLineLayer, this.edgeLabelLayer);
    const edge: CanvasEdge = {
      id,
      sourceId: opts.sourceId,
      sourceSide: opts.sourceSide,
      targetId: opts.targetId,
      targetSide: opts.targetSide,
      label: opts.label ?? null,
      labelColor: opts.labelColor ?? null,
      line: gfx.line,
      hitLine: gfx.hitLine,
      labelPill: gfx.labelPill,
      labelText: gfx.labelText,
      selected: false,
    };
    try {
      this.registry.addEdge(id, edge);
    } catch (err) {
      removeEdgeGraphics(edge);
      throw err;
    }
    updateEdgeGraphics(edge, this.registry, this.getScale);
    gfx.line.__redraw = () => updateEdgeGraphics(edge, this.registry, this.getScale);
    this.redraw.register(gfx.line);
    if (gfx.labelPill) this.redraw.register(gfx.labelPill);
    gfx.hitLine.on("pointerdown", (e: FederatedPointerEvent) => {
      e.stopPropagation();
      if (this.selection.getSelectedEdgeId() === id) {
        this.clearSelection();
      } else {
        this.selectEdge(id);
      }
    });
    gfx.hitLine.on("pointerenter", () => this.showHover(id));
    gfx.hitLine.on("pointerleave", () => {
      if (this.hoveredId === id) this.clearHover();
    });
    if (!this.bulkLoading) {
      const vp = this.getCtx().viewport;
      vp.setChildIndex(this.selectionLayer, vp.children.length - 1);
    }
    this.events.emit("edge:create", { id });
  }

  removeElement(id: string): void {
    const element = this.registry.getElementOrThrow(id);
    this.dragCleanups.get(id)?.();
    this.dragCleanups.delete(id);
    this.portDragCleanups.get(id)?.();
    this.portDragCleanups.delete(id);
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
    this.events.emit("element:remove", { id });
  }

  removeEdge(id: string): void {
    const edge = this.registry.getEdge(id);
    if (!edge) return;
    edge.hitLine.removeAllListeners();
    this.redraw.unregister(edge.line);
    if (edge.labelPill) this.redraw.unregister(edge.labelPill);
    removeEdgeGraphics(edge);
    this.registry.removeEdge(id);
    this.events.emit("edge:delete", { id });
  }

  // --- Mutations ---

  moveElement(id: string, x: number, y: number): void {
    assertFinite(x, "x");
    assertFinite(y, "y");
    this.history.execute(
      new MoveCommand(id, this.registry, x, y, syncToContainer, crypto.randomUUID()),
    );
    this.events.emit("element:move", { id, x, y });
    this.afterCommand([id]);
  }

  resizeElement(id: string, width: number, height: number): void {
    assertPositive(width, "width");
    assertPositive(height, "height");
    const el = this.registry.getElementOrThrow(id);
    this.history.execute(
      new ResizeCommand({
        elementId: id,
        registry: this.registry,
        target: { x: el.x, y: el.y, width, height },
        sync: syncElement,
        sessionId: crypto.randomUUID(),
      }),
    );
    this.events.emit("element:resize", { id, width, height });
    this.afterCommand([id]);
  }

  assignToGroup(childId: string, groupId: string): void {
    const child = this.registry.getElementOrThrow(childId);
    const oldGroupId = child.parentGroupId;
    this.history.execute(new AssignCommand(childId, groupId, this.registry, syncElement));
    this.events.emit("group:membership", { childId, oldGroupId, newGroupId: groupId });
    this.afterCommand([childId, groupId]);
  }

  removeFromGroup(childId: string): void {
    const child = this.registry.getElementOrThrow(childId);
    const oldGroupId = child.parentGroupId;
    this.history.execute(new AssignCommand(childId, null, this.registry, syncElement));
    this.events.emit("group:membership", { childId, oldGroupId, newGroupId: null });
    this.afterCommand([childId]);
  }

  toggleCollapse(groupId: string): void {
    this.history.execute(new CollapseCommand(groupId, this.registry, syncElement));
    const group = this.registry.getElement(groupId);
    if (group?.type === "group") {
      this.events.emit(group.meta.collapsed ? "group:collapse" : "group:expand", { id: groupId });
    }
    this.afterCommand();
  }

  // --- Selection ---

  select(ids: readonly string[]): void {
    this.reconnectHandles?.destroy();
    this.reconnectHandles = null;
    this.selection.setOnEdgeUpdate(undefined);
    const [first] = ids;
    if (!first) {
      this.selection.clear();
    } else if (ids.length === 1) {
      this.selection.select(first);
    } else {
      this.selection.selectMultiple(ids);
    }
  }

  selectAll(): void {
    this.select([...this.registry.getAllElements().keys()]);
  }

  clearSelection(): void {
    this.reconnectHandles?.destroy();
    this.reconnectHandles = null;
    this.selection.setOnEdgeUpdate(undefined);
    this.selection.clear();
  }

  getSelection(): readonly string[] {
    return [...this.selection.getSelectedIds()];
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

  // --- Clipboard ---

  copy(): void {
    this.clipboard.copy(this.copyTargetIds(), this.registry);
  }
  paste(): void {
    const ids = this.clipboard.paste(
      this.registry,
      this.history,
      this.elementOps,
      this.addRemoveOps,
    );
    if (ids.length > 0) {
      this.select(ids);
      this.afterCommand();
    }
  }
  duplicate(): void {
    const ids = this.clipboard.duplicate(
      this.copyTargetIds(),
      this.registry,
      this.history,
      this.elementOps,
      this.addRemoveOps,
    );
    if (ids.length > 0) {
      this.select(ids);
      this.afterCommand();
    }
  }

  // --- Serialization ---

  serialize(): SceneData {
    const { viewport: vp } = this.getCtx();
    return serializeScene(this.registry, { x: vp.center.x, y: vp.center.y, zoom: vp.scale.x });
  }

  deserialize(data: SceneData): void {
    this.clearSelection();
    this.events.suppress(() => {
      deserializeScene(data, { engine: this, registry: this.registry, history: this.history });
    });
    this.afterCommand();
  }

  private bulkLoading = false;

  beginBulkLoad(): void {
    this.bulkLoading = true;
    this.getCtx().app.ticker.stop();
  }

  endBulkLoad(): void {
    this.bulkLoading = false;
    // Ensure selection layer stays on top after bulk edge additions
    const vp = this.getCtx().viewport;
    vp.setChildIndex(this.selectionLayer, vp.children.length - 1);
    this.selection.update();
    // Cull off-screen elements before the first render frame to avoid
    // expensive GPU resource generation for all 1000+ nodes at once.
    this.cullToViewport();
    this.getCtx().app.ticker.start();
  }

  private cullToViewport(): void {
    const vp = this.getCtx().viewport;
    const margin = Math.max(vp.screenWidthInWorldPixels, vp.screenHeightInWorldPixels) * 0.2;
    const left = vp.left - margin;
    const right = vp.right + margin;
    const top = vp.top - margin;
    const bottom = vp.bottom + margin;

    for (const el of this.registry.getAllElements().values()) {
      // Don't override visibility managed by group collapse
      if (!el.visible) continue;
      const inView =
        el.x + el.width > left && el.x < right && el.y + el.height > top && el.y < bottom;
      if (el.container.visible !== inView) {
        el.container.visible = inView;
        if (inView) {
          this.redraw.markTreeDirty(el.container);
          for (const edge of this.registry.getEdgesForNode(el.id)) {
            this.redraw.markDirty(edge.line);
            if (edge.labelPill) this.redraw.markDirty(edge.labelPill);
          }
        }
      }
    }
  }

  // --- View control ---

  setZoom(scale: number): void {
    setViewportZoom(this.getCtx().viewport, scale);
  }
  centerOn(x: number, y: number): void {
    centerViewportOn(this.getCtx().viewport, x, y);
  }
  fitToContent(padding?: number): void {
    fitViewportToContent(this.getCtx().viewport, this.registry, padding);
  }

  toDataURL(type?: "image/png" | "image/jpeg"): string {
    const ctx = this.getCtx();
    const canvas = ctx.app.renderer.extract.canvas(ctx.app.stage);
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new InvalidArgumentError(
        "toDataURL requires an HTMLCanvasElement (not available in OffscreenCanvas environments)",
      );
    }
    return canvas.toDataURL(type ?? "image/png");
  }

  // --- Events ---

  on<E extends CanvasEventName>(event: E, handler: (data: CanvasEventMap[E]) => void): () => void {
    return this.events.on(event, handler);
  }

  // --- Private ---

  private selectEdge(edgeId: string): void {
    this.reconnectHandles?.destroy();
    this.reconnectHandles = null;
    this.selection.selectEdge(edgeId);
    const edge = this.registry.getEdge(edgeId);
    if (edge) {
      this.reconnectHandles = createReconnectHandles({
        edge,
        layer: this.selectionLayer,
        viewport: this.getCtx().viewport,
        registry: this.registry,
        getScale: this.getScale,
        ghostLayer: this.ghostLayer,
        onReconnect: (r: ReconnectResult) => {
          this.reconnectHandles?.destroy();
          this.reconnectHandles = null;
          this.selection.setOnEdgeUpdate(undefined);
          this.history.execute(
            new ReconnectEdgeCommand(r.edgeId, r.endpoint, r.newNodeId, r.newSide, this.registry),
          );
          this.events.emit("edge:reconnect", {
            id: r.edgeId,
            endpoint: r.endpoint,
            newNodeId: r.newNodeId,
            newSide: r.newSide,
          });
          this.afterCommand();
          this.selectEdge(r.edgeId);
        },
        pauseCtrl: this.pauseCtrl,
      });
      this.selection.setOnEdgeUpdate(() => this.reconnectHandles?.reposition());
    }
    this.redraw.markAllDirty();
    this.redraw.flush();
  }

  private handleEscape(): void {
    if (this.edgeCreator.isActive()) {
      this.edgeCreator.cancel();
      this.clearSelection();
      return;
    }
    this.clearSelection();
  }

  private toggleEdgeLockOnSelection(): void {
    const ids = [...this.selection.getSelectedIds()];
    if (ids.length === 0) return;
    const commands = ids.map((id) => new ToggleNodeEdgeLockCommand(id, this.registry));
    if (commands.length === 1) {
      this.history.execute(commands[0]!);
    } else {
      this.history.batch(commands);
    }
    this.afterCommand();
  }

  private deleteSelected(): void {
    const edgeId = this.selection.getSelectedEdgeId();
    if (edgeId) {
      this.clearSelection();
      this.history.execute(new RemoveEdgeCommand(edgeId, this.registry, this.addRemoveOps));
      this.afterCommand();
      return;
    }
    const ids = [...this.selection.getSelectedIds()];
    if (ids.length === 0) return;
    this.clearSelection();
    const restored: string[] = [];
    const restoreOps: DeleteCommandOps = {
      ...this.elementOps,
      onRestore: (eid: string) => {
        restored.push(eid);
        this.selection.selectMultiple(restored);
      },
    };
    if (ids.length === 1) {
      this.history.execute(new DeleteCommand(ids[0]!, this.registry, syncElement, restoreOps));
    } else {
      this.history.batch(
        ids.map((id) => new DeleteCommand(id, this.registry, syncElement, restoreOps)),
      );
    }
    this.afterCommand();
  }

  private copyTargetIds(): ReadonlySet<string> {
    const elementIds = this.selection.getSelectedIds();
    if (elementIds.size > 0) return elementIds;
    const edgeId = this.selection.getSelectedEdgeId();
    if (edgeId) {
      const edge = this.registry.getEdge(edgeId);
      if (edge) return new Set([edge.sourceId, edge.targetId]);
    }
    return elementIds;
  }

  private emitMovedElements = (movedIds: string[]): void => {
    for (const mid of movedIds) {
      const el = this.registry.getElement(mid);
      if (el) this.events.emit("element:move", { id: mid, x: el.x, y: el.y });
    }
    this.afterCommand(movedIds);
  };

  private emitResizedElement = (id: string, width: number, height: number): void => {
    this.events.emit("element:resize", { id, width, height });
    this.afterCommand([id]);
  };

  private static readonly HOVER_COLOR = ACCENT_COLOR;
  private static readonly HOVER_ALPHA = 0.5;

  private showHover(id: string): void {
    if (this.selection.isSelected(id) || this.selection.getSelectedEdgeId() === id) return;
    const el = this.registry.getElement(id);
    const edge = el ? null : this.registry.getEdge(id);
    if (!el && !edge) return;
    this.hoveredId = id;
    this.hoverOutline.clear();
    if (el) {
      this.hoverOutline.rect(el.x, el.y, el.width, el.height);
      this.hoverOutline.stroke({
        color: CanvasEngineImpl.HOVER_COLOR,
        width: 1.5 / this.scale,
        alpha: CanvasEngineImpl.HOVER_ALPHA,
      });
    } else if (edge) {
      // For edges, resolve to visible ancestors so collapsed-group hover is correct
      const srcId = resolveVisibleElement(edge.sourceId, this.registry);
      const tgtId = resolveVisibleElement(edge.targetId, this.registry);
      const src = srcId ? this.registry.getElement(srcId) : undefined;
      const tgt = tgtId ? this.registry.getElement(tgtId) : undefined;
      for (const n of [src, tgt]) {
        if (n) {
          this.hoverOutline.rect(n.x, n.y, n.width, n.height);
          this.hoverOutline.stroke({
            color: CanvasEngineImpl.HOVER_COLOR,
            width: 1 / this.scale,
            alpha: CanvasEngineImpl.HOVER_ALPHA * 0.6,
          });
        }
      }
    }
    this.hoverOutline.visible = true;
  }

  private clearHover(): void {
    if (!this.hoveredId) return;
    this.hoveredId = null;
    this.hoverOutline.clear();
    this.hoverOutline.visible = false;
  }

  private updateGroupDragHandles(selectedIds: ReadonlySet<string>): void {
    for (const el of this.registry.getAllElements().values()) {
      if (el.type !== "group") continue;
      const handle = el.container.children.find((c) => c.label === "group-drag-handle");
      if (handle && "setCoversBody" in handle) {
        (handle as { setCoversBody: (v: boolean) => void }).setCoversBody(selectedIds.has(el.id));
      }
    }
  }

  private afterCommand(affectedIds?: readonly string[]): void {
    if (this.bulkLoading) return;
    this.selection.update();
    this.cullToViewport();
    if (affectedIds) {
      this.markAffectedDirty(affectedIds);
    } else {
      this.redraw.markAllDirty();
    }
    this.redraw.flush();
    this.events.emit("history:change", {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    });
  }

  private markAffectedDirty(ids: readonly string[]): void {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const el = this.registry.getElement(id);
      if (el) {
        this.redraw.markTreeDirty(el.container);
        for (const edge of this.registry.getEdgesForNode(id)) {
          this.redraw.markDirty(edge.line);
          if (edge.labelPill) this.redraw.markDirty(edge.labelPill);
        }
      }
    }
  }
}

export async function createCanvasEngine(
  container: HTMLElement,
  options: EngineOptions = {},
): Promise<CanvasEngine> {
  if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const ctx = await initViewport(container, options);
  if (options.signal?.aborted) {
    ctx.destroy();
    throw new DOMException("Aborted", "AbortError");
  }
  await preloadChevronTextures();
  if (options.signal?.aborted) {
    ctx.destroy();
    throw new DOMException("Aborted", "AbortError");
  }
  return new CanvasEngineImpl(ctx, options);
}
