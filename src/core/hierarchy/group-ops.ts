import type { CanvasElement } from "../types";
import type { ElementRegistry } from "../registry/element-registry";

export function canAssign(childId: string, groupId: string, registry: ElementRegistry): boolean {
  if (childId === groupId) return false;
  return !isDescendantOf(groupId, childId, registry);
}

export function assignToGroup(childId: string, groupId: string, registry: ElementRegistry): boolean {
  if (!canAssign(childId, groupId, registry)) return false;
  registry.setParentGroup(childId, groupId);
  return true;
}

export function removeFromGroup(childId: string, registry: ElementRegistry): void {
  registry.setParentGroup(childId, null);
}

export function isDescendantOf(elementId: string, ancestorId: string, registry: ElementRegistry): boolean {
  const visited = new Set<string>();
  let current = registry.getElement(elementId);
  while (current?.parentGroupId) {
    if (current.parentGroupId === ancestorId) return true;
    if (visited.has(current.parentGroupId)) return false;
    visited.add(current.parentGroupId);
    current = registry.getElement(current.parentGroupId);
  }
  return false;
}

export function getDescendants(groupId: string, registry: ElementRegistry): readonly CanvasElement[] {
  const result: CanvasElement[] = [];
  const visited = new Set<string>();
  const collect = (gid: string) => {
    if (visited.has(gid)) return;
    visited.add(gid);
    for (const child of registry.getChildrenOf(gid)) {
      result.push(child);
      if (child.type === "group") collect(child.id);
    }
  };
  collect(groupId);
  return result;
}

export function updateVisibility(
  groupId: string,
  registry: ElementRegistry,
  sync?: (el: CanvasElement) => void,
): void {
  const group = registry.getElementOrThrow(groupId);
  if (group.type !== "group") return;
  const collapsed = group.meta.collapsed;

  for (const child of registry.getChildrenOf(groupId)) {
    child.visible = !collapsed;
    child.container.visible = !collapsed;
    sync?.(child);

    if (child.type === "group") {
      if (collapsed) {
        hideAllDescendants(child.id, registry, sync);
      } else {
        updateVisibility(child.id, registry, sync);
      }
    }
  }
}

/** Single entry point for all parent-child relationship changes */
export function applyParentChange(
  childId: string,
  newParentId: string | null,
  registry: ElementRegistry,
  sync: (el: CanvasElement) => void,
): void {
  const child = registry.getElementOrThrow(childId);
  const oldParentId = child.parentGroupId;

  if (child.parentGroupId === newParentId) return;

  if (newParentId) {
    if (!assignToGroup(childId, newParentId, registry)) return;
    // updateVisibility already calls sync on each child in the group
    updateVisibility(newParentId, registry, sync);
  } else {
    removeFromGroup(childId, registry);
    child.visible = true;
    child.container.visible = true;
    sync(child);
  }
  if (oldParentId && oldParentId !== newParentId) {
    updateVisibility(oldParentId, registry, sync);
  }
}

function hideAllDescendants(
  groupId: string,
  registry: ElementRegistry,
  sync?: (el: CanvasElement) => void,
): void {
  for (const child of registry.getChildrenOf(groupId)) {
    child.visible = false;
    child.container.visible = false;
    sync?.(child);
    if (child.type === "group") hideAllDescendants(child.id, registry, sync);
  }
}
