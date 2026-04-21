import type { EventDescriptor } from "../events/event-emitter";
import { facingSide } from "../geometry/anchor";
import type { ElementRegistry } from "../registry/element-registry";
import type { Side } from "../types";
import type { Command } from "./command";

export type ToggleLockRegistry = Pick<
  ElementRegistry,
  | "getElementOrThrow"
  | "getEdgesForNode"
  | "setEdgeSidesLocked"
  | "setEdgeSide"
>;

interface EdgeSideSnapshot {
  readonly edgeId: string;
  readonly endpoint: "source" | "target";
  readonly oldSide: Side;
  readonly newSide: Side;
}

/**
 * Toggles edgeSidesLocked on a single node. When locking, snapshots the currently-rendered
 * side (via facingSide) for each connected edge endpoint so the frozen layout survives
 * subsequent node movement.
 */
export class ToggleNodeEdgeLockCommand implements Command {
  readonly type = "toggle-lock" as const;
  private readonly oldLocked: boolean;
  private readonly newLocked: boolean;
  private readonly sideChanges: readonly EdgeSideSnapshot[];

  constructor(
    private readonly nodeId: string,
    private readonly registry: ToggleLockRegistry,
  ) {
    const node = registry.getElementOrThrow(nodeId);
    this.oldLocked = node.edgeSidesLocked;
    this.newLocked = !this.oldLocked;

    if (!this.newLocked) {
      this.sideChanges = [];
      return;
    }

    const changes: EdgeSideSnapshot[] = [];
    for (const edge of registry.getEdgesForNode(nodeId)) {
      const srcEl = registry.getElementOrThrow(edge.sourceId);
      const tgtEl = registry.getElementOrThrow(edge.targetId);
      const srcCenter = { x: srcEl.x + srcEl.width / 2, y: srcEl.y + srcEl.height / 2 };
      const tgtCenter = { x: tgtEl.x + tgtEl.width / 2, y: tgtEl.y + tgtEl.height / 2 };
      if (edge.sourceId === nodeId) {
        const newSide = srcEl.edgeSidesLocked
          ? edge.sourceSide
          : facingSide(srcEl, tgtCenter);
        if (newSide !== edge.sourceSide) {
          changes.push({
            edgeId: edge.id,
            endpoint: "source",
            oldSide: edge.sourceSide,
            newSide,
          });
        }
      }
      if (edge.targetId === nodeId) {
        const newSide = tgtEl.edgeSidesLocked
          ? edge.targetSide
          : facingSide(tgtEl, srcCenter);
        if (newSide !== edge.targetSide) {
          changes.push({
            edgeId: edge.id,
            endpoint: "target",
            oldSide: edge.targetSide,
            newSide,
          });
        }
      }
    }
    this.sideChanges = changes;
  }

  execute(): void {
    for (const c of this.sideChanges) {
      this.registry.setEdgeSide(c.edgeId, c.endpoint, c.newSide);
    }
    this.registry.setEdgeSidesLocked(this.nodeId, this.newLocked);
  }

  undo(): void {
    this.registry.setEdgeSidesLocked(this.nodeId, this.oldLocked);
    for (const c of this.sideChanges) {
      this.registry.setEdgeSide(c.edgeId, c.endpoint, c.oldSide);
    }
  }

  getDomainEvents(direction: "execute" | "undo"): readonly EventDescriptor[] {
    const locked = direction === "execute" ? this.newLocked : this.oldLocked;
    return [{ event: "element:lock-toggle", data: { id: this.nodeId, locked } }];
  }
}
