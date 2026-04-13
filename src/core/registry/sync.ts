import { Container } from "pixi.js";
import type { CanvasElement } from "../types";
import { hasRedraw } from "../types";

export function syncToContainer(element: CanvasElement): void {
  element.container.x = element.x;
  element.container.y = element.y;
  element.container.visible = element.visible;
}

/** @internal */
export function redrawElement(element: CanvasElement): void {
  const walk = (c: Container) => {
    if (hasRedraw(c)) c.__redraw();
    for (const child of c.children) {
      if (child instanceof Container) walk(child);
    }
  };
  walk(element.container);
}

/** @internal */
export function syncElement(element: CanvasElement): void {
  syncToContainer(element);
  redrawElement(element);
}
