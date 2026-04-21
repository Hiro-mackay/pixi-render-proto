import { ElementNotFoundError } from "../errors";
import { applyParentChange } from "../hierarchy/group-ops";
import type { ElementRegistry } from "../registry/element-registry";
import type { CanvasElement, EdgeOptions, GroupOptions, NodeOptions } from "../types";
import { COLLAPSED_HEIGHT } from "../types";
import type { AddElementOps } from "./add-remove-command";
import type { Command } from "./command";

type ElementSnapshot =
  | {
      readonly type: "node";
      readonly id: string;
      readonly parentGroupId: string | null;
      readonly opts: NodeOptions;
    }
  | {
      readonly type: "group";
      readonly id: string;
      readonly parentGroupId: string | null;
      readonly opts: GroupOptions;
      readonly childIds: readonly string[];
      readonly collapsed: boolean;
      readonly expandedHeight: number;
    };

export interface DeleteCommandOps extends AddElementOps {
  readonly doAddEdge: (id: string, opts: EdgeOptions) => void;
  readonly onRestore?: (id: string) => void;
}

export class DeleteCommand implements Command {
  readonly type = "delete";
  private readonly element: ElementSnapshot;
  private readonly edges: readonly { readonly id: string; readonly opts: EdgeOptions }[];

  constructor(
    elementId: string,
    private readonly registry: ElementRegistry,
    private readonly sync: (el: CanvasElement) => void,
    private readonly ops: DeleteCommandOps,
  ) {
    const el = registry.getElement(elementId);
    if (!el) throw new ElementNotFoundError(`Element "${elementId}" not found`);

    this.element =
      el.type === "node"
        ? {
            type: "node",
            id: el.id,
            parentGroupId: el.parentGroupId,
            opts: snapshotNodeOpts(el),
          }
        : {
            type: "group",
            id: el.id,
            parentGroupId: el.parentGroupId,
            opts: snapshotGroupOpts(el),
            childIds: registry.getChildrenOf(el.id).map((c) => c.id),
            collapsed: el.meta.collapsed,
            expandedHeight: el.meta.expandedHeight,
          };

    this.edges = registry.getEdgesForNode(el.id).map((edge) => ({
      id: edge.id,
      opts: {
        sourceId: edge.sourceId,
        sourceSide: edge.sourceSide,
        sourceSidePinned: edge.sourceSidePinned,
        targetId: edge.targetId,
        targetSide: edge.targetSide,
        label: edge.label ?? undefined,
        labelColor: edge.labelColor ?? undefined,
      },
    }));
  }

  execute(): void {
    this.ops.doRemove(this.element.id);
  }

  undo(): void {
    const { element, edges } = this;

    if (element.type === "node") {
      this.ops.doAddNode(element.id, element.opts);
    } else {
      // doAddGroup is synchronous — element is available in registry immediately after
      this.ops.doAddGroup(element.id, element.opts);
      const restored = this.registry.getElementOrThrow(element.id);
      if (restored.type === "group") {
        restored.meta.collapsed = element.collapsed;
        restored.meta.expandedHeight = element.expandedHeight;
        if (element.collapsed) {
          restored.height = COLLAPSED_HEIGHT;
          this.sync(restored);
        }
      }
    }

    if (element.parentGroupId) {
      applyParentChange(element.id, element.parentGroupId, this.registry, this.sync);
    }

    if (element.type === "group") {
      for (const childId of element.childIds) {
        applyParentChange(childId, element.id, this.registry, this.sync);
      }
    }

    for (const edge of edges) {
      const srcExists = this.registry.getElement(edge.opts.sourceId);
      const tgtExists = this.registry.getElement(edge.opts.targetId);
      if (srcExists && tgtExists) {
        this.ops.doAddEdge(edge.id, edge.opts);
      }
    }

    this.ops.onRestore?.(element.id);
  }
}

function snapshotNodeOpts(el: CanvasElement & { type: "node" }): NodeOptions {
  return {
    label: el.meta.label,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    color: el.meta.color,
    icon: el.meta.icon,
  };
}

function snapshotGroupOpts(el: CanvasElement & { type: "group" }): GroupOptions {
  return {
    label: el.meta.label,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    color: el.meta.color,
  };
}
