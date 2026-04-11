import { Application, Container, Graphics, Text, TextStyle, Ticker } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { viewState } from "./view-state";

declare global {
  interface Window {
    __PIXI_APP__: Application | null;
  }
}

export type CanvasContext = {
  app: Application;
  viewport: Viewport;
  fpsText: Text;
  addCleanup: (fn: () => void) => void;
  destroy: () => void;
};

function updateTextResolutions(container: Container, scale: number): void {
  const dpr = window.devicePixelRatio || 1;
  const targetRes = Math.min(Math.ceil(scale * dpr), 8);

  const walk = (node: Container) => {
    if (node instanceof Text) {
      if (node.resolution !== targetRes) {
        node.resolution = targetRes;
      }
    }
    for (const child of node.children) {
      if (child instanceof Container) {
        walk(child);
      }
    }
  };
  walk(container);
}

/**
 * Walk the container tree and invoke any `__redraw` callback found on
 * Graphics objects. Used to re-render zoom-invariant strokes when
 * viewState.scale changes.
 */
function walkRedraw(container: Container): void {
  if (!container.visible) return;
  const node = container as Graphics & { __redraw?: () => void };
  if (typeof node.__redraw === "function") {
    node.__redraw();
  }
  for (const child of container.children) {
    if (child instanceof Container) {
      walkRedraw(child);
    }
  }
}

export async function initCanvas(
  container: HTMLElement,
): Promise<CanvasContext> {
  const app = new Application();

  await app.init({
    background: 0x1a1a2e,
    resizeTo: container,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    // Allow reading canvas pixels via drawImage (needed for Playwright tests).
    // Small perf cost, negligible for our use.
    preserveDrawingBuffer: true,
  });

  container.appendChild(app.canvas);

  const viewport = new Viewport({
    screenWidth: container.clientWidth,
    screenHeight: container.clientHeight,
    worldWidth: 8000,
    worldHeight: 8000,
    events: app.renderer.events,
  });

  app.stage.addChild(viewport);

  viewport.drag().pinch().decelerate();

  viewport.clampZoom({ minScale: 0.02, maxScale: 16 });

  // Custom wheel: ctrlKey (pinch) → zoom toward cursor, normal → pan
  const canvasEl = app.canvas;
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();

    if (e.ctrlKey) {
      const rect = canvasEl.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = Math.exp(-e.deltaY * 0.01);
      const worldPosBefore = viewport.toWorld(mouseX, mouseY);

      // Clamp BEFORE setZoom — pixi-viewport's clampZoom runs after the
      // frame, so synchronous position math against scale.x would be off.
      const rawScale = viewport.scale.x * zoomFactor;
      const clampedScale = Math.max(0.02, Math.min(16, rawScale));
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

  // Update text resolution and zoom-invariant strokes on zoom change
  let lastScale = 0;
  const handleZoom = () => {
    viewState.scale = viewport.scale.x;
    walkRedraw(viewport);

    const quantized = Math.round(viewport.scale.x * 10) / 10;
    if (quantized !== lastScale) {
      lastScale = quantized;
      updateTextResolutions(viewport, quantized);
    }
  };
  viewport.on("zoomed", handleZoom);

  const fpsText = new Text({
    text: "FPS: --",
    style: new TextStyle({
      fontFamily: "monospace",
      fontSize: 14,
      fill: 0x00ff88,
    }),
  });
  fpsText.position.set(8, 8);
  app.stage.addChild(fpsText);

  let lastFps = 0;
  let frameCount = 0;
  app.ticker.add(() => {
    if (++frameCount % 30 !== 0) return;
    const fps = Math.round(Ticker.shared.FPS);
    if (fps !== lastFps) {
      lastFps = fps;
      fpsText.text = `FPS: ${fps}`;
    }
  });

  const observer = new ResizeObserver(() => {
    app.renderer.resize(container.clientWidth, container.clientHeight);
    viewport.resize(container.clientWidth, container.clientHeight);
  });
  observer.observe(container);

  const cleanupFns: Array<() => void> = [
    () => observer.disconnect(),
    () => canvasEl.removeEventListener("wheel", onWheel),
    () => viewport.off("zoomed", handleZoom),
  ];

  const ctx: CanvasContext = {
    app,
    viewport,
    fpsText,
    addCleanup: (fn) => cleanupFns.push(fn),
    destroy: () => {
      for (const fn of cleanupFns) fn();
    },
  };

  if (import.meta.env.DEV) {
    window.__PIXI_APP__ = app;
  }

  return ctx;
}

export function destroyCanvas(ctx: CanvasContext): void {
  ctx.destroy();
  ctx.app.ticker.stop();
  ctx.app.destroy(true, { children: true });
  if (import.meta.env.DEV) {
    window.__PIXI_APP__ = null;
  }
}
