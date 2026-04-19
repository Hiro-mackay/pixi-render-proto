import type { FederatedPointerEvent } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import { getPortPosition } from "../elements/port-renderer";
import type { CanvasElement, Side } from "../types";
import type { EdgeCreator } from "./edge-creator";

const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];

export function enablePortDrag(
  element: CanvasElement,
  viewport: Viewport,
  getScale: () => number,
  edgeCreator: EdgeCreator,
): () => void {
  const portsContainer = element.container.children.find((c) => c.label === "ports");
  if (!portsContainer) return () => {};

  const cleanups: (() => void)[] = [];

  for (const side of SIDES) {
    const portContainer = portsContainer.children.find((c) => c.label === side);
    if (!portContainer) continue;

    const onPointerDown = (e: FederatedPointerEvent) => {
      e.stopPropagation();
      const scale = getScale();
      const portPos = getPortPosition(side, element.width, element.height, scale);
      const anchorX = element.x + portPos.x;
      const anchorY = element.y + portPos.y;
      edgeCreator.start(element.id, side, anchorX, anchorY);

      const detachListeners = () => {
        viewport.off("globalpointermove", onGlobalMove);
        viewport.off("pointerup", onGlobalUp);
        viewport.off("pointerupoutside", onGlobalUp);
      };

      const onGlobalMove = (me: FederatedPointerEvent) => {
        if (!edgeCreator.isActive()) {
          detachListeners();
          return;
        }
        const world = viewport.toWorld(me.global.x, me.global.y);
        edgeCreator.updateCursor(world.x, world.y);
      };

      const onGlobalUp = (ue: FederatedPointerEvent) => {
        detachListeners();
        if (!edgeCreator.isActive()) return;
        edgeCreator.finishAt(ue.global.x, ue.global.y);
      };

      viewport.on("globalpointermove", onGlobalMove);
      viewport.on("pointerup", onGlobalUp);
      viewport.on("pointerupoutside", onGlobalUp);
    };

    portContainer.on("pointerdown", onPointerDown);
    cleanups.push(() => portContainer.off("pointerdown", onPointerDown));
  }

  return () => {
    for (const fn of cleanups) fn();
  };
}
