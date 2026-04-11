import type { Container, Graphics } from "pixi.js";

export type Redrawable = Graphics & { __redraw?: () => void };

export type NodeSize = { width: number; height: number };

/**
 * World-space dimensions for each node container.
 * Registered at creation, read by edge routing and hit-testing.
 * WeakMap so removed nodes are garbage-collected.
 */
export const nodeSizeMap = new WeakMap<Container, NodeSize>();

/**
 * Maps each node container to its ports container.
 * Used by SelectionManager to show/hide ports on select/clear.
 */
export const nodePortsMap = new WeakMap<Container, Container>();

export function getNodeWorldRect(node: Container): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const size = nodeSizeMap.get(node);
  if (!size) {
    throw new Error(`Node "${node.label}" not registered in nodeSizeMap`);
  }
  return { x: node.x, y: node.y, width: size.width, height: size.height };
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
  const dist = Math.hypot(dx, dy);
  const offset = Math.min(Math.max(dist * 0.4, 30), 120);
  const startDir = sideDirection(startSide);
  const cp1x = startX + startDir.x * offset;
  const cp1y = startY + startDir.y * offset;
  let cp2x: number, cp2y: number;
  if (endSide) {
    const endDir = sideDirection(endSide);
    cp2x = endX + endDir.x * offset;
    cp2y = endY + endDir.y * offset;
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
    const rect = getNodeWorldRect(n);
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

export const PROTOCOL_LABELS = [
  "HTTPS :443",
  "gRPC :50051",
  "TCP :5432",
  "Redis :6379",
  "AMQP :5672",
] as const;

export type ProtocolLabel = (typeof PROTOCOL_LABELS)[number];
