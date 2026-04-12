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

export function enableResizeHandles(
  handles: Container[],
  selection: SelectionState,
  viewport: Viewport,
  registry: ElementRegistry,
  history: CommandHistory,
  getScale: () => number,
  sync: (el: CanvasElement) => void,
): () => void {
  const cleanups: (() => void)[] = [];

  for (let i = 0; i < handles.length; i++) {
    const handle = handles[i]!;
    let anchor = { x: 0, y: 0 };
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

      type P = { x: number; y: number };
      const corners: [P, P, P, P] = [
        { x: element.x + element.width, y: element.y + element.height },
        { x: element.x, y: element.y + element.height },
        { x: element.x + element.width, y: element.y },
        { x: element.x, y: element.y },
      ];
      anchor = corners[i as 0 | 1 | 2 | 3];
    };

    const onPointerMove = (e: FederatedPointerEvent) => {
      if (!active || !element) return;

      const world = viewport.toWorld(e.global.x, e.global.y);
      const rawW = Math.abs(world.x - anchor.x);
      const rawH = Math.abs(world.y - anchor.y);
      const newW = Math.max(rawW, MIN_WIDTH);
      const newH = Math.max(rawH, MIN_HEIGHT);
      const newX = world.x >= anchor.x ? anchor.x : anchor.x - newW;
      const newY = world.y >= anchor.y ? anchor.y : anchor.y - newH;

      element.x = newX;
      element.y = newY;
      element.width = newW;
      element.height = newH;
      element.container.x = newX;
      element.container.y = newY;
      sync(element);
      selection.update();
    };

    const onPointerUp = () => {
      if (!active || !element) return;
      active = false;
      selection.setResizing(false);
      viewport.pause = false;

      history.record(
        new ResizeCommand(element, element.x, element.y, element.width, element.height, sync, sessionId,
          startRect.x, startRect.y, startRect.w, startRect.h),
      );

      if (element.type === "group" && element.meta && "expandedHeight" in element.meta) {
        (element.meta as { expandedHeight: number }).expandedHeight = element.height;
      }

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
