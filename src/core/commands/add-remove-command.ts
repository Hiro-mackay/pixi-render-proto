import type { Command } from "./command";
import type { EdgeOptions } from "../types";
import type { ReadonlyElementRegistry } from "../registry/element-registry";

export interface AddRemoveOps {
  readonly doAddEdge: (id: string, opts: EdgeOptions) => void;
  readonly doRemoveEdge: (id: string) => void;
}

export class AddEdgeCommand implements Command {
  readonly type = "add-remove" as const;

  constructor(
    private readonly edgeId: string,
    private readonly opts: EdgeOptions,
    private readonly ops: AddRemoveOps,
  ) {}

  execute(): void {
    this.ops.doAddEdge(this.edgeId, this.opts);
  }

  undo(): void {
    this.ops.doRemoveEdge(this.edgeId);
  }
}

export class RemoveEdgeCommand implements Command {
  readonly type = "add-remove" as const;
  private readonly snapshotOpts: EdgeOptions;

  constructor(
    private readonly edgeId: string,
    registry: ReadonlyElementRegistry,
    private readonly ops: AddRemoveOps,
  ) {
    const edge = registry.getEdgeOrThrow(edgeId);
    this.snapshotOpts = {
      sourceId: edge.sourceId,
      sourceSide: edge.sourceSide,
      targetId: edge.targetId,
      targetSide: edge.targetSide,
      label: edge.label ?? undefined,
      labelColor: edge.labelColor ?? undefined,
    };
  }

  execute(): void {
    this.ops.doRemoveEdge(this.edgeId);
  }

  undo(): void {
    this.ops.doAddEdge(this.edgeId, this.snapshotOpts);
  }
}
