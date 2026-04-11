import type { Container, Graphics } from "pixi.js";

export type Redrawable = Graphics & { __redraw?: () => void };

export type NodeSize = { width: number; height: number };

/**
 * World-space dimensions for each node container.
 * Registered at creation, read by edge routing and hit-testing.
 * WeakMap so removed nodes are garbage-collected.
 */
export const nodeSizeMap = new WeakMap<Container, NodeSize>();

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

export const PROTOCOL_LABELS = [
  "HTTPS :443",
  "gRPC :50051",
  "TCP :5432",
  "Redis :6379",
  "AMQP :5672",
] as const;

export type ProtocolLabel = (typeof PROTOCOL_LABELS)[number];
