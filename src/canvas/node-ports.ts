import { Container, FederatedPointerEvent, Graphics } from "pixi.js";
import { viewState } from "./view-state";
import type { Redrawable, Side } from "./types";
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
  nodeSize: { width: number; height: number },
  creator: EdgeCreator,
): void {
  const ports: Redrawable[] = [];

  const sideDefs: { side: Side; x: number; y: number }[] = [
    { side: "top", x: nodeSize.width / 2, y: 0 },
    { side: "right", x: nodeSize.width, y: nodeSize.height / 2 },
    { side: "bottom", x: nodeSize.width / 2, y: nodeSize.height },
    { side: "left", x: 0, y: nodeSize.height / 2 },
  ];

  for (const { side, x, y } of sideDefs) {
    const port: Redrawable = new Graphics();
    port.circle(0, 0, PORT_RADIUS);
    port.fill(0x3b82f6);
    port.stroke({ width: 1.5, color: 0xffffff });

    port.position.set(x, y);
    port.visible = false;
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
      // Anchor position in world coords = node position + port local position
      const anchorX = node.x + x;
      const anchorY = node.y + y;
      creator.start(node, side, anchorX, anchorY);
    });

    node.addChild(port);
    ports.push(port);
  }

  // Use pointerenter/pointerleave (non-bubbling) so that moving the pointer
  // from the node body onto a child port does NOT hide the ports. pointerout
  // would fire on every child transition which is wrong here.
  node.on("pointerenter", () => {
    if (creator.isActive()) return;
    for (const p of ports) p.visible = true;
  });

  node.on("pointerleave", () => {
    for (const p of ports) p.visible = false;
  });
}
