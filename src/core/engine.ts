import type { Viewport } from "pixi-viewport";
import type { EngineOptions } from "./types";
import { initViewport, type ViewportContext } from "./viewport/viewport-setup";

/**
 * Phase 0: lifecycle-only surface.
 * Methods are added as each phase lands.
 */
export interface CanvasEngine {
  readonly viewport: Viewport;
  readonly scale: number;
  destroy(): void;
}

class CanvasEngineImpl implements CanvasEngine {
  private ctx: ViewportContext | null;
  private destroyed = false;

  constructor(ctx: ViewportContext) {
    this.ctx = ctx;
  }

  private getCtx(): ViewportContext {
    if (this.destroyed || !this.ctx) {
      throw new Error("CanvasEngine has been destroyed");
    }
    return this.ctx;
  }

  get viewport(): Viewport {
    return this.getCtx().viewport;
  }

  get scale(): number {
    if (!this.ctx) return 1;
    return this.ctx.getScale();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.ctx?.destroy();
    this.ctx = null;
  }
}

export async function createCanvasEngine(
  container: HTMLElement,
  options: EngineOptions = {},
): Promise<CanvasEngine> {
  if (options.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const ctx = await initViewport(container, options);

  if (options.signal?.aborted) {
    ctx.destroy();
    throw new DOMException("Aborted", "AbortError");
  }

  return new CanvasEngineImpl(ctx);
}
