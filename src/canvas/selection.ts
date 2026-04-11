import { Container, FederatedPointerEvent, Graphics } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { viewState } from "./view-state";
import type { Redrawable } from "./types";
import { nodePortsMap } from "./types";

export type ResizeHandler = (
  node: Container,
  x: number,
  y: number,
  width: number,
  height: number,
) => void;

const HANDLE_CURSORS = [
  "nwse-resize", // 0: top-left
  "nesw-resize", // 1: top-right
  "nesw-resize", // 2: bottom-left
  "nwse-resize", // 3: bottom-right
] as const;

/**
 * Manages the selection overlay for a single node.
 *
 * Method 1 (selection outline): stroke width = `2 / viewState.scale`
 * Method 2 (corner handles): counter-scaled to constant screen size
 *
 * Corner handles are interactive and support resize dragging.
 */
export class SelectionManager {
  private layer: Container;
  private outline: Redrawable;
  private handles: Container[];
  private viewport: Viewport;
  private onResize: ResizeHandler | null = null;
  private selected: {
    node: Container;
    width: number;
    height: number;
  } | null = null;

  // Resize drag state
  private resizing = false;
  private resizeHandleIndex = -1;
  private anchorPoint = { x: 0, y: 0 };

  private static readonly HANDLE_SIZE = 10;
  private static readonly OUTLINE_PADDING = 2;
  private static readonly MIN_WIDTH = 60;
  private static readonly MIN_HEIGHT = 40;

  constructor(layer: Container, viewport: Viewport) {
    this.layer = layer;
    this.viewport = viewport;

    this.outline = new Graphics();
    this.outline.visible = false;
    this.layer.addChild(this.outline);

    this.handles = [];
    for (let i = 0; i < 4; i++) {
      const handle = new Container();
      handle.visible = false;
      handle.eventMode = "static";
      handle.cursor = HANDLE_CURSORS[i];

      const hs = SelectionManager.HANDLE_SIZE;
      handle.hitArea = {
        contains: (x: number, y: number) =>
          x >= -hs && x <= hs && y >= -hs && y <= hs,
      };

      const shape = new Graphics();
      shape.rect(-hs / 2, -hs / 2, hs, hs);
      shape.fill(0xffffff);
      shape.stroke({ width: 1.5, color: 0x3b82f6 });
      handle.addChild(shape);

      this.setupResizeEvents(handle, i);
      this.handles.push(handle);
      this.layer.addChild(handle);
    }
  }

  setResizeHandler(handler: ResizeHandler): void {
    this.onResize = handler;
  }

  isResizing(): boolean {
    return this.resizing;
  }

  select(node: Container, width: number, height: number): void {
    // Hide ports on previously selected node
    if (this.selected) {
      const prevPorts = nodePortsMap.get(this.selected.node);
      if (prevPorts) prevPorts.visible = false;
    }

    this.selected = { node, width, height };
    this.outline.__redraw = () => this.redraw();

    // Show ports on newly selected node
    const ports = nodePortsMap.get(node);
    if (ports) ports.visible = true;

    this.update();
  }

  clear(): void {
    if (this.selected) {
      const ports = nodePortsMap.get(this.selected.node);
      if (ports) ports.visible = false;
    }
    this.selected = null;
    this.outline.visible = false;
    this.outline.__redraw = undefined;
    for (const h of this.handles) h.visible = false;
  }

  update(): void {
    if (!this.selected) return;
    this.redraw();
    this.outline.visible = true;
  }

  private setupResizeEvents(handle: Container, index: number): void {
    handle.on("pointerdown", (e: FederatedPointerEvent) => {
      if (!this.selected) return;
      e.stopPropagation();
      this.resizing = true;
      this.resizeHandleIndex = index;
      this.viewport.pause = true;

      const { node, width, height } = this.selected;
      const anchors = [
        { x: node.x + width, y: node.y + height }, // 0: TL dragged → BR anchor
        { x: node.x, y: node.y + height },          // 1: TR dragged → BL anchor
        { x: node.x + width, y: node.y },           // 2: BL dragged → TR anchor
        { x: node.x, y: node.y },                    // 3: BR dragged → TL anchor
      ];
      this.anchorPoint = anchors[index]!;
    });

    handle.on("globalpointermove", (e: FederatedPointerEvent) => {
      if (!this.resizing || this.resizeHandleIndex !== index) return;
      if (!this.selected || !this.onResize) return;

      const world = this.viewport.toWorld(e.global.x, e.global.y);
      const anchor = this.anchorPoint;

      const rawW = Math.abs(world.x - anchor.x);
      const rawH = Math.abs(world.y - anchor.y);
      const newW = Math.max(rawW, SelectionManager.MIN_WIDTH);
      const newH = Math.max(rawH, SelectionManager.MIN_HEIGHT);

      const dirX = world.x >= anchor.x ? 1 : -1;
      const dirY = world.y >= anchor.y ? 1 : -1;

      const newX = dirX > 0 ? anchor.x : anchor.x - newW;
      const newY = dirY > 0 ? anchor.y : anchor.y - newH;

      this.selected.width = newW;
      this.selected.height = newH;
      this.onResize(this.selected.node, newX, newY, newW, newH);
      this.update();
    });

    const finish = () => {
      if (!this.resizing || this.resizeHandleIndex !== index) return;
      this.resizing = false;
      this.resizeHandleIndex = -1;
      this.viewport.pause = false;
    };

    handle.on("pointerup", finish);
    handle.on("pointerupoutside", finish);
  }

  private redraw(): void {
    if (!this.selected) return;

    const { node, width, height } = this.selected;
    const scale = viewState.scale;
    const inv = 1 / scale;
    const pad = SelectionManager.OUTLINE_PADDING / scale;
    const x = node.x;
    const y = node.y;

    this.outline.clear();
    this.outline.rect(x - pad, y - pad, width + pad * 2, height + pad * 2);
    this.outline.stroke({
      width: 2 / scale,
      color: 0x3b82f6,
    });

    const corners = [
      { x: x - pad, y: y - pad },
      { x: x + width + pad, y: y - pad },
      { x: x - pad, y: y + height + pad },
      { x: x + width + pad, y: y + height + pad },
    ];
    for (let i = 0; i < 4; i++) {
      const handle = this.handles[i]!;
      const corner = corners[i]!;
      handle.position.set(corner.x, corner.y);
      handle.scale.set(inv);
      handle.visible = true;
    }
  }
}
