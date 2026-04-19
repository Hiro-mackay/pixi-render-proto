import type { Container, FederatedPointerEvent } from "pixi.js";
import { Graphics } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import { computeOptimalSides, getFixedSideAnchor, getNearestSide } from "../geometry/anchor";
import { findNodeAt, resolveVisibleElement } from "../geometry/hit-test";
import type { ReadonlyElementRegistry } from "../registry/element-registry";
import { ACCENT_COLOR, type CanvasEdge, type Rect, type Side } from "../types";
import type { ViewportPauseController } from "../viewport/pause-controller";
import { drawGhostLine, drawHighlight } from "./ghost-graphics";

const HANDLE_RADIUS = 6;
const HANDLE_HIT_RADIUS = 14;
const HANDLE_COLOR = ACCENT_COLOR;

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

export interface ReconnectHandleControls {
  readonly destroy: () => void;
  readonly reposition: () => void;
}

export function createReconnectHandles(opts: ReconnectHandleOptions): ReconnectHandleControls {
  const { edge, layer, viewport, registry, getScale, ghostLayer, onReconnect, pauseCtrl } = opts;
  const sourceHandle = createEndpointHandle(getScale);
  const targetHandle = createEndpointHandle(getScale);
  layer.addChild(sourceHandle);
  layer.addChild(targetHandle);

  positionBothHandles(sourceHandle, targetHandle, edge, registry, getScale);

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
    const movingNodeId = endpoint === "source" ? edge.sourceId : edge.targetId;
    const fixedEl = registry.getElement(fixedNodeId);
    const movingEl = registry.getElement(movingNodeId);
    if (!fixedEl) return;

    const fixedNodeSide = movingEl
      ? computeOptimalSides(fixedEl, movingEl).srcSide
      : fixedEndpoint === "source"
        ? edge.sourceSide
        : edge.targetSide;

    dragging = true;
    if (pauseCtrl) {
      pauseCtrl.acquire();
    } else {
      viewport.pause = true;
    }

    const anchor = getFixedSideAnchor(fixedEl, fixedNodeSide);
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
          const side = getNearestSide(targetEl, cursorWorld);
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
    if (pauseCtrl) {
      pauseCtrl.release();
    } else {
      viewport.pause = false;
    }
    ghostLine.clear();
    ghostLine.visible = false;
    highlight.clear();
    highlight.visible = false;

    if (!destroyed) {
      sourceHandle.visible = true;
      targetHandle.visible = true;
      positionBothHandles(sourceHandle, targetHandle, edge, registry, getScale);
    }
  }

  function updateHighlightGraphic() {
    const el = highlightedNodeId ? registry.getElement(highlightedNodeId) : null;
    drawHighlight(highlight, el ?? null, getScale(), HANDLE_COLOR);
  }

  function redrawGhostLine() {
    const snapTarget = highlightedNodeId ? (registry.getElement(highlightedNodeId) ?? null) : null;
    drawGhostLine(
      ghostLine,
      fixedAnchor,
      fixedSide,
      cursorWorld,
      snapTarget,
      getScale(),
      HANDLE_COLOR,
    );
  }

  sourceHandle.on("pointerdown", (e: FederatedPointerEvent) => startDrag("source", e));
  targetHandle.on("pointerdown", (e: FederatedPointerEvent) => startDrag("target", e));

  return {
    reposition() {
      if (destroyed || dragging) return;
      positionBothHandles(sourceHandle, targetHandle, edge, registry, getScale);
    },
    destroy() {
      destroyed = true;
      if (dragging) finishDrag();
      sourceHandle.removeFromParent();
      sourceHandle.destroy();
      targetHandle.removeFromParent();
      targetHandle.destroy();
      ghostLine.removeFromParent();
      ghostLine.destroy();
      highlight.removeFromParent();
      highlight.destroy();
    },
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

function positionBothHandles(
  sourceHandle: Graphics,
  targetHandle: Graphics,
  edge: CanvasEdge,
  registry: ReadonlyElementRegistry,
  getScale: () => number,
): void {
  const srcVisId = resolveVisibleElement(edge.sourceId, registry);
  const tgtVisId = resolveVisibleElement(edge.targetId, registry);
  const srcEl = srcVisId ? registry.getElement(srcVisId) : registry.getElement(edge.sourceId);
  const tgtEl = tgtVisId ? registry.getElement(tgtVisId) : registry.getElement(edge.targetId);

  let srcSide: Side = edge.sourceSide;
  let tgtSide: Side = edge.targetSide;
  if (srcEl && tgtEl) {
    const optimal = computeOptimalSides(srcEl, tgtEl);
    srcSide = optimal.srcSide;
    tgtSide = optimal.tgtSide;
  }

  if (srcEl) drawHandle(sourceHandle, srcEl, srcSide, getScale);
  if (tgtEl) drawHandle(targetHandle, tgtEl, tgtSide, getScale);
}

function drawHandle(handle: Graphics, el: Rect, side: Side, getScale: () => number): void {
  const anchor = getFixedSideAnchor(el, side);
  handle.position.set(anchor.x, anchor.y);
  const scale = getScale();
  handle.clear();
  handle.circle(0, 0, HANDLE_RADIUS / scale);
  handle.fill({ color: 0xffffff });
  handle.stroke({ width: 1.5 / scale, color: HANDLE_COLOR });
}
