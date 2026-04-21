import type { ReadonlyElementRegistry } from "../registry/element-registry";
import type {
  GroupMembership,
  SceneData,
  SerializedEdge,
  SerializedGroup,
  SerializedNode,
} from "./schema";

export function serialize(
  registry: ReadonlyElementRegistry,
  viewport?: { x: number; y: number; zoom: number },
): SceneData {
  const nodes: SerializedNode[] = [];
  const groups: SerializedGroup[] = [];
  const memberships: GroupMembership[] = [];

  for (const el of registry.getAllElements().values()) {
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
    if (el.parentGroupId) {
      memberships.push({ childId: el.id, groupId: el.parentGroupId });
    }
  }

  const edges: SerializedEdge[] = [];
  for (const edge of registry.getAllEdges().values()) {
    const serialized: SerializedEdge = {
      id: edge.id,
      sourceId: edge.sourceId,
      sourceSide: edge.sourceSide,
      targetId: edge.targetId,
      targetSide: edge.targetSide,
      ...(edge.label !== null ? { label: edge.label } : {}),
      ...(edge.labelColor !== null ? { labelColor: edge.labelColor } : {}),
    };
    edges.push(serialized);
  }

  return {
    version: 1,
    nodes,
    groups,
    edges,
    groupMemberships: memberships,
    ...(viewport ? { viewport } : {}),
  };
}
