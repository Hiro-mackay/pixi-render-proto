import type { Viewport } from "pixi-viewport";

export class ViewportPauseController {
  private refCount = 0;

  constructor(private readonly viewport: Viewport) {}

  acquire(): void {
    this.refCount++;
    this.viewport.pause = true;
  }

  release(): void {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount === 0) {
      this.viewport.pause = false;
    }
  }
}
