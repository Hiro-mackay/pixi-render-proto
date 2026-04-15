import { Graphics } from "pixi.js";
import type { Container } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import type { Redrawable, Side } from "../types";
import type { ReadonlyElementRegistry } from "../registry/element-registry";
import { computeBezierControlPoints } from "../geometry/bezier";
import { getFixedSideAnchor, getNearestSide } from "../geometry/anchor";
import { findNodeAt } from "../geometry/hit-test";
import type { ViewportPauseController } from "../viewport/pause-controller";

const GHOST_COLOR = 0x3b82f6;
const GHOST_STROKE_WIDTH = 1.5;
const GHOST_ENDPOINT_RADIUS = 4;
const HIGHLIGHT_PAD = 4;
const HIGHLIGHT_STROKE_WIDTH = 2.5;

export interface EdgeCreatedEvent {
  readonly sourceId: string;
  readonly sourceSide: Side;
  readonly targetId: string;
  readonly targetSide: Side;
}

export class EdgeCreator {
  private sourceId: string | null = null;
  private sourceSide: Side | null = null;
  private sourceAnchor: { x: number; y: number } | null = null;
  private cursorWorld = { x: 0, y: 0 };
  private highlightedNodeId: string | null = null;

  private readonly ghostLine: Redrawable;
  private readonly highlightGraphic: Redrawable;

  private readonly pauseCtrl?: ViewportPauseController;

  constructor(
    ghostLayer: Container,
    private readonly viewport: Viewport,
    private readonly registry: ReadonlyElementRegistry,
    private readonly getScale: () => number,
    private readonly onEdgeCreated: (event: EdgeCreatedEvent) => void,
    pauseCtrl?: ViewportPauseController,
  ) {
    this.pauseCtrl = pauseCtrl;
    this.ghostLine = new Graphics() as Redrawable;
    this.ghostLine.visible = false;
    ghostLayer.addChild(this.ghostLine);
    this.ghostLine.__redraw = () => this.redraw();

    this.highlightGraphic = new Graphics() as Redrawable;
    this.highlightGraphic.visible = false;
    ghostLayer.addChild(this.highlightGraphic);
    this.highlightGraphic.__redraw = () => this.updateHighlight();
  }

  getGhostLine(): Redrawable { return this.ghostLine; }
  getHighlightGraphic(): Redrawable { return this.highlightGraphic; }

  start(
    sourceId: string,
    side: Side,
    anchorX: number,
    anchorY: number,
  ): void {
    this.sourceId = sourceId;
    this.sourceSide = side;
    this.sourceAnchor = { x: anchorX, y: anchorY };
    this.cursorWorld = { x: anchorX, y: anchorY };
    this.ghostLine.visible = true;
    this.pauseCtrl ? this.pauseCtrl.acquire() : (this.viewport.pause = true);
    this.redraw();
  }

  updateCursor(worldX: number, worldY: number): void {
    if (!this.sourceId) return;
    this.cursorWorld = { x: worldX, y: worldY };

    const candidate = findNodeAt(
      { x: worldX, y: worldY }, this.registry, this.sourceId,
    );
    const validId = candidate?.id ?? null;

    if (validId !== this.highlightedNodeId) {
      this.highlightedNodeId = validId;
      this.updateHighlight();
    }

    this.redraw();
  }

  finishAt(screenX: number, screenY: number): void {
    if (!this.sourceId || !this.sourceSide) return;

    const world = this.viewport.toWorld(screenX, screenY);
    const target = findNodeAt(
      { x: world.x, y: world.y }, this.registry, this.sourceId,
    );

    if (target) {
      const targetSide = getNearestSide(
        { x: target.x, y: target.y, width: target.width, height: target.height },
        world,
      );
      this.onEdgeCreated({
        sourceId: this.sourceId,
        sourceSide: this.sourceSide,
        targetId: target.id,
        targetSide,
      });
    }
    this.cancel();
  }

  cancel(): void {
    this.sourceId = null;
    this.sourceSide = null;
    this.sourceAnchor = null;
    this.highlightedNodeId = null;
    this.ghostLine.clear();
    this.ghostLine.visible = false;
    this.highlightGraphic.clear();
    this.highlightGraphic.visible = false;
    this.pauseCtrl ? this.pauseCtrl.release() : (this.viewport.pause = false);
  }

  isActive(): boolean {
    return this.sourceId !== null;
  }

  destroy(): void {
    this.cancel();
    this.ghostLine.removeFromParent();
    this.ghostLine.destroy();
    this.highlightGraphic.removeFromParent();
    this.highlightGraphic.destroy();
  }

  private updateHighlight(): void {
    this.highlightGraphic.clear();
    if (!this.highlightedNodeId) {
      this.highlightGraphic.visible = false;
      return;
    }
    const el = this.registry.getElement(this.highlightedNodeId);
    if (!el) {
      this.highlightGraphic.visible = false;
      return;
    }
    const scale = this.getScale();
    const pad = HIGHLIGHT_PAD / scale;
    const strokeW = HIGHLIGHT_STROKE_WIDTH / scale;
    this.highlightGraphic.roundRect(
      el.x - pad, el.y - pad,
      el.width + pad * 2, el.height + pad * 2,
      10,
    );
    this.highlightGraphic.stroke({ width: strokeW, color: GHOST_COLOR, alpha: 0.8 });
    this.highlightGraphic.visible = true;
  }

  private redraw(): void {
    if (!this.sourceAnchor || !this.sourceSide) {
      this.ghostLine.clear();
      return;
    }

    const scale = this.getScale();
    const strokeWidth = GHOST_STROKE_WIDTH / scale;

    let endX = this.cursorWorld.x;
    let endY = this.cursorWorld.y;
    let endSide: Side | null = null;

    if (this.highlightedNodeId) {
      const el = this.registry.getElement(this.highlightedNodeId);
      if (el) {
        const side = getNearestSide(
          { x: el.x, y: el.y, width: el.width, height: el.height },
          this.cursorWorld,
        );
        const anchor = getFixedSideAnchor(
          { x: el.x, y: el.y, width: el.width, height: el.height },
          side,
        );
        endX = anchor.x;
        endY = anchor.y;
        endSide = side;
      }
    }

    const { cp1x, cp1y, cp2x, cp2y } = computeBezierControlPoints(
      this.sourceAnchor.x, this.sourceAnchor.y, this.sourceSide,
      endX, endY, endSide,
    );

    this.ghostLine.clear();
    this.ghostLine.moveTo(this.sourceAnchor.x, this.sourceAnchor.y);
    this.ghostLine.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
    this.ghostLine.stroke({ width: strokeWidth, color: GHOST_COLOR, alpha: 0.9 });

    this.ghostLine.circle(endX, endY, GHOST_ENDPOINT_RADIUS / scale);
    this.ghostLine.fill({ color: GHOST_COLOR, alpha: 0.9 });
  }
}
