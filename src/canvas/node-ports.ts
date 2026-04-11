import { Container, FederatedPointerEvent, Graphics } from "pixi.js";
import { viewState } from "./view-state";
import type { Redrawable, Side } from "./types";
import { nodeSizeMap, nodePortsMap } from "./types";
import { EdgeCreator } from "./edge-creator";

/**
 * Attach 4 connection ports (top/right/bottom/left) to a node.
 * Ports are hidden by default and shown when the node is selected
 * (managed by SelectionManager via nodePortsMap).
 *
 * Ports sit outside the node boundary at a zoom-invariant screen distance.
 * Uses counter-scale so ports stay a constant screen size.
 */

const PORT_RADIUS = 5;
const HIT_RADIUS = 12;
const ANCHOR_SCREEN_PX = 14;

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
    const port: Redrawable = new Graphics();
    port.label = side;
    port.circle(0, 0, PORT_RADIUS);
    port.fill(0x3b82f6);
    port.stroke({ width: 1.5, color: 0xffffff });

    port.eventMode = "static";
    port.cursor = "crosshair";
    port.hitArea = {
      contains: (hx: number, hy: number) =>
        hx * hx + hy * hy < HIT_RADIUS * HIT_RADIUS,
    };

    const updatePort = () => {
      port.scale.set(1 / viewState.scale);
      const size = nodeSizeMap.get(node);
      if (!size) return;
      const pos = getPortPositions(size.width, size.height)[side];
      port.position.set(pos.x, pos.y);
    };
    updatePort();
    port.__redraw = updatePort;

    port.on("pointerdown", (e: FederatedPointerEvent) => {
      e.stopPropagation();
      const size = nodeSizeMap.get(node);
      if (!size) return;
      const p = getPortPositions(size.width, size.height)[side];
      const anchorX = node.x + p.x;
      const anchorY = node.y + p.y;
      creator.start(node, side, anchorX, anchorY);
    });

    portsContainer.addChild(port);
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
