import type { ReadonlyElementRegistry } from "../registry/element-registry";
import { HEADER_HEIGHT } from "../elements/group-renderer";

export function findGroupAt(
  point: { x: number; y: number },
  registry: ReadonlyElementRegistry,
  excludeIds?: ReadonlySet<string>,
): string | null {
  let bestId: string | null = null;
  let bestArea = Infinity;

  for (const group of registry.getAllGroups()) {
    if (!group.visible) continue;
    if (excludeIds?.has(group.id)) continue;

    const bodyTop = group.y + HEADER_HEIGHT;
    if (
      point.x < group.x ||
      point.x > group.x + group.width ||
      point.y < bodyTop ||
      point.y > group.y + group.height
    ) continue;

    const area = group.width * group.height;
    if (area < bestArea) {
      bestArea = area;
      bestId = group.id;
    }
  }

  return bestId;
}

export function isInsideGroup(
  elementId: string,
  groupId: string,
  registry: ReadonlyElementRegistry,
): boolean {
  const el = registry.getElement(elementId);
  const group = registry.getElement(groupId);
  if (!el || !group) return false;

  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const bodyTop = group.y + HEADER_HEIGHT;

  return (
    cx >= group.x &&
    cx <= group.x + group.width &&
    cy >= bodyTop &&
    cy <= group.y + group.height
  );
}
