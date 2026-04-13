import type { Viewport } from "pixi-viewport";
import { MIN_ZOOM, MAX_ZOOM } from "./viewport-setup";

const ZOOM_SENSITIVITY = 0.01;

export interface ZoomHandlerContext {
  readonly onZoom: (callback: (scale: number) => void) => void;
  readonly onPan: (callback: () => void) => void;
  readonly cleanup: () => void;
}

export function setupZoomHandler(
  viewport: Viewport,
  canvasEl: HTMLCanvasElement,
): ZoomHandlerContext {
  const zoomCallbacks: Array<(scale: number) => void> = [];
  const panCallbacks: Array<() => void> = [];

  // TODO: passive: false blocks all wheel scroll on the canvas.
  // Acceptable for full-screen canvas; revisit when embedding as a page component.
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

  let lastNotifiedScale = viewport.scale.x;
  const handleZoom = () => {
    const scale = viewport.scale.x;
    const quantized = Math.round(scale * 10) / 10;
    if (quantized === Math.round(lastNotifiedScale * 10) / 10) return;
    lastNotifiedScale = scale;
    for (const cb of zoomCallbacks) cb(scale);
  };
  viewport.on("zoomed", handleZoom);

  const handlePan = () => {
    for (const cb of panCallbacks) cb();
  };
  viewport.on("moved", handlePan);

  return {
    onZoom: (callback) => { zoomCallbacks.push(callback); },
    onPan: (callback) => { panCallbacks.push(callback); },
    cleanup: () => {
      zoomCallbacks.length = 0;
      panCallbacks.length = 0;
      canvasEl.removeEventListener("wheel", onWheel);
      viewport.off("zoomed", handleZoom);
      viewport.off("moved", handlePan);
    },
  };
}
