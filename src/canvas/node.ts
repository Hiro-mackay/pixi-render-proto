import { Container, Graphics, Text, TextStyle, Sprite, Texture } from "pixi.js";
import { viewState } from "./view-state";
import type { Redrawable } from "./types";
import { textResolution, nodeSizeMap } from "./types";
import { getPortPositions } from "./node-ports";

export type NodeData = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  icon?: Texture;
  color?: number;
};

const LABEL_STYLE = new TextStyle({
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
  fill: 0xffffff,
  wordWrap: true,
  wordWrapWidth: 120,
  align: "center",
});

export function createNode(data: NodeData): Container {
  const container = new Container();
  container.label = data.id;
  container.position.set(data.x, data.y);
  const size = { width: data.width, height: data.height };
  nodeSizeMap.set(container, size);
  container.eventMode = "static";
  container.cursor = "grab";

  const bg: Redrawable = new Graphics();
  const color = data.color ?? 0x2d3748;

  const drawBg = () => {
    bg.clear();
    bg.roundRect(0, 0, size.width, size.height, 8);
    bg.fill(color);
    bg.stroke({ width: 1.5 / viewState.scale, color: 0x4a5568 });
  };
  drawBg();
  bg.__redraw = drawBg;
  container.addChild(bg);

  if (data.icon) {
    const iconSprite = new Sprite(data.icon);
    const iconSize = 28;
    iconSprite.width = iconSize;
    iconSprite.height = iconSize;
    iconSprite.position.set((size.width - iconSize) / 2, 10);
    container.addChild(iconSprite);
  }

  const label = new Text({
    text: data.label,
    style: LABEL_STYLE,
    resolution: textResolution(),
  });
  label.anchor.set(0.5, 0);
  label.position.set(size.width / 2, data.icon ? 42 : 12);
  container.addChild(label);

  // Expanded hit area includes space around the border for connection ports.
  // Margin is dynamic: port offset (zoom-dependent) + hit radius (counter-scaled).
  container.hitArea = {
    contains: (x: number, y: number) => {
      const margin = (14 + 12) / viewState.scale;
      return (
        x >= -margin &&
        x <= size.width + margin &&
        y >= -margin &&
        y <= size.height + margin
      );
    },
  };

  return container;
}

export function resizeNode(
  container: Container,
  width: number,
  height: number,
): void {
  const size = nodeSizeMap.get(container);
  if (!size) return;
  size.width = width;
  size.height = height;

  // Redraw background (uses size via closure)
  const bg = container.children[0] as Redrawable;
  bg.__redraw?.();

  // Center icon + label vertically and horizontally
  let icon: Sprite | null = null;
  let label: Text | null = null;
  for (const child of container.children) {
    if (child instanceof Sprite) icon = child;
    else if (child instanceof Text) label = child;
  }

  if (icon && label) {
    const contentH = icon.height + 4 + label.height;
    const startY = (height - contentH) / 2;
    icon.position.set((width - icon.width) / 2, startY);
    label.position.set(width / 2, startY + icon.height + 4);
  } else if (label) {
    label.position.set(width / 2, height / 2 - label.height / 2);
  }

  // Update port positions
  const portPositions = getPortPositions(width, height);
  for (const child of container.children) {
    if (child.label === "ports") {
      for (const port of child.children) {
        const pos = portPositions[port.label as keyof typeof portPositions];
        if (pos) port.position.set(pos.x, pos.y);
      }
      break;
    }
  }
}
