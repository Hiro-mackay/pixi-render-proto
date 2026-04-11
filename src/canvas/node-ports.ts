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
 * Ports sit outside the node boundary by ANCHOR_OFFSET pixels.
 * Uses Method 2 (counter-scale) so ports stay a constant screen size.
 */

const PORT_RADIUS = 5;
const HIT_RADIUS = 10;
export const ANCHOR_OFFSET = 10;

export function attachConnectionPorts(
  node: Container,
  creator: EdgeCreator,
): void {
  const nodeSize = nodeSizeMap.get(node);
  if (!nodeSize) return;

  const portsContainer = new Container();
  portsContainer.label = "ports";

  const positions = getPortPositions(nodeSize.width, nodeSize.height);
  const sides: Side[] = ["top", "right", "bottom", "left"];

  for (const side of sides) {
    const pos = positions[side];
    const port: Redrawable = new Graphics();
    port.label = side;
    port.circle(0, 0, PORT_RADIUS);
    port.fill(0x3b82f6);
    port.stroke({ width: 1.5, color: 0xffffff });

    port.position.set(pos.x, pos.y);
    port.eventMode = "static";
    port.cursor = "crosshair";
    port.hitArea = {
      contains: (hx: number, hy: number) =>
        hx * hx + hy * hy < HIT_RADIUS * HIT_RADIUS,
    };

    const updateScale = () => {
      port.scale.set(1 / viewState.scale);
    };
    updateScale();
    port.__redraw = updateScale;

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
  return {
    top: { x: width / 2, y: -ANCHOR_OFFSET },
    right: { x: width + ANCHOR_OFFSET, y: height / 2 },
    bottom: { x: width / 2, y: height + ANCHOR_OFFSET },
    left: { x: -ANCHOR_OFFSET, y: height / 2 },
  };
}
