import { Graphics } from "pixi.js";
import type { Container, FederatedPointerEvent } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import type { CanvasEdge, Side } from "../types";
import type { ReadonlyElementRegistry } from "../registry/element-registry";
import { getFixedSideAnchor, getNearestSide } from "../geometry/anchor";
import { computeBezierControlPoints } from "../geometry/bezier";
import { findNodeAt, resolveVisibleElement } from "../geometry/hit-test";
import type { ViewportPauseController } from "../viewport/pause-controller";

const HANDLE_RADIUS = 6;
const HANDLE_HIT_RADIUS = 14;
const HANDLE_COLOR = 0x3b82f6;
const GHOST_STROKE_WIDTH = 1.5;
const GHOST_ENDPOINT_RADIUS = 4;
const HIGHLIGHT_PAD = 4;
const HIGHLIGHT_STROKE_WIDTH = 2.5;

export interface ReconnectResult {
  readonly edgeId: string;
  readonly endpoint: "source" | "target";
  readonly newNodeId: string;
  readonly newSide: Side;
}

export interface ReconnectHandleOptions {
  readonly edge: CanvasEdge;
  readonly layer: Container;
  readonly viewport: Viewport;
  readonly registry: ReadonlyElementRegistry;
  readonly getScale: () => number;
  readonly ghostLayer: Container;
  readonly onReconnect: (result: ReconnectResult) => void;
  readonly pauseCtrl?: ViewportPauseController;
}

