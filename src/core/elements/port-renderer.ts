import { Container, Graphics } from "pixi.js";
import type { CanvasElement, Redrawable, Side } from "../types";

const PORT_RADIUS = 5;
const HIT_RADIUS = 12;
const ANCHOR_SCREEN_PX = 14;
const ANCHOR_HIDE_THRESHOLD = 0.3;
const PORT_DEFAULT_FILL = 0xffffff;
const PORT_DEFAULT_STROKE = 0x3b82f6;
const PORT_HOVER_FILL = 0x3b82f6;
const PORT_HOVER_STROKE = 0xffffff;

const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];

export function getPortPosition(
  side: Side,
  width: number,
  height: number,
  scale: number,
): { x: number; y: number } {
  const offset = ANCHOR_SCREEN_PX / scale;
  switch (side) {
    case "top": return { x: width / 2, y: -offset };
    case "right": return { x: width + offset, y: height / 2 };
    case "bottom": return { x: width / 2, y: height + offset };
    case "left": return { x: -offset, y: height / 2 };
  }
}

export function createPortGraphics(
  element: CanvasElement,
  getScale: () => number,
): Container {
  const portsContainer = new Container();
  portsContainer.label = "ports";

  for (const side of SIDES) {
    const portContainer = new Container();
    portContainer.label = side;
    portContainer.eventMode = "static";
    portContainer.cursor = "crosshair";
    portContainer.hitArea = {
      contains: (hx: number, hy: number) =>
        hx * hx + hy * hy < HIT_RADIUS * HIT_RADIUS,
    };

    const defaultShape: Redrawable = new Graphics()
      .circle(0, 0, PORT_RADIUS)
      .fill(PORT_DEFAULT_FILL)
      .stroke({ width: 1.5, color: PORT_DEFAULT_STROKE });

    const hoverShape: Redrawable = new Graphics()
      .circle(0, 0, PORT_RADIUS)
      .fill(PORT_HOVER_FILL)
      .stroke({ width: 1.5, color: PORT_HOVER_STROKE });
    hoverShape.visible = false;

    const updatePort = () => {
      if (!portsContainer.visible) return;
      const scale = getScale();
      portContainer.scale.set(1 / scale);
      portContainer.alpha = scale < ANCHOR_HIDE_THRESHOLD ? 0 : 1;
      const pos = getPortPosition(side, element.width, element.height, scale);
      portContainer.position.set(pos.x, pos.y);
    };

    updatePort();
    (portContainer as Redrawable).__redraw = updatePort;

    portContainer.on("pointerenter", () => {
      defaultShape.visible = false;
      hoverShape.visible = true;
    });
    portContainer.on("pointerleave", () => {
      defaultShape.visible = true;
      hoverShape.visible = false;
    });

    portContainer.addChild(defaultShape, hoverShape);
    portsContainer.addChild(portContainer);
  }

  portsContainer.visible = false;
  element.container.addChild(portsContainer);
  return portsContainer;
}
