import type { Container } from "pixi.js";
import {
  groupParentMap,
  groupChildrenMap,
  groupMetaMap,
  elementSizeMap,
  getElementRect,
} from "./types";

// Must match HEADER_HEIGHT in group.ts (avoid circular import)
const GROUP_HEADER_HEIGHT = 28;

export function assignToGroup(child: Container, group: Container): void {
  removeFromGroup(child);

  groupParentMap.set(child, group);
  let children = groupChildrenMap.get(group);
  if (!children) {
    children = new Set();
    groupChildrenMap.set(group, children);
  }
  children.add(child);
}

export function removeFromGroup(child: Container): void {
  const parent = groupParentMap.get(child);
  if (!parent) return;

  const siblings = groupChildrenMap.get(parent);
  if (siblings) siblings.delete(child);
  groupParentMap.delete(child);
}

export function getParentGroup(child: Container): Container | null {
  return groupParentMap.get(child) ?? null;
}

export function getDirectChildren(group: Container): Container[] {
  const children = groupChildrenMap.get(group);
  return children ? [...children] : [];
}

export function getDescendants(
  group: Container,
  result: Container[] = [],
): Container[] {
  const children = groupChildrenMap.get(group);
  if (!children) return result;

  for (const child of children) {
    result.push(child);
    if (groupMetaMap.has(child)) {
      getDescendants(child, result);
    }
  }
  return result;
}

export function isDescendantOf(
  child: Container,
  group: Container,
): boolean {
  let current = groupParentMap.get(child);
  while (current) {
    if (current === group) return true;
    current = groupParentMap.get(current);
  }
  return false;
}

export function getAncestors(container: Container): Container[] {
  const result: Container[] = [];
  let current = groupParentMap.get(container);
  while (current) {
    result.push(current);
    current = groupParentMap.get(current);
  }
  return result;
}

/**
 * Find the deepest group whose body area (below header) contains the point.
 * Header region is excluded so items don't overlap group labels.
 */
export function findGroupAt(
  allGroups: Container[],
  worldX: number,
  worldY: number,
): Container | null {
  let best: Container | null = null;
  let bestArea = Infinity;

  for (const group of allGroups) {
    if (!group.visible) continue;
    if (!elementSizeMap.has(group)) continue;
    const rect = getElementRect(group);
    const meta = groupMetaMap.get(group);
    const headerH = meta ? GROUP_HEADER_HEIGHT : 0;

    // Body area starts below the header
    if (
      worldX >= rect.x &&
      worldX <= rect.x + rect.width &&
      worldY >= rect.y + headerH &&
      worldY <= rect.y + rect.height
    ) {
      const area = rect.width * rect.height;
      if (area < bestArea) {
        bestArea = area;
        best = group;
      }
    }
  }
  return best;
}

/**
 * Check if an element's center is inside a group's body area.
 */
export function isInsideGroup(
  element: Container,
  group: Container,
): boolean {
  const elSize = elementSizeMap.get(element);
  if (!elSize) return false;
  const cx = element.x + elSize.width / 2;
  const cy = element.y + elSize.height / 2;

  const rect = getElementRect(group);
  const meta = groupMetaMap.get(group);
  const headerH = meta ? GROUP_HEADER_HEIGHT : 0;

  return (
    cx >= rect.x &&
    cx <= rect.x + rect.width &&
    cy >= rect.y + headerH &&
    cy <= rect.y + rect.height
  );
}
