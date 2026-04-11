import { Container, Graphics } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { viewState } from "./view-state";
import type { Redrawable, Side } from "./types";
import { sideDirection, getNodeWorldRect } from "./types";
export type { Side } from "./types";

export type EdgeCreationResult = {
  source: Container;
  sourceSide: Side;
  target: Container;
};

/**
 * Manages edge creation: drag from a node port to create a connected
 * or dangling edge. Shows a ghost bezier during drag and highlights
 * potential target nodes.
 */
export class EdgeCreator {
  private sourceNode: Container | null = null;
  private sourceSide: Side | null = null;
  private sourceAnchor: { x: number; y: number } | null = null;
  private cursorWorld: { x: number; y: number } = { x: 0, y: 0 };

  private ghostLine: Redrawable;
  private highlightGraphic: Redrawable;
  private highlightedNode: Container | null = null;
  private viewport: Viewport;
  private onCreate: (result: EdgeCreationResult) => void;
  private getAllNodes: () => Container[];

  constructor(
    ghostLayer: Container,
    viewport: Viewport,
    getAllNodes: () => Container[],
    onCreate: (result: EdgeCreationResult) => void,
  ) {
    this.ghostLine = new Graphics();
    this.ghostLine.visible = false;
    ghostLayer.addChild(this.ghostLine);
    this.ghostLine.__redraw = () => this.redraw();

    this.highlightGraphic = new Graphics();
    this.highlightGraphic.visible = false;
    ghostLayer.addChild(this.highlightGraphic);
    this.highlightGraphic.__redraw = () => this.updateHighlight();

    this.viewport = viewport;
    this.getAllNodes = getAllNodes;
    this.onCreate = onCreate;
  }

  start(node: Container, side: Side, anchorX: number, anchorY: number): void {
    this.sourceNode = node;
    this.sourceSide = side;
    this.sourceAnchor = { x: anchorX, y: anchorY };
    this.cursorWorld = { x: anchorX, y: anchorY };
    this.ghostLine.visible = true;
    this.viewport.pause = true;
    this.redraw();
  }

  updateCursor(worldX: number, worldY: number): void {
    if (!this.sourceNode) return;
    this.cursorWorld = { x: worldX, y: worldY };

    // Connect preview: highlight potential target node
    const candidate = this.findNodeAt(worldX, worldY);
    const validTarget =
      candidate && candidate !== this.sourceNode ? candidate : null;

    if (validTarget !== this.highlightedNode) {
      this.highlightedNode = validTarget;
      this.updateHighlight();
    }

    this.redraw();
  }

  finishAt(screenX: number, screenY: number): void {
    if (!this.sourceNode) return;

    const world = this.viewport.toWorld(screenX, screenY);
    const target = this.findNodeAt(world.x, world.y);

    if (target && target !== this.sourceNode) {
      this.onCreate({
        source: this.sourceNode,
        sourceSide: this.sourceSide!,
        target,
      });
    }
    this.cancel();
  }

  cancel(): void {
    this.sourceNode = null;
    this.sourceSide = null;
    this.sourceAnchor = null;
    this.ghostLine.clear();
    this.ghostLine.visible = false;
    this.highlightedNode = null;
    this.highlightGraphic.clear();
    this.highlightGraphic.visible = false;
    this.viewport.pause = false;
  }

  isActive(): boolean {
    return this.sourceNode !== null;
  }

  bindCanvasEvents(canvas: HTMLCanvasElement): () => void {
    const ac = new AbortController();
    const { signal } = ac;

    window.addEventListener("pointermove", (e: PointerEvent) => {
      if (!this.isActive()) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = this.viewport.toWorld(sx, sy);
      this.updateCursor(world.x, world.y);
    }, { signal });

    window.addEventListener("pointerup", (e: PointerEvent) => {
      if (!this.isActive()) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      this.finishAt(sx, sy);
    }, { signal });

    window.addEventListener("pointercancel", () => {
      if (this.isActive()) this.cancel();
    }, { signal });

    window.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape" && this.isActive()) {
        this.cancel();
      }
    }, { signal });

    return () => ac.abort();
  }

  private findNodeAt(worldX: number, worldY: number): Container | null {
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

  private updateHighlight(): void {
    this.highlightGraphic.clear();
    if (!this.highlightedNode) {
      this.highlightGraphic.visible = false;
      return;
    }
    const rect = getNodeWorldRect(this.highlightedNode);
    const pad = 4 / viewState.scale;
    const strokeW = 2.5 / viewState.scale;
    this.highlightGraphic.roundRect(
      rect.x - pad,
      rect.y - pad,
      rect.width + pad * 2,
      rect.height + pad * 2,
      10,
    );
    this.highlightGraphic.stroke({
      width: strokeW,
      color: 0x3b82f6,
      alpha: 0.8,
    });
    this.highlightGraphic.visible = true;
  }

  private redraw(): void {
    if (!this.sourceAnchor || !this.sourceSide) {
      this.ghostLine.clear();
      return;
    }

    const strokeWidth = 1.5 / viewState.scale;

    const dx = this.cursorWorld.x - this.sourceAnchor.x;
    const dy = this.cursorWorld.y - this.sourceAnchor.y;
    const dist = Math.hypot(dx, dy);
    const offset = Math.min(Math.max(dist * 0.4, 30), 120);

    const dir = sideDirection(this.sourceSide);
    const cp1x = this.sourceAnchor.x + dir.x * offset;
    const cp1y = this.sourceAnchor.y + dir.y * offset;
    const cp2x = this.cursorWorld.x - dx * 0.25;
    const cp2y = this.cursorWorld.y - dy * 0.25;

    this.ghostLine.clear();
    this.ghostLine.moveTo(this.sourceAnchor.x, this.sourceAnchor.y);
    this.ghostLine.bezierCurveTo(
      cp1x,
      cp1y,
      cp2x,
      cp2y,
      this.cursorWorld.x,
      this.cursorWorld.y,
    );
    this.ghostLine.stroke({
      width: strokeWidth,
      color: 0x3b82f6,
      alpha: 0.9,
    });

    // Small dot at cursor end
    this.ghostLine.circle(
      this.cursorWorld.x,
      this.cursorWorld.y,
      4 / viewState.scale,
    );
    this.ghostLine.fill({ color: 0x3b82f6, alpha: 0.9 });
  }
}
