import { Container, Graphics } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { viewState } from "./view-state";
import type { Redrawable, Side } from "./types";
import { sideDirection, getNodeWorldRect } from "./types";
export type { Side } from "./types";

export type EdgeCreationResult = {
  source: Container;
  target: Container;
};

/**
 * Manages the state of edge creation: when the user drags from a node port,
 * this class tracks the source node, renders a ghost bezier curve following
 * the cursor, and commits a real edge on drop if released over a target node.
 */
export class EdgeCreator {
  private sourceNode: Container | null = null;
  private sourceSide: Side | null = null;
  private sourceAnchor: { x: number; y: number } | null = null;
  private cursorWorld: { x: number; y: number } = { x: 0, y: 0 };

  private ghostLine: Redrawable;
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

    this.viewport = viewport;
    this.getAllNodes = getAllNodes;
    this.onCreate = onCreate;

    // Register redraw so ghost line stroke stays zoom-invariant
    this.ghostLine.__redraw = () => this.redraw();
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
    this.redraw();
  }

  /**
   * Called on pointer up. Finds a target node at the given screen position
   * and commits the edge if valid.
   */
  finishAt(screenX: number, screenY: number): void {
    if (!this.sourceNode) return;

    const world = this.viewport.toWorld(screenX, screenY);
    const target = this.findNodeAt(world.x, world.y);

    if (target && target !== this.sourceNode) {
      this.onCreate({ source: this.sourceNode, target });
    }
    this.cancel();
  }

  cancel(): void {
    this.sourceNode = null;
    this.sourceSide = null;
    this.sourceAnchor = null;
    this.ghostLine.clear();
    this.ghostLine.visible = false;
    this.viewport.pause = false;
  }

  isActive(): boolean {
    return this.sourceNode !== null;
  }

  /**
   * Wire canvas DOM events so cursor movement and pointerup drive
   * edge creation. Call once after creating the EdgeCreator.
   * Returns a cleanup function that removes all listeners.
   */
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

    // Safety net: cancel if pointer is lost (e.g. browser captures it)
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
    this.ghostLine.circle(this.cursorWorld.x, this.cursorWorld.y, 4 / viewState.scale);
    this.ghostLine.fill({ color: 0x3b82f6, alpha: 0.9 });
  }
}
