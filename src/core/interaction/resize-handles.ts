import type { Container, FederatedPointerEvent } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import type { CanvasElement } from "../types";
import type { ElementRegistry } from "../registry/element-registry";
import type { CommandHistory } from "../commands/command";
import { ResizeCommand } from "../commands/resize-command";
import type { SelectionState } from "./selection-state";
import { updateEdgeGraphics } from "../elements/edge-renderer";

const MIN_WIDTH = 60;
const MIN_HEIGHT = 40;

// Handle indices: 0-3 corners (NW, NE, SW, SE), 4-7 edges (N, E, S, W)
type HandleAxis = "both" | "vertical" | "horizontal";
type AnchorSide = "left" | "right" | "none";
type AnchorVertical = "top" | "bottom" | "none";

interface HandleMeta {
  readonly axis: HandleAxis;
  readonly anchorX: AnchorSide;
  readonly anchorY: AnchorVertical;
}

const HANDLE_META: readonly HandleMeta[] = [
  { axis: "both",       anchorX: "right", anchorY: "bottom" }, // NW
  { axis: "both",       anchorX: "left",  anchorY: "bottom" }, // NE
  { axis: "both",       anchorX: "right", anchorY: "top" },    // SW
  { axis: "both",       anchorX: "left",  anchorY: "top" },    // SE
  { axis: "vertical",   anchorX: "none",  anchorY: "bottom" }, // N
  { axis: "horizontal", anchorX: "left",  anchorY: "none" },   // E
  { axis: "vertical",   anchorX: "none",  anchorY: "top" },    // S
  { axis: "horizontal", anchorX: "right", anchorY: "none" },   // W
] as const;

function snapToGrid(value: number, gridSize: number | undefined): number {
  if (!gridSize) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function enableResizeHandles(
  handles: Container[],
  selection: SelectionState,
  viewport: Viewport,
  registry: ElementRegistry,
  history: CommandHistory,
  getScale: () => number,
  sync: (el: CanvasElement) => void,
  gridSize?: number,
): () => void {
  const cleanups: (() => void)[] = [];

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i]!;
    const meta = HANDLE_META[i]!;
    let anchorX = 0;
    let anchorY = 0;
    let active = false;
    let sessionId = "";
    let element: CanvasElement | null = null;
    let startRect = { x: 0, y: 0, w: 0, h: 0 };

    const onPointerDown = (e: FederatedPointerEvent) => {
      const selectedId = selection.getSelectedId();
      if (!selectedId) return;
      e.stopPropagation();

      element = registry.getElementOrThrow(selectedId);
      startRect = { x: element.x, y: element.y, w: element.width, h: element.height };
      active = true;
      sessionId = crypto.randomUUID();
      selection.setResizing(true);
      viewport.pause = true;

      anchorX = resolveAnchorX(meta, element);
      anchorY = resolveAnchorY(meta, element);
    };

    const onPointerMove = (e: FederatedPointerEvent) => {
      if (!active || !element) return;

      const world = viewport.toWorld(e.global.x, e.global.y);

      let newX = element.x;
      let newY = element.y;
      let newW = element.width;
      let newH = element.height;

      if (meta.axis === "both" || meta.axis === "horizontal") {
        const snappedX = snapToGrid(world.x, gridSize);
        const rawW = Math.abs(snappedX - anchorX);
        newW = Math.max(rawW, MIN_WIDTH);
        newX = snappedX >= anchorX ? anchorX : anchorX - newW;
      }
      if (meta.axis === "both" || meta.axis === "vertical") {
        const snappedY = snapToGrid(world.y, gridSize);
        const rawH = Math.abs(snappedY - anchorY);
        newH = Math.max(rawH, MIN_HEIGHT);
        newY = snappedY >= anchorY ? anchorY : anchorY - newH;
      }

      element.x = newX;
      element.y = newY;
      element.width = newW;
      element.height = newH;
      sync(element);
      selection.update();
    };

    const onPointerUp = () => {
      if (!active || !element) return;
      active = false;
      selection.setResizing(false);
      viewport.pause = false;

      // Preview applies geometry during pointermove; execute() re-applies idempotently.
      // This contract is verified by history-contract.test.ts.
      history.execute(new ResizeCommand({
        elementId: element.id, registry, sessionId, sync,
        target: { x: element.x, y: element.y, width: element.width, height: element.height },
        previous: {
          x: startRect.x, y: startRect.y, width: startRect.w, height: startRect.h,
          expandedHeight: element.type === "group" ? element.meta.expandedHeight : null,
        },
      }));

      for (const edge of registry.getEdgesForNode(element.id)) {
        updateEdgeGraphics(edge, registry, getScale);
      }
      element = null;
    };

    handle.on("pointerdown", onPointerDown);
    handle.on("globalpointermove", onPointerMove);
    handle.on("pointerup", onPointerUp);
    handle.on("pointerupoutside", onPointerUp);

    cleanups.push(() => {
      handle.off("pointerdown", onPointerDown);
      handle.off("globalpointermove", onPointerMove);
      handle.off("pointerup", onPointerUp);
      handle.off("pointerupoutside", onPointerUp);
    });
  }

  return () => {
    for (const fn of cleanups) fn();
  };
}

function resolveAnchorX(meta: HandleMeta, el: CanvasElement): number {
  switch (meta.anchorX) {
    case "left": return el.x;
    case "right": return el.x + el.width;
    case "none": return el.x;
  }
}

function resolveAnchorY(meta: HandleMeta, el: CanvasElement): number {
  switch (meta.anchorY) {
    case "top": return el.y;
    case "bottom": return el.y + el.height;
    case "none": return el.y;
  }
}
