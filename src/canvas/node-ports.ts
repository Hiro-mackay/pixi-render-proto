import { Container, FederatedPointerEvent, Graphics } from "pixi.js";
import { viewState, ANCHOR_HIDE_THRESHOLD } from "./view-state";
import type { Redrawable, Side } from "./types";
import { nodeSizeMap, nodePortsMap } from "./types";
import { EdgeCreator } from "./edge-creator";

/**
 * Attach 4 connection ports (top/right/bottom/left) to a node.
 * Ports are hidden by default and shown when the node is selected.
 *
 * Default: white-filled circle with gray stroke (subtle).
 * On hover: blue-filled circle with white stroke (active).
 */

const PORT_RADIUS = 5;
const HIT_RADIUS = 12;
const ANCHOR_SCREEN_PX = 14;

const PORT_DEFAULT_FILL = 0xffffff;
const PORT_DEFAULT_STROKE = 0x3b82f6;
const PORT_HOVER_FILL = 0x3b82f6;
const PORT_HOVER_STROKE = 0xffffff;

export function attachConnectionPorts(
  node: Container,
  creator: EdgeCreator,
): void {
  const nodeSize = nodeSizeMap.get(node);
  if (!nodeSize) return;

  const portsContainer = new Container();
  portsContainer.label = "ports";

  const sides: Side[] = ["top", "right", "bottom", "left"];

  for (const side of sides) {
    const portContainer = new Container() as Container & { __redraw?: () => void };
    portContainer.label = side;
    portContainer.eventMode = "static";
    portContainer.cursor = "crosshair";
    portContainer.hitArea = {
      contains: (hx: number, hy: number) =>
        hx * hx + hy * hy < HIT_RADIUS * HIT_RADIUS,
    };

    // Default state (white with gray stroke)
    const defaultShape: Redrawable = new Graphics();
    defaultShape.circle(0, 0, PORT_RADIUS);
    defaultShape.fill(PORT_DEFAULT_FILL);
    defaultShape.stroke({ width: 1.5, color: PORT_DEFAULT_STROKE });
    portContainer.addChild(defaultShape);

    // Hover state (blue with white stroke)
    const hoverShape: Redrawable = new Graphics();
    hoverShape.circle(0, 0, PORT_RADIUS);
    hoverShape.fill(PORT_HOVER_FILL);
    hoverShape.stroke({ width: 1.5, color: PORT_HOVER_STROKE });
    hoverShape.visible = false;
    portContainer.addChild(hoverShape);

    const updatePort = () => {
      portContainer.scale.set(1 / viewState.scale);
      portContainer.alpha = viewState.scale < ANCHOR_HIDE_THRESHOLD ? 0 : 1;
      const size = nodeSizeMap.get(node);
      if (!size) return;
      const pos = getPortPositions(size.width, size.height)[side];
      portContainer.position.set(pos.x, pos.y);
    };
    updatePort();
    defaultShape.__redraw = updatePort;

    portContainer.on("pointerenter", () => {
      defaultShape.visible = false;
      hoverShape.visible = true;
    });

    portContainer.on("pointerleave", () => {
      if (creator.isActive()) return;
      defaultShape.visible = true;
      hoverShape.visible = false;
    });

    portContainer.on("pointerdown", (e: FederatedPointerEvent) => {
      e.stopPropagation();
      defaultShape.visible = false;
      hoverShape.visible = true;
      const size = nodeSizeMap.get(node);
      if (!size) return;
      const p = getPortPositions(size.width, size.height)[side];
      const anchorX = node.x + p.x;
      const anchorY = node.y + p.y;
      creator.start(node, side, anchorX, anchorY, () => {
        // Reset to default state when edge creation ends
        defaultShape.visible = true;
        hoverShape.visible = false;
      });
    });

    portsContainer.addChild(portContainer);
  }

  portsContainer.visible = false;
  node.addChild(portsContainer);
  nodePortsMap.set(node, portsContainer);
}

export function getPortPositions(
  width: number,
  height: number,
): Record<Side, { x: number; y: number }> {
  const offset = ANCHOR_SCREEN_PX / viewState.scale;
  return {
    top: { x: width / 2, y: -offset },
    right: { x: width + offset, y: height / 2 },
    bottom: { x: width / 2, y: height + offset },
    left: { x: -offset, y: height / 2 },
  };
}
