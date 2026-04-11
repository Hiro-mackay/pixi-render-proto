import { Container, Graphics } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { viewState } from "./view-state";
import type { Redrawable, Side } from "./types";
import { getElementRect, computeBezierControlPoints, findNodeAt } from "./types";
import { getNearestSide, getFixedSideAnchor } from "./edge";
export type { Side } from "./types";

export type EdgeCreationResult = {
  source: Container;
  sourceSide: Side;
  target: Container;
  targetSide: Side;
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
  private onEnd: (() => void) | null = null;

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

  start(
    node: Container,
    side: Side,
    anchorX: number,
    anchorY: number,
    onEnd?: () => void,
  ): void {
    this.sourceNode = node;
    this.sourceSide = side;
    this.sourceAnchor = { x: anchorX, y: anchorY };
    this.cursorWorld = { x: anchorX, y: anchorY };
    this.onEnd = onEnd ?? null;
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
      const targetRect = getElementRect(target);
      const targetSide = getNearestSide(targetRect, world);
      this.onCreate({
        source: this.sourceNode,
        sourceSide: this.sourceSide!,
        target,
        targetSide,
      });
    }
    this.cancel();
  }

  cancel(): void {
    const cb = this.onEnd;
    this.sourceNode = null;
    this.sourceSide = null;
    this.sourceAnchor = null;
    this.onEnd = null;
    this.ghostLine.clear();
    this.ghostLine.visible = false;
    this.highlightedNode = null;
    this.highlightGraphic.clear();
    this.highlightGraphic.visible = false;
    this.viewport.pause = false;
    cb?.();
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
    return findNodeAt(this.getAllNodes(), worldX, worldY);
  }

  private updateHighlight(): void {
    this.highlightGraphic.clear();
    if (!this.highlightedNode) {
      this.highlightGraphic.visible = false;
      return;
    }
    const rect = getElementRect(this.highlightedNode);
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

    // Snap endpoint to nearest port when over a candidate node
    let endX = this.cursorWorld.x;
    let endY = this.cursorWorld.y;
    let endSide: Side | null = null;

    if (this.highlightedNode) {
      const rect = getElementRect(this.highlightedNode);
      const side = getNearestSide(rect, this.cursorWorld);
      const anchor = getFixedSideAnchor(rect, side);
      endX = anchor.x;
      endY = anchor.y;
      endSide = side;
    }

    const { cp1x, cp1y, cp2x, cp2y } = computeBezierControlPoints(
      this.sourceAnchor.x, this.sourceAnchor.y, this.sourceSide,
      endX, endY, endSide,
    );

    this.ghostLine.clear();
    this.ghostLine.moveTo(this.sourceAnchor.x, this.sourceAnchor.y);
    this.ghostLine.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
    this.ghostLine.stroke({
      width: strokeWidth,
      color: 0x3b82f6,
      alpha: 0.9,
    });

    // Small dot at endpoint
    this.ghostLine.circle(endX, endY, 4 / viewState.scale);
    this.ghostLine.fill({ color: 0x3b82f6, alpha: 0.9 });
  }
}
