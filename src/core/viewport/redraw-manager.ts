import { Container, Text } from "pixi.js";
import type { Redrawable } from "../types";
import { hasRedraw } from "../types";

const MAX_TEXT_RESOLUTION = 8;

export class RedrawManager {
  private items = new Set<Redrawable>();
  private dirty = new Set<Redrawable>();
  private textItems = new Set<Text>();

  register(item: Redrawable): void {
    this.items.add(item);
  }

  unregister(item: Redrawable): void {
    this.items.delete(item);
    this.dirty.delete(item);
  }

  markDirty(item: Redrawable): void {
    if (this.items.has(item)) {
      this.dirty.add(item);
    }
  }

  markAllDirty(): void {
    for (const item of this.items) {
      this.dirty.add(item);
    }
  }

  flush(): void {
    for (const item of this.dirty) {
      if (item.visible !== false) {
        item.__redraw?.();
      }
    }
    this.dirty.clear();
  }

  registerTree(container: Container): void {
    this.walkTree(container, (r) => this.register(r), (t) => this.textItems.add(t));
  }

  unregisterTree(container: Container): void {
    this.walkTree(container, (r) => this.unregister(r), (t) => this.textItems.delete(t));
  }

  private lastTargetRes = 0;

  updateTextResolutions(scale: number): void {
    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    const targetRes = Math.min(Math.ceil(scale * dpr), MAX_TEXT_RESOLUTION);
    if (targetRes === this.lastTargetRes) return;
    this.lastTargetRes = targetRes;
    for (const text of this.textItems) {
      if (text.resolution !== targetRes) {
        text.resolution = targetRes;
      }
    }
  }

  markTreeDirty(container: Container): void {
    this.walkTree(container, (r) => { if (this.items.has(r)) this.dirty.add(r); }, () => {});
  }

  clear(): void {
    this.items.clear();
    this.dirty.clear();
    this.textItems.clear();
  }

  private walkTree(c: Container, fn: (r: Redrawable) => void, textFn: (t: Text) => void): void {
    if (c instanceof Text) textFn(c);
    if (hasRedraw(c)) fn(c as Redrawable);
    for (const child of c.children) {
      if (child instanceof Container) this.walkTree(child, fn, textFn);
    }
  }
}
