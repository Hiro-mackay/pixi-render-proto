import type { CanvasElement } from "../types";
import type { ReadonlyElementRegistry } from "../registry/element-registry";
import type { Command } from "./command";
import type { EventDescriptor } from "../events/event-emitter";

export class MoveCommand implements Command {
  readonly type = "move";
  private readonly oldX: number;
  private readonly oldY: number;

  constructor(
    private readonly elementId: string,
    private readonly registry: ReadonlyElementRegistry,
    private readonly newX: number,
    private readonly newY: number,
    private readonly sync: (el: CanvasElement) => void,
    readonly sessionId: string,
    oldX?: number,
    oldY?: number,
  ) {
    const el = registry.getElementOrThrow(elementId);
    this.oldX = oldX ?? el.x;
    this.oldY = oldY ?? el.y;
  }

  execute(): void {
    const el = this.registry.getElementOrThrow(this.elementId);
    el.x = this.newX;
    el.y = this.newY;
    this.sync(el);
  }

  undo(): void {
    const el = this.registry.getElementOrThrow(this.elementId);
    el.x = this.oldX;
    el.y = this.oldY;
    this.sync(el);
  }

  getDomainEvents(): readonly EventDescriptor[] {
    const el = this.registry.getElementOrThrow(this.elementId);
    return [{ event: "element:move", data: { id: this.elementId, x: el.x, y: el.y } }];
  }

  merge(other: Command): Command | null {
    if (other instanceof MoveCommand && other.sessionId === this.sessionId) {
      return new MoveCommand(
        this.elementId, this.registry, other.newX, other.newY,
        this.sync, this.sessionId, this.oldX, this.oldY,
      );
    }
    return null;
  }
}
