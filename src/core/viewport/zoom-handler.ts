import { Container, Text } from "pixi.js";
import type { Viewport } from "pixi-viewport";

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 16;
const ZOOM_SENSITIVITY = 0.01;
const MAX_TEXT_RESOLUTION = 8;

function updateTextResolutions(root: Container, scale: number): void {
  const dpr = window.devicePixelRatio || 1;
  const targetRes = Math.min(Math.ceil(scale * dpr), MAX_TEXT_RESOLUTION);

  const walk = (node: Container) => {
    if (node instanceof Text && node.resolution !== targetRes) {
      node.resolution = targetRes;
    }
    for (const child of node.children) {
      if (child instanceof Container) walk(child);
    }
  };
  walk(root);
}

export interface ZoomHandlerContext {
  readonly onZoom: (callback: () => void) => void;
  readonly cleanup: () => void;
}

export function setupZoomHandler(
  viewport: Viewport,
  canvasEl: HTMLCanvasElement,
): ZoomHandlerContext {
  const zoomCallbacks: Array<() => void> = [];

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey) {
      const rect = canvasEl.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = Math.exp(-e.deltaY * ZOOM_SENSITIVITY);
      const worldPosBefore = viewport.toWorld(mouseX, mouseY);

      const rawScale = viewport.scale.x * zoomFactor;
      const clampedScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, rawScale));
      viewport.setZoom(clampedScale, false);

      const worldPosAfter = viewport.toWorld(mouseX, mouseY);
      viewport.x += (worldPosAfter.x - worldPosBefore.x) * viewport.scale.x;
      viewport.y += (worldPosAfter.y - worldPosBefore.y) * viewport.scale.y;

      viewport.emit("zoomed", { viewport, type: "wheel" });
    } else {
      viewport.x -= e.deltaX;
      viewport.y -= e.deltaY;
      viewport.emit("moved", { viewport, type: "wheel" });
    }
  };
  canvasEl.addEventListener("wheel", onWheel, { passive: false });

  let lastQuantizedScale = 0;
  const handleZoom = () => {
    const quantized = Math.round(viewport.scale.x * 10) / 10;
    if (quantized !== lastQuantizedScale) {
      lastQuantizedScale = quantized;
      updateTextResolutions(viewport, quantized);
    }

    for (const cb of zoomCallbacks) cb();
  };
  viewport.on("zoomed", handleZoom);

  return {
    onZoom: (callback) => { zoomCallbacks.push(callback); },
    cleanup: () => {
      zoomCallbacks.length = 0;
      canvasEl.removeEventListener("wheel", onWheel);
      viewport.off("zoomed", handleZoom);
    },
  };
}
