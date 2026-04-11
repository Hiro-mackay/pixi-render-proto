import { Container, FederatedPointerEvent, Graphics } from "pixi.js";
import { viewState } from "./view-state";
import type { Redrawable, Side } from "./types";
import { nodeSizeMap } from "./types";
import { EdgeCreator } from "./edge-creator";

/**
 * Attach 4 connection ports (top/right/bottom/left) to a node.
 * Ports are hidden by default, appear on node hover, and initiate edge
 * creation when dragged.
 *
 * Uses Method 2 (counter-scale) so ports stay a constant screen size.
 */

const PORT_RADIUS = 5;
const HIT_RADIUS = 10;

export function attachConnectionPorts(
  node: Container,
  creator: EdgeCreator,
): void {
  const nodeSize = nodeSizeMap.get(node);
  if (!nodeSize) return;

  const portsContainer = new Container();
  portsContainer.label = "ports";

  const sideDefs: { side: Side; x: number; y: number }[] = [
    { side: "top", x: nodeSize.width / 2, y: 0 },
    { side: "right", x: nodeSize.width, y: nodeSize.height / 2 },
    { side: "bottom", x: nodeSize.width / 2, y: nodeSize.height },
    { side: "left", x: 0, y: nodeSize.height / 2 },
  ];

  for (const { side, x, y } of sideDefs) {
    const port: Redrawable = new Graphics();
    port.label = side;
    port.circle(0, 0, PORT_RADIUS);
    port.fill(0x3b82f6);
    port.stroke({ width: 1.5, color: 0xffffff });

    port.position.set(x, y);
    port.eventMode = "static";
    port.cursor = "crosshair";
    port.hitArea = {
      contains: (hx: number, hy: number) =>
        hx * hx + hy * hy < HIT_RADIUS * HIT_RADIUS,
    };

    // Counter-scale for constant screen size
    const updateScale = () => {
      port.scale.set(1 / viewState.scale);
    };
    updateScale();
    port.__redraw = updateScale;

    port.on("pointerdown", (e: FederatedPointerEvent) => {
      e.stopPropagation();
      const size = nodeSizeMap.get(node);
      if (!size) return;
      const positions = getPortPositions(size.width, size.height);
      const pos = positions[side];
      const anchorX = node.x + pos.x;
      const anchorY = node.y + pos.y;
      creator.start(node, side, anchorX, anchorY);
    });

    portsContainer.addChild(port);
  }

  portsContainer.visible = false;

  node.on("pointerenter", () => {
    if (creator.isActive()) return;
    portsContainer.visible = true;
  });

  node.on("pointerleave", () => {
    portsContainer.visible = false;
  });

  node.addChild(portsContainer);
}

function getPortPositions(
  width: number,
  height: number,
): Record<Side, { x: number; y: number }> {
  return {
    top: { x: width / 2, y: 0 },
    right: { x: width, y: height / 2 },
    bottom: { x: width / 2, y: height },
    left: { x: 0, y: height / 2 },
  };
}
