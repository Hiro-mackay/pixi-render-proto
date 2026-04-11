import { Container, FederatedPointerEvent, Graphics } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { viewState } from "./view-state";
import type { Redrawable, Side } from "./types";
import { nodePortsMap, getNodeWorldRect, sideDirection } from "./types";
import {
  type EdgeDisplay,
  setEdgeSelected,
  updateEdge,
  getSideAnchor,
} from "./edge";

export type ResizeHandler = (
  node: Container,
  x: number,
  y: number,
  width: number,
  height: number,
) => void;

export type DeleteEdgeHandler = (edge: EdgeDisplay) => void;

const HANDLE_CURSORS = [
  "nwse-resize",
  "nesw-resize",
  "nesw-resize",
  "nwse-resize",
] as const;

export class SelectionManager {
  private layer: Container;
  private outline: Redrawable;
  private handles: Container[];
  private viewport: Viewport;
  private onResize: ResizeHandler | null = null;
  private onDeleteEdge: DeleteEdgeHandler | null = null;
  private getAllNodes: (() => Container[]) | null = null;
  private selected: {
    node: Container;
    width: number;
    height: number;
  } | null = null;
  private selectedEdge: EdgeDisplay | null = null;

  // Resize drag state
  private resizing = false;
  private resizeHandleIndex = -1;
  private anchorPoint = { x: 0, y: 0 };

  // Edge endpoint handles for reconnection
  private endpointHandles: Container[] = [];
  private reconnectGhost: Redrawable;
  private reconnectHighlight: Redrawable;
  private reconnecting = false;
  private reconnectEndpoint: "source" | "target" | null = null;
  private reconnectOriginal: {
    sourceNode: Container;
    targetNode: Container;
  } | null = null;
  private reconnectFixedAnchor: { x: number; y: number } | null = null;
  private reconnectFixedSide: Side | null = null;
  private reconnectCursor: { x: number; y: number } = { x: 0, y: 0 };
  private reconnectCandidate: Container | null = null;
  private abortController: AbortController;

  private static readonly HANDLE_SIZE = 10;
  private static readonly OUTLINE_PADDING = 2;
  private static readonly MIN_WIDTH = 60;
  private static readonly MIN_HEIGHT = 40;
  private static readonly ENDPOINT_RADIUS = 6;

