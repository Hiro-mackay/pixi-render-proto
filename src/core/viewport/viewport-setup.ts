import {
  Application,
  Container,
  Text,
  TextStyle,
  Ticker,
} from "pixi.js";
import { Viewport } from "pixi-viewport";
import type { EngineOptions, Redrawable } from "../types";

declare global {
  interface Window {
    __PIXI_APP__: Application | null;
  }
}

const BG_COLOR = 0x1a1a2e;
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 16;
const WORLD_SIZE = 8000;
const ZOOM_SENSITIVITY = 0.01;
const MAX_TEXT_RESOLUTION = 8;
const FPS_SAMPLE_INTERVAL = 30;

export interface ViewportContext {
  readonly app: Application;
  readonly viewport: Viewport;
  readonly getScale: () => number;
  readonly destroy: () => void;
}

function updateTextResolutions(container: Container, scale: number): void {
  const dpr = window.devicePixelRatio || 1;
  const targetRes = Math.min(Math.ceil(scale * dpr), MAX_TEXT_RESOLUTION);

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

function walkRedraw(container: Container): void {
  if (!container.visible) return;
  const node = container as Redrawable;
  if (typeof node.__redraw === "function") {
    node.__redraw();
  }
  for (const child of container.children) {
    if (child instanceof Container) {
      walkRedraw(child);
    }
  }
}

export async function initViewport(
  container: HTMLElement,
  options: EngineOptions = {},
): Promise<ViewportContext> {
  const debug = options.debug ?? false;
  const cleanupFns: Array<() => void> = [];

  const destroyAll = () => {
    for (const fn of cleanupFns) fn();
  };

  const app = new Application();

  await app.init({
    background: BG_COLOR,
    resizeTo: container,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preserveDrawingBuffer: debug,
  });

  if (options.signal?.aborted) {
    app.destroy(true, { children: true });
    throw new DOMException("Aborted", "AbortError");
  }

  container.appendChild(app.canvas);

  const viewport = new Viewport({
    screenWidth: container.clientWidth,
    screenHeight: container.clientHeight,
    worldWidth: WORLD_SIZE,
    worldHeight: WORLD_SIZE,
    events: app.renderer.events,
  });

  app.stage.addChild(viewport);
  viewport.drag().pinch().decelerate();
  viewport.clampZoom({ minScale: MIN_ZOOM, maxScale: MAX_ZOOM });

  const canvasEl = app.canvas;
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
  cleanupFns.push(() => canvasEl.removeEventListener("wheel", onWheel));

  let lastQuantizedScale = 0;
  const handleZoom = () => {
    walkRedraw(viewport);

    const quantized = Math.round(viewport.scale.x * 10) / 10;
    if (quantized !== lastQuantizedScale) {
      lastQuantizedScale = quantized;
      updateTextResolutions(viewport, quantized);
    }
  };
  viewport.on("zoomed", handleZoom);
  cleanupFns.push(() => viewport.off("zoomed", handleZoom));

  if (debug) {
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
    const fpsCallback = () => {
      if (++frameCount % FPS_SAMPLE_INTERVAL !== 0) return;
      const fps = Math.round(Ticker.shared.FPS);
      if (fps !== lastFps) {
        lastFps = fps;
        fpsText.text = `FPS: ${fps}`;
      }
    };
    app.ticker.add(fpsCallback);
    cleanupFns.push(() => app.ticker.remove(fpsCallback));

    window.__PIXI_APP__ = app;
    cleanupFns.push(() => {
      window.__PIXI_APP__ = null;
    });
  }

  let resizeRaf = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      app.renderer.resize(container.clientWidth, container.clientHeight);
      viewport.resize(container.clientWidth, container.clientHeight);
    });
  });
  observer.observe(container);
  cleanupFns.push(() => {
    cancelAnimationFrame(resizeRaf);
    observer.disconnect();
  });

  return {
    app,
    viewport,
    getScale: () => viewport.scale.x,
    destroy: () => {
      destroyAll();
      app.ticker.stop();
      app.destroy(true, { children: true });
    },
  };
}
