import type { CanvasElement, GroupMeta } from "../types";
import type { ElementRegistry } from "../registry/element-registry";

export function canAssign(childId: string, groupId: string, registry: ElementRegistry): boolean {
  if (childId === groupId) return false;
  return !isDescendantOf(groupId, childId, registry);
}

export function assignToGroup(childId: string, groupId: string, registry: ElementRegistry): void {
  if (!canAssign(childId, groupId, registry)) return;
  registry.setParentGroup(childId, groupId);
}

export function removeFromGroup(childId: string, registry: ElementRegistry): void {
  registry.setParentGroup(childId, null);
}

export function isDescendantOf(elementId: string, ancestorId: string, registry: ElementRegistry): boolean {
  let current = registry.getElement(elementId);
  while (current?.parentGroupId) {
    if (current.parentGroupId === ancestorId) return true;
    current = registry.getElement(current.parentGroupId);
  }
  return false;
}

export function getDescendants(groupId: string, registry: ElementRegistry): readonly CanvasElement[] {
  const result: CanvasElement[] = [];
  const collect = (gid: string) => {
    for (const child of registry.getChildrenOf(gid)) {
      result.push(child);
      if (child.type === "group") collect(child.id);
    }
  };
  collect(groupId);
  return result;
}

export function updateVisibility(groupId: string, registry: ElementRegistry): void {
  const group = registry.getElementOrThrow(groupId);
  const collapsed = (group.meta as GroupMeta).collapsed;

  for (const child of registry.getChildrenOf(groupId)) {
    child.visible = !collapsed;
    child.container.visible = !collapsed;

    if (child.type === "group") {
      if (collapsed) {
        hideAllDescendants(child.id, registry);
      } else {
        updateVisibility(child.id, registry);
      }
    }
  }
}

function hideAllDescendants(groupId: string, registry: ElementRegistry): void {
  for (const child of registry.getChildrenOf(groupId)) {
    child.visible = false;
    child.container.visible = false;
    if (child.type === "group") hideAllDescendants(child.id, registry);
  }
}