  constructor(layer: Container, viewport: Viewport) {
    this.layer = layer;
    this.viewport = viewport;
    this.abortController = new AbortController();

    this.outline = new Graphics();
    this.outline.visible = false;
    this.layer.addChild(this.outline);

    // Resize corner handles
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

    // Edge endpoint handles (source + target)
    for (let i = 0; i < 2; i++) {
      const ep = new Container();
      ep.visible = false;
      ep.eventMode = "static";
      ep.cursor = "crosshair";

      const r = SelectionManager.ENDPOINT_RADIUS;
      ep.hitArea = {
        contains: (x: number, y: number) =>
          x * x + y * y < (r * 2) * (r * 2),
      };

      const shape: Redrawable = new Graphics();
      shape.circle(0, 0, r);
      shape.fill(0x3b82f6);
      shape.stroke({ width: 1.5, color: 0xffffff });
      shape.__redraw = () => ep.scale.set(1 / viewState.scale);
      ep.addChild(shape);

      this.setupEndpointDrag(ep, i === 0 ? "source" : "target");
      this.endpointHandles.push(ep);
      this.layer.addChild(ep);
    }

    // Ghost line for reconnection
    this.reconnectGhost = new Graphics();
    this.reconnectGhost.visible = false;
    this.reconnectGhost.__redraw = () => this.redrawReconnectGhost();
    this.layer.addChild(this.reconnectGhost);

    // Highlight for reconnection candidate
    this.reconnectHighlight = new Graphics();
    this.reconnectHighlight.visible = false;
    this.reconnectHighlight.__redraw = () => this.updateReconnectHighlight();
    this.layer.addChild(this.reconnectHighlight);

    // Delete key listener
    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        this.selectedEdge &&
        this.onDeleteEdge
      ) {
        const edge = this.selectedEdge;
        this.clearEdge();
        this.onDeleteEdge(edge);
      }
    }, { signal: this.abortController.signal });
  }

  setResizeHandler(handler: ResizeHandler): void {
    this.onResize = handler;
  }

  setDeleteEdgeHandler(handler: DeleteEdgeHandler): void {
    this.onDeleteEdge = handler;
  }

  setReconnectDeps(getAllNodes: () => Container[]): void {
    this.getAllNodes = getAllNodes;
  }

  isResizing(): boolean {
    return this.resizing;
  }

  getSelectedEdge(): EdgeDisplay | null {
    return this.selectedEdge;
  }

  select(node: Container, width: number, height: number): void {
    this.clearEdge();

    if (this.selected) {
      const prevPorts = nodePortsMap.get(this.selected.node);
      if (prevPorts) prevPorts.visible = false;
    }

    this.selected = { node, width, height };
    this.outline.__redraw = () => this.redraw();

    const ports = nodePortsMap.get(node);
    if (ports) ports.visible = true;

    this.update();
  }

  selectEdge(edge: EdgeDisplay): void {
    this.clearNode();
    this.clearEdge();

    this.selectedEdge = edge;
    setEdgeSelected(edge, true);
    this.positionEndpointHandles(edge);
  }

  clear(): void {
    this.clearNode();
    this.clearEdge();
  }

  update(): void {
    if (!this.selected) return;
    this.redraw();
    this.outline.visible = true;
  }

  destroy(): void {
    this.abortController.abort();
  }

  private clearNode(): void {
    if (this.selected) {
      const ports = nodePortsMap.get(this.selected.node);
      if (ports) ports.visible = false;
    }
    this.selected = null;
    this.outline.visible = false;
    this.outline.__redraw = undefined;
    for (const h of this.handles) h.visible = false;
  }

  private clearEdge(): void {
    if (this.selectedEdge) {
      setEdgeSelected(this.selectedEdge, false);
      this.selectedEdge = null;
    }
    for (const ep of this.endpointHandles) ep.visible = false;
    this.reconnectGhost.visible = false;
    this.reconnectHighlight.visible = false;
  }

  private positionEndpointHandles(edge: EdgeDisplay): void {
    const sourceRect = getNodeWorldRect(edge.sourceNode);
    const targetRect = getNodeWorldRect(edge.targetNode);
    const sourceCenter = {
      x: sourceRect.x + sourceRect.width / 2,
      y: sourceRect.y + sourceRect.height / 2,
    };
    const targetCenter = {
      x: targetRect.x + targetRect.width / 2,
      y: targetRect.y + targetRect.height / 2,
    };

    const sourceAnchor = getSideAnchor(sourceRect, targetCenter);
    const targetAnchor = getSideAnchor(targetRect, sourceCenter);

    const inv = 1 / viewState.scale;
    this.endpointHandles[0]!.position.set(sourceAnchor.x, sourceAnchor.y);
    this.endpointHandles[0]!.scale.set(inv);
    this.endpointHandles[0]!.visible = true;

    this.endpointHandles[1]!.position.set(targetAnchor.x, targetAnchor.y);
    this.endpointHandles[1]!.scale.set(inv);
    this.endpointHandles[1]!.visible = true;
  }

  private setupEndpointDrag(
    handle: Container,
    endpoint: "source" | "target",
  ): void {
    handle.on("pointerdown", (e: FederatedPointerEvent) => {
      if (!this.selectedEdge) return;
      e.stopPropagation();

      this.reconnecting = true;
      this.reconnectEndpoint = endpoint;
      this.reconnectOriginal = {
        sourceNode: this.selectedEdge.sourceNode,
        targetNode: this.selectedEdge.targetNode,
      };
      this.viewport.pause = true;

      // Compute fixed anchor (the end NOT being dragged)
      const edge = this.selectedEdge;
      const fixedNode =
        endpoint === "source" ? edge.targetNode : edge.sourceNode;
      const fixedRect = getNodeWorldRect(fixedNode);
      const dragNode =
        endpoint === "source" ? edge.sourceNode : edge.targetNode;
      const dragRect = getNodeWorldRect(dragNode);
      const dragCenter = {
        x: dragRect.x + dragRect.width / 2,
        y: dragRect.y + dragRect.height / 2,
      };
      const fixedAnchor = getSideAnchor(fixedRect, dragCenter);
      this.reconnectFixedAnchor = { x: fixedAnchor.x, y: fixedAnchor.y };
      this.reconnectFixedSide = fixedAnchor.side;
      this.reconnectCursor = { x: fixedAnchor.x, y: fixedAnchor.y };

      // Hide edge line during drag
      edge.line.visible = false;
      edge.hitLine.visible = false;
      if (edge.labelPill) (edge.labelPill as Graphics).visible = false;
      if (edge.labelText) edge.labelText.visible = false;

      // Hide the other endpoint handle; keep the dragged one for events
      const otherIdx = endpoint === "source" ? 1 : 0;
      this.endpointHandles[otherIdx]!.visible = false;

      this.reconnectGhost.visible = true;
      this.redrawReconnectGhost();
    });

    handle.on("globalpointermove", (e: FederatedPointerEvent) => {
      if (!this.reconnecting || this.reconnectEndpoint !== endpoint) return;

      const world = this.viewport.toWorld(e.global.x, e.global.y);
      this.reconnectCursor = { x: world.x, y: world.y };

      // Move the dragged handle to follow the cursor
      handle.position.set(world.x, world.y);

      // Find candidate node
      const candidate = this.findNodeAt(world.x, world.y);
      const fixedNode =
        this.reconnectEndpoint === "source"
          ? this.reconnectOriginal!.targetNode
          : this.reconnectOriginal!.sourceNode;
      const valid =
        candidate && candidate !== fixedNode ? candidate : null;

      if (valid !== this.reconnectCandidate) {
        this.reconnectCandidate = valid;
        this.updateReconnectHighlight();
      }

      this.redrawReconnectGhost();
    });

    const finish = () => {
      if (!this.reconnecting || this.reconnectEndpoint !== endpoint) return;
      if (!this.selectedEdge || !this.reconnectOriginal) return;

      const edge = this.selectedEdge;
      const candidate = this.reconnectCandidate;

      if (candidate) {
        // Reconnect
        if (this.reconnectEndpoint === "source") {
          edge.sourceNode = candidate;
        } else {
          edge.targetNode = candidate;
        }
      } else {
        // Revert to original
        edge.sourceNode = this.reconnectOriginal.sourceNode;
        edge.targetNode = this.reconnectOriginal.targetNode;
      }

      // Restore visibility
      edge.line.visible = true;
      edge.hitLine.visible = true;
      if (edge.labelPill) (edge.labelPill as Graphics).visible = true;
      if (edge.labelText) edge.labelText.visible = true;

      updateEdge(edge);
      this.positionEndpointHandles(edge);

      this.reconnecting = false;
      this.reconnectEndpoint = null;
      this.reconnectOriginal = null;
      this.reconnectFixedAnchor = null;
      this.reconnectFixedSide = null;
      this.reconnectCandidate = null;
      this.reconnectGhost.clear();
      this.reconnectGhost.visible = false;
      this.reconnectHighlight.clear();
      this.reconnectHighlight.visible = false;
      this.viewport.pause = false;
    };

    handle.on("pointerup", finish);
    handle.on("pointerupoutside", finish);
  }

  private findNodeAt(worldX: number, worldY: number): Container | null {
    if (!this.getAllNodes) return null;
    const nodes = this.getAllNodes();
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]!;
      const rect = getNodeWorldRect(n);
      if (
        worldX >= rect.x &&
        worldX <= rect.x + rect.width &&
        worldY >= rect.y &&
        worldY <= rect.y + rect.height
      ) {
        return n;
      }
    }
    return null;
  }

  private redrawReconnectGhost(): void {
    if (!this.reconnectFixedAnchor || !this.reconnectFixedSide) return;

    const anchor = this.reconnectFixedAnchor;
    const cursor = this.reconnectCursor;
    const strokeWidth = 1.5 / viewState.scale;

    const dx = cursor.x - anchor.x;
    const dy = cursor.y - anchor.y;
    const dist = Math.hypot(dx, dy);
    const offset = Math.min(Math.max(dist * 0.4, 30), 120);

    const dir = sideDirection(this.reconnectFixedSide);
    const cp1x = anchor.x + dir.x * offset;
    const cp1y = anchor.y + dir.y * offset;
    const cp2x = cursor.x - dx * 0.25;
    const cp2y = cursor.y - dy * 0.25;

    this.reconnectGhost.clear();
    this.reconnectGhost.moveTo(anchor.x, anchor.y);
    this.reconnectGhost.bezierCurveTo(
      cp1x, cp1y, cp2x, cp2y, cursor.x, cursor.y,
    );
    this.reconnectGhost.stroke({
      width: strokeWidth,
      color: 0x3b82f6,
      alpha: 0.9,
    });

    this.reconnectGhost.circle(cursor.x, cursor.y, 4 / viewState.scale);
    this.reconnectGhost.fill({ color: 0x3b82f6, alpha: 0.9 });
  }

  private updateReconnectHighlight(): void {
    this.reconnectHighlight.clear();
    if (!this.reconnectCandidate) {
      this.reconnectHighlight.visible = false;
      return;
    }
    const rect = getNodeWorldRect(this.reconnectCandidate);
    const pad = 4 / viewState.scale;
    const strokeW = 2.5 / viewState.scale;
    this.reconnectHighlight.roundRect(
      rect.x - pad, rect.y - pad,
      rect.width + pad * 2, rect.height + pad * 2, 10,
    );
    this.reconnectHighlight.stroke({
      width: strokeW, color: 0x3b82f6, alpha: 0.8,
    });
    this.reconnectHighlight.visible = true;
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
        { x: node.x + width, y: node.y + height },
        { x: node.x, y: node.y + height },
        { x: node.x + width, y: node.y },
        { x: node.x, y: node.y },
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
    this.outline.stroke({ width: 2 / scale, color: 0x3b82f6 });

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
