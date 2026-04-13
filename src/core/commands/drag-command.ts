import type { CanvasElement } from "../types";
import type { ElementRegistry } from "../registry/element-registry";
import type { Command } from "./command";
import { applyParentChange } from "../hierarchy/group-ops";

type PositionMap = ReadonlyMap<string, { readonly x: number; readonly y: number }>;

export class DragCommand implements Command {
  readonly type = "drag";

  constructor(
    private readonly elementId: string,
    private readonly registry: ElementRegistry,
    private readonly startPositions: PositionMap,
    private readonly finalPositions: PositionMap,
    private readonly sync: (el: CanvasElement) => void,
    _sessionId: string,
    private readonly oldParent: string | null,
    private readonly newParent: string | null,
  ) {}

  execute(): void {
    for (const [id, pos] of this.finalPositions) {
      const el = this.registry.getElementOrThrow(id);
      el.x = pos.x; el.y = pos.y; this.sync(el);
    }
    if (this.oldParent !== this.newParent) {
      applyParentChange(this.elementId, this.newParent, this.registry, this.sync);
    }
  }

  undo(): void {
    for (const [id, pos] of this.startPositions) {
      const el = this.registry.getElementOrThrow(id);
      el.x = pos.x; el.y = pos.y; this.sync(el);
    }
    if (this.oldParent !== this.newParent) {
      applyParentChange(this.elementId, this.oldParent, this.registry, this.sync);
    }
  }
}
