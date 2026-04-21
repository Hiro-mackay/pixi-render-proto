import {
  AddEdgeCommand,
  type AddElementOps,
  AddGroupCommand,
  AddNodeCommand,
  type AddRemoveOps,
} from "../commands/add-remove-command";
import type { Command, CommandHistory } from "../commands/command";
import { getDescendants, updateVisibility } from "../hierarchy/group-ops";
import type { ElementRegistry, ReadonlyElementRegistry } from "../registry/element-registry";
import { syncElement } from "../registry/sync";
import type {
  GroupMembership,
  SerializedEdge,
  SerializedGroup,
  SerializedNode,
} from "../serialization/schema";

interface ClipboardData {
  readonly nodes: readonly SerializedNode[];
  readonly groups: readonly SerializedGroup[];
  readonly edges: readonly SerializedEdge[];
  readonly memberships: readonly GroupMembership[];
}

const PASTE_OFFSET = 20;

export class CanvasClipboard {
  private data: ClipboardData | null = null;

  copy(selectedIds: ReadonlySet<string>, registry: ReadonlyElementRegistry): void {
    if (selectedIds.size === 0) {
      this.data = null;
      return;
    }

    // Collect all element IDs (including group descendants)
    const collected = new Set<string>();
    for (const id of selectedIds) {
      const el = registry.getElement(id);
      if (!el) continue;
      collected.add(id);
      if (el.type === "group") {
        for (const desc of getDescendants(id, registry)) collected.add(desc.id);
      }
    }

    const nodes: SerializedNode[] = [];
    const groups: SerializedGroup[] = [];
    const memberships: GroupMembership[] = [];

    for (const id of collected) {
      const el = registry.getElement(id);
      if (!el) continue;
      if (el.type === "node") {
        nodes.push({
          id: el.id,
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          label: el.meta.label,
          color: el.meta.color,
        });
      } else {
        groups.push({
          id: el.id,
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
          label: el.meta.label,
          color: el.meta.color,
          collapsed: el.meta.collapsed,
          expandedHeight: el.meta.expandedHeight,
        });
      }
      if (el.parentGroupId && collected.has(el.parentGroupId)) {
        memberships.push({ childId: el.id, groupId: el.parentGroupId });
      }
    }

    // Only include edges where both endpoints are in the collected set
    const edges: SerializedEdge[] = [];
    for (const edge of registry.getAllEdges().values()) {
      if (collected.has(edge.sourceId) && collected.has(edge.targetId)) {
        edges.push({
          id: edge.id,
          sourceId: edge.sourceId,
          sourceSide: edge.sourceSide,
          targetId: edge.targetId,
          targetSide: edge.targetSide,
          ...(edge.label !== null ? { label: edge.label } : {}),
          ...(edge.labelColor !== null ? { labelColor: edge.labelColor } : {}),
        });
      }
    }

    this.data = { nodes, groups, edges, memberships };
  }

  paste(
    registry: ElementRegistry,
    history: CommandHistory,
    elementOps: AddElementOps,
    edgeOps: AddRemoveOps,
    offset = { x: PASTE_OFFSET, y: PASTE_OFFSET },
  ): readonly string[] {
    if (!this.data) return [];

    const idMap = new Map<string, string>();
    for (const n of this.data.nodes) idMap.set(n.id, crypto.randomUUID());
    for (const g of this.data.groups) idMap.set(g.id, crypto.randomUUID());
    for (const e of this.data.edges) idMap.set(e.id, crypto.randomUUID());

    const commands: Command[] = [];

    // Groups first (parents before children for hierarchy)
    const collapsedGroups: Array<{ newId: string; expandedHeight: number; height: number }> = [];
    for (const g of this.data.groups) {
      const newId = idMap.get(g.id)!;
      commands.push(
        new AddGroupCommand(
          newId,
          {
            label: g.label,
            color: g.color,
            x: g.x + offset.x,
            y: g.y + offset.y,
            width: g.width,
            height: g.collapsed ? g.expandedHeight : g.height,
          },
          elementOps,
        ),
      );
      if (g.collapsed) {
        collapsedGroups.push({ newId, expandedHeight: g.expandedHeight, height: g.height });
      }
    }

    // Nodes
    for (const n of this.data.nodes) {
      commands.push(
        new AddNodeCommand(
          idMap.get(n.id)!,
          {
            label: n.label,
            color: n.color,
            x: n.x + offset.x,
            y: n.y + offset.y,
            width: n.width,
            height: n.height,
          },
          elementOps,
        ),
      );
    }

    // Memberships as inline commands (inside the batch for atomic undo)
    const memberships = this.data.memberships;
    if (memberships.length > 0) {
      commands.push({
        type: "add-remove",
        execute() {
          for (const m of memberships) {
            const newChildId = idMap.get(m.childId);
            const newGroupId = idMap.get(m.groupId);
            if (newChildId && newGroupId) registry.setParentGroup(newChildId, newGroupId);
          }
        },
        undo() {
          for (const m of memberships) {
            const newChildId = idMap.get(m.childId);
            if (newChildId) registry.setParentGroup(newChildId, null);
          }
        },
      });
    }

    // Restore collapsed state AFTER memberships (children must exist as members first)
    if (collapsedGroups.length > 0) {
      commands.push({
        type: "add-remove",
        execute() {
          for (const { newId, expandedHeight, height } of collapsedGroups) {
            const el = registry.getElement(newId);
            if (el?.type === "group") {
              el.meta.expandedHeight = expandedHeight;
              el.meta.collapsed = true;
              el.height = height;
              syncElement(el);
              updateVisibility(newId, registry, syncElement);
            }
          }
        },
        undo() {
          for (const { newId, expandedHeight } of collapsedGroups) {
            const el = registry.getElement(newId);
            if (el?.type === "group") {
              el.meta.collapsed = false;
              el.height = expandedHeight;
              syncElement(el);
              updateVisibility(newId, registry, syncElement);
            }
          }
        },
      });
    }

    // Edges with remapped IDs
    for (const e of this.data.edges) {
      const newSourceId = idMap.get(e.sourceId);
      const newTargetId = idMap.get(e.targetId);
      if (!newSourceId || !newTargetId) continue;
      commands.push(
        new AddEdgeCommand(
          idMap.get(e.id)!,
          {
            sourceId: newSourceId,
            sourceSide: e.sourceSide,
            targetId: newTargetId,
            targetSide: e.targetSide,
            label: e.label,
            labelColor: e.labelColor,
          },
          edgeOps,
        ),
      );
    }

    if (commands.length === 0) return [];
    history.batch(commands);

    const newIds: string[] = [];
    for (const n of this.data.nodes) newIds.push(idMap.get(n.id)!);
    for (const g of this.data.groups) newIds.push(idMap.get(g.id)!);
    return newIds;
  }

  duplicate(
    selectedIds: ReadonlySet<string>,
    registry: ElementRegistry,
    history: CommandHistory,
    elementOps: AddElementOps,
    edgeOps: AddRemoveOps,
  ): readonly string[] {
    if (selectedIds.size === 0) return [];
    const saved = this.data;
    this.copy(selectedIds, registry);
    const result = this.paste(registry, history, elementOps, edgeOps);
    this.data = saved;
    return result;
  }

  isEmpty(): boolean {
    return this.data === null;
  }
}