export function createReconnectHandles(opts: ReconnectHandleOptions): () => void {
  const { edge, layer, viewport, registry, getScale, ghostLayer, onReconnect, pauseCtrl } = opts;
  const sourceHandle = createEndpointHandle(getScale);
  const targetHandle = createEndpointHandle(getScale);
  layer.addChild(sourceHandle);
  layer.addChild(targetHandle);

  positionHandle(sourceHandle, edge, "source", registry, getScale);
  positionHandle(targetHandle, edge, "target", registry, getScale);

  const ghostLine = new Graphics();
  ghostLine.visible = false;
  ghostLayer.addChild(ghostLine);

  const highlight = new Graphics();
  highlight.visible = false;
  ghostLayer.addChild(highlight);

  let dragging = false;
  let fixedAnchor = { x: 0, y: 0 };
  let fixedSide: Side = "right";
  let highlightedNodeId: string | null = null;
  let cursorWorld = { x: 0, y: 0 };
  let detachDragListeners: (() => void) | null = null;
  let destroyed = false;

  function startDrag(endpoint: "source" | "target", e: FederatedPointerEvent) {
    if (destroyed) return;
    e.stopPropagation();

    // Fixed end is the opposite endpoint
    const fixedEndpoint = endpoint === "source" ? "target" : "source";
    const fixedNodeId = fixedEndpoint === "source" ? edge.sourceId : edge.targetId;
    const fixedNodeSide = fixedEndpoint === "source" ? edge.sourceSide : edge.targetSide;
    const fixedEl = registry.getElement(fixedNodeId);
    if (!fixedEl) return;

    dragging = true;
    pauseCtrl ? pauseCtrl.acquire() : (viewport.pause = true);

    const anchor = getFixedSideAnchor(
      { x: fixedEl.x, y: fixedEl.y, width: fixedEl.width, height: fixedEl.height },
      fixedNodeSide,
    );
    fixedAnchor = { x: anchor.x, y: anchor.y };
    fixedSide = fixedNodeSide;

    ghostLine.visible = true;
    sourceHandle.visible = false;
    targetHandle.visible = false;

    const onMove = (me: FederatedPointerEvent) => {
      if (!dragging) return;
      const world = viewport.toWorld(me.global.x, me.global.y);
      cursorWorld = { x: world.x, y: world.y };

      const excludeId = endpoint === "source" ? edge.targetId : edge.sourceId;
      const candidate = findNodeAt(cursorWorld, registry, excludeId);
      const newHighlightId = candidate?.id ?? null;

      if (newHighlightId !== highlightedNodeId) {
        highlightedNodeId = newHighlightId;
        updateHighlightGraphic();
      }
      redrawGhostLine();
    };

    const onUp = () => {
      if (!dragging) return;
      const hadHighlight = highlightedNodeId;

      // Detach listeners FIRST, before any callbacks that may destroy us
      finishDrag();

      if (hadHighlight) {
        const targetEl = registry.getElement(hadHighlight);
        if (targetEl) {
          const side = getNearestSide(
            { x: targetEl.x, y: targetEl.y, width: targetEl.width, height: targetEl.height },
            cursorWorld,
          );
          onReconnect({
            edgeId: edge.id,
            endpoint,
            newNodeId: hadHighlight,
            newSide: side,
          });
        }
      }
    };

    detachDragListeners = () => {
      viewport.off("globalpointermove", onMove);
      viewport.off("pointerup", onUp);
      viewport.off("pointerupoutside", onUp);
      detachDragListeners = null;
    };

    viewport.on("globalpointermove", onMove);
    viewport.on("pointerup", onUp);
    viewport.on("pointerupoutside", onUp);
  }

  function finishDrag() {
    // Detach listeners before resetting state
    detachDragListeners?.();
    dragging = false;
    highlightedNodeId = null;
    pauseCtrl ? pauseCtrl.release() : (viewport.pause = false);
    ghostLine.clear();
    ghostLine.visible = false;
    highlight.clear();
    highlight.visible = false;

    if (!destroyed) {
      sourceHandle.visible = true;
      targetHandle.visible = true;
      positionHandle(sourceHandle, edge, "source", registry, getScale);
      positionHandle(targetHandle, edge, "target", registry, getScale);
    }
  }

  function updateHighlightGraphic() {
    highlight.clear();
    if (!highlightedNodeId) {
      highlight.visible = false;
      return;
    }
    const el = registry.getElement(highlightedNodeId);
    if (!el) { highlight.visible = false; return; }
    const scale = getScale();
    const pad = HIGHLIGHT_PAD / scale;
    const strokeW = HIGHLIGHT_STROKE_WIDTH / scale;
    highlight.roundRect(el.x - pad, el.y - pad, el.width + pad * 2, el.height + pad * 2, 10);
    highlight.stroke({ width: strokeW, color: HANDLE_COLOR, alpha: 0.8 });
    highlight.visible = true;
  }

  function redrawGhostLine() {
    const scale = getScale();
    let endX = cursorWorld.x;
    let endY = cursorWorld.y;
    let endSide: Side | null = null;

    if (highlightedNodeId) {
      const el = registry.getElement(highlightedNodeId);
      if (el) {
        const side = getNearestSide(
          { x: el.x, y: el.y, width: el.width, height: el.height },
          cursorWorld,
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
      fixedAnchor.x, fixedAnchor.y, fixedSide,
      endX, endY, endSide,
    );

    ghostLine.clear();
    ghostLine.moveTo(fixedAnchor.x, fixedAnchor.y);
    ghostLine.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
    ghostLine.stroke({ width: GHOST_STROKE_WIDTH / scale, color: HANDLE_COLOR, alpha: 0.9 });
    ghostLine.circle(endX, endY, GHOST_ENDPOINT_RADIUS / scale);
    ghostLine.fill({ color: HANDLE_COLOR, alpha: 0.9 });
  }

  sourceHandle.on("pointerdown", (e: FederatedPointerEvent) => startDrag("source", e));
  targetHandle.on("pointerdown", (e: FederatedPointerEvent) => startDrag("target", e));

  return () => {
    destroyed = true;
    // Clean up any active drag session first
    if (dragging) finishDrag();
    sourceHandle.removeFromParent();
    sourceHandle.destroy();
    targetHandle.removeFromParent();
    targetHandle.destroy();
    ghostLine.removeFromParent();
    ghostLine.destroy();
    highlight.removeFromParent();
    highlight.destroy();
  };
}

function createEndpointHandle(getScale: () => number): Graphics {
  const g = new Graphics();
  g.eventMode = "static";
  g.cursor = "crosshair";
  const scale = getScale();
  g.circle(0, 0, HANDLE_RADIUS / scale);
  g.fill({ color: 0xffffff });
  g.stroke({ width: 1.5 / scale, color: HANDLE_COLOR });
  const hitR = HANDLE_HIT_RADIUS;
  g.hitArea = {
    contains: (hx: number, hy: number) => hx * hx + hy * hy < hitR * hitR,
  };
  return g;
}

function positionHandle(
  handle: Graphics,
  edge: CanvasEdge,
  endpoint: "source" | "target",
  registry: ReadonlyElementRegistry,
  getScale: () => number,
): void {
  const nodeId = endpoint === "source" ? edge.sourceId : edge.targetId;
  const side = endpoint === "source" ? edge.sourceSide : edge.targetSide;
  const visibleId = resolveVisibleElement(nodeId, registry);
  const el = visibleId ? registry.getElement(visibleId) : registry.getElement(nodeId);
  if (!el) return;
  const anchor = getFixedSideAnchor(
    { x: el.x, y: el.y, width: el.width, height: el.height }, side,
  );
  handle.position.set(anchor.x, anchor.y);

  const scale = getScale();
  handle.clear();
  handle.circle(0, 0, HANDLE_RADIUS / scale);
  handle.fill({ color: 0xffffff });
  handle.stroke({ width: 1.5 / scale, color: HANDLE_COLOR });
}
