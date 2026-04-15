import type { CanvasElement } from "../types";
import type { ReadonlyElementRegistry } from "../registry/element-registry";
import type { Command } from "./command";
import type { EventDescriptor } from "../events/event-emitter";

export interface ResizeRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ResizeCommandOpts {
  readonly elementId: string;
  readonly registry: ReadonlyElementRegistry;
  readonly target: ResizeRect;
  readonly sync: (el: CanvasElement) => void;
  readonly sessionId: string;
  /** Supply when the element has already been mutated before command creation */
  readonly previous?: ResizeRect & { readonly expandedHeight?: number | null };
}

export class ResizeCommand implements Command {
  readonly type = "resize";
  readonly sessionId: string;
  private readonly elementId: string;
  private readonly registry: ReadonlyElementRegistry;
  private readonly sync: (el: CanvasElement) => void;
  private readonly oldRect: ResizeRect;
  private readonly newRect: ResizeRect;
  private readonly oldExpandedHeight: number | null;
  private readonly newExpandedHeight: number | null;

  constructor(opts: ResizeCommandOpts) {
    this.elementId = opts.elementId;
    this.registry = opts.registry;
    this.sync = opts.sync;
    this.sessionId = opts.sessionId;
    this.newRect = opts.target;

    const el = opts.registry.getElementOrThrow(opts.elementId);
    this.oldRect = opts.previous
      ? { x: opts.previous.x, y: opts.previous.y, width: opts.previous.width, height: opts.previous.height }
      : { x: el.x, y: el.y, width: el.width, height: el.height };

    if (el.type === "group" && !el.meta.collapsed) {
      this.oldExpandedHeight = opts.previous?.expandedHeight ?? el.meta.expandedHeight;
      this.newExpandedHeight = opts.target.height;
    } else {
      this.oldExpandedHeight = null;
      this.newExpandedHeight = null;
    }
  }

  execute(): void {
    this.applyRect(this.newRect, this.newExpandedHeight);
  }

  undo(): void {
    this.applyRect(this.oldRect, this.oldExpandedHeight);
  }

  getDomainEvents(): readonly EventDescriptor[] {
    const el = this.registry.getElementOrThrow(this.elementId);
    return [{ event: "element:resize", data: { id: this.elementId, width: el.width, height: el.height } }];
  }

  merge(other: Command): Command | null {
    if (other instanceof ResizeCommand && other.sessionId === this.sessionId) {
      return new ResizeCommand({
        elementId: this.elementId,
        registry: this.registry,
        target: other.newRect,
        sync: this.sync,
        sessionId: this.sessionId,
        previous: { ...this.oldRect, expandedHeight: this.oldExpandedHeight },
      });
    }
    return null;
  }

  private applyRect(rect: ResizeRect, expandedHeight: number | null): void {
    const el = this.registry.getElementOrThrow(this.elementId);
    el.x = rect.x;
    el.y = rect.y;
    el.width = rect.width;
    el.height = rect.height;
    if (expandedHeight !== null && el.type === "group") {
      el.meta.expandedHeight = expandedHeight;
    }
    this.sync(el);
  }
}
