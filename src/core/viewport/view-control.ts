import type { Viewport } from "pixi-viewport";
import type { ReadonlyElementRegistry } from "../registry/element-registry";
import { MIN_ZOOM, MAX_ZOOM } from "./viewport-setup";

export function setViewportZoom(viewport: Viewport, scale: number): void {
  const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
  viewport.setZoom(clamped, true);
}

export function centerViewportOn(viewport: Viewport, x: number, y: number): void {
  viewport.moveCenter(x, y);
}

export function fitViewportToContent(
  viewport: Viewport,
  registry: ReadonlyElementRegistry,
  padding = 50,
): void {
  const elements = registry.getAllElements();
  if (elements.size === 0) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const el of elements.values()) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }

  const contentW = maxX - minX + padding * 2;
  const contentH = maxY - minY + padding * 2;
  const scaleX = viewport.screenWidth / contentW;
  const scaleY = viewport.screenHeight / contentH;
  const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(scaleX, scaleY)));

  viewport.setZoom(scale, true);
  viewport.moveCenter(minX + (maxX - minX) / 2, minY + (maxY - minY) / 2);
}
