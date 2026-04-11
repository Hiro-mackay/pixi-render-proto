import type { Redrawable } from "../types";

export class RedrawManager {
  private items = new Set<Redrawable>();
  private dirty = new Set<Redrawable>();

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

  clear(): void {
    this.items.clear();
    this.dirty.clear();
  }
}
