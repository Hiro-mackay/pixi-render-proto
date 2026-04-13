import type { Command } from "./command";
import type { EdgeOptions, GroupOptions, NodeOptions } from "../types";
import type { ReadonlyElementRegistry } from "../registry/element-registry";

export interface AddRemoveOps {
  readonly doAddEdge: (id: string, opts: EdgeOptions) => void;
  readonly doRemoveEdge: (id: string) => void;
}

export interface AddElementOps {
  readonly doAddNode: (id: string, opts: NodeOptions) => void;
  readonly doAddGroup: (id: string, opts: GroupOptions) => void;
  readonly doRemove: (id: string) => void;
}

export class AddNodeCommand implements Command {
  readonly type = "add-remove" as const;
  constructor(
    private readonly id: string,
    private readonly opts: NodeOptions,
    private readonly ops: AddElementOps,
  ) {}
  execute(): void { this.ops.doAddNode(this.id, this.opts); }
  undo(): void { this.ops.doRemove(this.id); }
}

export class AddGroupCommand implements Command {
  readonly type = "add-remove" as const;
  constructor(
    private readonly id: string,
    private readonly opts: GroupOptions,
    private readonly ops: AddElementOps,
  ) {}
  execute(): void { this.ops.doAddGroup(this.id, this.opts); }
  undo(): void { this.ops.doRemove(this.id); }
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
