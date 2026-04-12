import type { CanvasElement } from "../types";
import type { Command } from "./command";

export class MoveCommand implements Command {
  readonly type = "move";

  constructor(
    private readonly element: CanvasElement,
    private readonly newX: number,
    private readonly newY: number,
    private readonly sync: (el: CanvasElement) => void,
    readonly sessionId: string,
    private readonly oldX = element.x,
    private readonly oldY = element.y,
  ) {}

  execute(): void {
    this.element.x = this.newX;
    this.element.y = this.newY;
    this.sync(this.element);
  }

  undo(): void {
    this.element.x = this.oldX;
    this.element.y = this.oldY;
    this.sync(this.element);
  }

  merge(other: Command): Command | null {
    if (other instanceof MoveCommand && other.sessionId === this.sessionId) {
      return new MoveCommand(
        this.element, other.newX, other.newY, this.sync, this.sessionId,
        this.oldX, this.oldY,
      );
    }
    return null;
  }
}
