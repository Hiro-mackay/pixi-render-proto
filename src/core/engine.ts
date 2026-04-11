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
import { ElementRegistry, type ReadonlyElementRegistry } from "./registry/element-registry";
import { RedrawManager } from "./viewport/redraw-manager";
import { createNodeGraphics } from "./elements/node-renderer";
import { createGroupGraphics } from "./elements/group-renderer";
import { createEdgeGraphics, updateEdgeGraphics, removeEdgeGraphics } from "./elements/edge-renderer";
import { createPortGraphics } from "./elements/port-renderer";

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
}

const DEFAULT_NODE_COLOR = 0x2d3748;

class CanvasEngineImpl implements CanvasEngine {
  private ctx: ViewportContext | null;
  private destroyed = false;
  readonly registry = new ElementRegistry();
  private readonly redraw = new RedrawManager();
  private edgeLineLayer = new Container();
  private edgeLabelLayer = new Container();

  constructor(ctx: ViewportContext) {
    this.ctx = ctx;
    this.edgeLineLayer.label = "edge-line-layer";
    this.edgeLabelLayer.label = "edge-label-layer";
    ctx.viewport.addChild(this.edgeLineLayer);

    ctx.onZoom(() => {
      this.redraw.markAllDirty();
      this.redraw.flush();
    });
  }

  private getCtx(): ViewportContext {
    if (this.destroyed || !this.ctx) {
      throw new Error("CanvasEngine has been destroyed");
    }
    return this.ctx;
  }

  get viewport(): Viewport {
    return this.getCtx().viewport;
  }

  get scale(): number {
    if (!this.ctx) return 1;
    return this.ctx.getScale();
  }

  private getScale = (): number => this.scale;

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.redraw.clear();
    this.ctx?.destroy();
    this.ctx = null;
  }

  addNode(id: string, opts: NodeOptions): void {
    const meta: NodeMeta = {
      label: opts.label,
      color: opts.color ?? DEFAULT_NODE_COLOR,
      icon: opts.icon,
    };
    const container = createNodeGraphics(
      { id, meta, x: opts.x, y: opts.y, width: opts.width, height: opts.height },
      this.getScale,
    );
    const element: CanvasElement = {
      id, type: "node",
      x: opts.x, y: opts.y, width: opts.width, height: opts.height,
      visible: true, parentGroupId: null, container, meta,
    };
    createPortGraphics(element, this.getScale);
    this.registry.addElement(id, element);
    this.getCtx().viewport.addChild(container);
    this.registerRedrawables(container);
  }

  addGroup(id: string, opts: GroupOptions): void {
    const meta: GroupMeta = {
      label: opts.label,
      color: opts.color,
      collapsed: false,
    };
    const container = createGroupGraphics(
      { id, meta, x: opts.x, y: opts.y, width: opts.width, height: opts.height },
      this.getScale,
    );
    const element: CanvasElement = {
      id, type: "group",
      x: opts.x, y: opts.y, width: opts.width, height: opts.height,
      visible: true, parentGroupId: null, container, meta,
    };
    this.registry.addElement(id, element);
    this.getCtx().viewport.addChild(container);
    this.registerRedrawables(container);
  }

  addEdge(id: string, opts: EdgeOptions): void {
    this.registry.getElementOrThrow(opts.sourceId);
    this.registry.getElementOrThrow(opts.targetId);

    // Re-add label layer so it stays above all nodes/groups
    this.getCtx().viewport.addChild(this.edgeLabelLayer);

    const gfx = createEdgeGraphics(
      opts.label, this.edgeLineLayer, this.edgeLabelLayer,
    );
    const edge: CanvasEdge = {
      id,
      sourceId: opts.sourceId, sourceSide: opts.sourceSide,
      targetId: opts.targetId, targetSide: opts.targetSide,
      label: opts.label ?? null,
      line: gfx.line, hitLine: gfx.hitLine,
      labelPill: gfx.labelPill, labelText: gfx.labelText,
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
  }

  removeElement(id: string): void {
    const element = this.registry.getElementOrThrow(id);

    // Clean up connected edges first (graphics + redraw + registry)
    const connectedEdges = this.registry.getEdgesForNode(id);
    for (const edge of connectedEdges) {
      this.removeEdge(edge.id);
    }

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

  private registerRedrawables(container: Container): void {
    const walk = (c: Container) => {
      const r = c as Redrawable;
      if (typeof r.__redraw === "function") {
        this.redraw.register(r);
      }
      for (const child of c.children) {
        if (child instanceof Container) walk(child);
      }
    };
    walk(container);
  }

  private unregisterRedrawables(container: Container): void {
    const walk = (c: Container) => {
      const r = c as Redrawable;
      if (typeof r.__redraw === "function") {
        this.redraw.unregister(r);
      }
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
  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const ctx = await initViewport(container, options);

  if (options.signal?.aborted) {
    ctx.destroy();
    throw new DOMException("Aborted", "AbortError");
  }

  return new CanvasEngineImpl(ctx);
}
