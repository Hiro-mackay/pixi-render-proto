import type { Command } from "./command";
import type { EventDescriptor } from "../events/event-emitter";
import type { CanvasEdge, Side } from "../types";
import type { ElementRegistry } from "../registry/element-registry";

/** Minimal registry surface needed for reconnection. */
export type ReconnectRegistry = Pick<ElementRegistry, "reconnectEdge" | "getEdgeOrThrow">;

/**
 * In-place reconnection via ElementRegistry.reconnectEdge().
 * Unlike AddRemoveOps (remove+add), this preserves the edge's Graphics objects
 * and only updates connection fields + EdgeIndex atomically.
 */
export class ReconnectEdgeCommand implements Command {
  readonly type = "edge" as const;
  private readonly oldNodeId: string;
  private readonly oldSide: Side;

  constructor(
    private readonly edgeId: string,
    private readonly endpoint: "source" | "target",
    private readonly newNodeId: string,
    private readonly newSide: Side,
    private readonly registry: ReconnectRegistry,
  ) {
    const edge: CanvasEdge = registry.getEdgeOrThrow(edgeId);
    if (endpoint === "source") {
      this.oldNodeId = edge.sourceId;
      this.oldSide = edge.sourceSide;
    } else {
      this.oldNodeId = edge.targetId;
      this.oldSide = edge.targetSide;
    }
  }

  execute(): void {
    this.registry.reconnectEdge(this.edgeId, this.endpoint, this.newNodeId, this.newSide);
  }

  undo(): void {
    this.registry.reconnectEdge(this.edgeId, this.endpoint, this.oldNodeId, this.oldSide);
  }

  getDomainEvents(direction: "execute" | "undo"): readonly EventDescriptor[] {
    return [{
      event: "edge:reconnect",
      data: {
        id: this.edgeId,
        endpoint: this.endpoint,
        newNodeId: direction === "execute" ? this.newNodeId : this.oldNodeId,
        newSide: direction === "execute" ? this.newSide : this.oldSide,
      },
    }];
  }
}
