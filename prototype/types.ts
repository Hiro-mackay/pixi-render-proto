import type { Container, Graphics } from "pixi.js";

export type Redrawable = Graphics & { __redraw?: () => void };

export type ElementSize = { width: number; height: number };

/**
 * World-space dimensions for any canvas element (node or group).
 * Registered at creation, read by edge routing, hit-testing, and selection.
 * WeakMap so removed elements are garbage-collected.
 */
export const elementSizeMap = new WeakMap<Container, ElementSize>();

/** Maps each node container to its ports container. */
export const nodePortsMap = new WeakMap<Container, Container>();

export function getElementRect(element: Container): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const size = elementSizeMap.get(element);
  if (!size) {
    throw new Error(`Element "${element.label}" not registered in elementSizeMap`);
  }
  return { x: element.x, y: element.y, width: size.width, height: size.height };
}

export type Side = "top" | "right" | "bottom" | "left";

export function sideDirection(side: Side): { x: number; y: number } {
  switch (side) {
    case "right":
      return { x: 1, y: 0 };
    case "left":
      return { x: -1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "top":
      return { x: 0, y: -1 };
  }
}

export function textResolution(): number {
  return Math.ceil(window.devicePixelRatio || 1) * 2;
}

export type BezierPoints = {
  cp1x: number; cp1y: number;
  cp2x: number; cp2y: number;
};

export function computeBezierControlPoints(
  startX: number, startY: number, startSide: Side,
  endX: number, endY: number, endSide: Side | null,
): BezierPoints {
  const dx = endX - startX;
  const dy = endY - startY;
  const startDir = sideDirection(startSide);

  const startProj = dx * startDir.x + dy * startDir.y;
  const startOffset = startProj > 0
    ? Math.min(Math.max(startProj * 0.4, 30), 200)
    : Math.min(Math.abs(startProj) * 0.6 + 60, 300);

  const cp1x = startX + startDir.x * startOffset;
  const cp1y = startY + startDir.y * startOffset;

  let cp2x: number, cp2y: number;
  if (endSide) {
    const endDir = sideDirection(endSide);
    const endProj = -dx * endDir.x + -dy * endDir.y;
    const endOffset = endProj > 0
      ? Math.min(Math.max(endProj * 0.4, 30), 200)
      : Math.min(Math.abs(endProj) * 0.6 + 60, 300);
    cp2x = endX + endDir.x * endOffset;
    cp2y = endY + endDir.y * endOffset;
  } else {
    cp2x = endX - dx * 0.25;
    cp2y = endY - dy * 0.25;
  }
  return { cp1x, cp1y, cp2x, cp2y };
}

export function findNodeAt(
  nodes: Container[],
  worldX: number,
  worldY: number,
): Container | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]!;
    if (!n.visible) continue;
    const rect = getElementRect(n);
    if (
      worldX >= rect.x &&
      worldX <= rect.x + rect.width &&
      worldY >= rect.y &&
      worldY <= rect.y + rect.height
    ) {
      return n;
    }
  }
  return null;
}

// --- Group-specific data (not size — size is in elementSizeMap) ---

export type GroupMeta = {
  id: string;
  label: string;
  color: number;
  collapsed: boolean;
};

/** Maps a group container to its group-specific metadata */
export const groupMetaMap = new WeakMap<Container, GroupMeta>();

/** Maps a child (node or group) to its parent group */
export const groupParentMap = new WeakMap<Container, Container>();

/** Maps a group to its direct children (nodes and sub-groups) */
export const groupChildrenMap = new WeakMap<Container, Set<Container>>();

// --- Protocol labels ---

export const PROTOCOL_LABELS = [
  "HTTPS :443",
  "gRPC :50051",
  "TCP :5432",
  "Redis :6379",
  "AMQP :5672",
] as const;

export type ProtocolLabel = (typeof PROTOCOL_LABELS)[number];
