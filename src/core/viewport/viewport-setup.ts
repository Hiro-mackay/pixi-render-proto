import { Application, Text, TextStyle, Ticker } from "pixi.js";
import { Viewport } from "pixi-viewport";
import type { EngineOptions } from "../types";
import { setupZoomHandler } from "./zoom-handler";

declare global {
  interface Window {
    __PIXI_APP__: Application | null;
  }
}

const BG_COLOR = 0x1a1a2e;
export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 16;
const WORLD_SIZE = 8000;
const FPS_SAMPLE_INTERVAL = 30;

export interface ViewportContext {
  readonly app: Application;
  readonly viewport: Viewport;
  readonly getScale: () => number;
  readonly onZoom: (callback: (scale: number) => void) => void;
  readonly onPan: (callback: () => void) => void;
  readonly destroy: () => void;
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

  const zoomHandler = setupZoomHandler(viewport, app.canvas as HTMLCanvasElement);
  cleanupFns.push(zoomHandler.cleanup);

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
    onZoom: zoomHandler.onZoom,
    onPan: zoomHandler.onPan,
    destroy: () => {
      app.ticker.stop();
      destroyAll();
      app.destroy(true, { children: true });
    },
  };
}
