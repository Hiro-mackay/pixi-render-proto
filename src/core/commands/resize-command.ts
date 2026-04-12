import type { CanvasElement } from "../types";
import type { Command } from "./command";

export class ResizeCommand implements Command {
  readonly type = "resize";

  constructor(
    private readonly element: CanvasElement,
    private readonly newX: number,
    private readonly newY: number,
    private readonly newW: number,
    private readonly newH: number,
    private readonly sync: (el: CanvasElement) => void,
    readonly sessionId: string,
    private readonly oldX = element.x,
    private readonly oldY = element.y,
    private readonly oldW = element.width,
    private readonly oldH = element.height,
  ) {}

  execute(): void {
    this.element.x = this.newX;
    this.element.y = this.newY;
    this.element.width = this.newW;
    this.element.height = this.newH;
    this.sync(this.element);
  }

  undo(): void {
    this.element.x = this.oldX;
    this.element.y = this.oldY;
    this.element.width = this.oldW;
    this.element.height = this.oldH;
    this.sync(this.element);
  }

  merge(other: Command): Command | null {
    if (other instanceof ResizeCommand && other.sessionId === this.sessionId) {
      return new ResizeCommand(
        this.element, other.newX, other.newY, other.newW, other.newH,
        this.sync, this.sessionId,
        this.oldX, this.oldY, this.oldW, this.oldH,
      );
    }
    return null;
  }
}
