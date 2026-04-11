import { Container, Graphics, Text, TextStyle, Sprite, Texture } from "pixi.js";
import { viewState } from "./view-state";
import type { Redrawable } from "./types";
import { textResolution, nodeSizeMap } from "./types";

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
  nodeSizeMap.set(container, { width: data.width, height: data.height });
  container.eventMode = "static";
  container.cursor = "grab";

  const bg: Redrawable = new Graphics();
  const color = data.color ?? 0x2d3748;

  const drawBg = () => {
    bg.clear();
    bg.roundRect(0, 0, data.width, data.height, 8);
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
    iconSprite.position.set((data.width - iconSize) / 2, 10);
    container.addChild(iconSprite);
  }

  const label = new Text({
    text: data.label,
    style: LABEL_STYLE,
    resolution: textResolution(),
  });
  label.anchor.set(0.5, 0);
  label.position.set(data.width / 2, data.icon ? 42 : 12);
  container.addChild(label);

  // Expanded hit area includes space around the border for connection ports.
  // Without this, port hit zones that extend beyond the node would be
  // rejected by the parent's hit test.
  const PORT_MARGIN = 12;
  container.hitArea = {
    contains: (x: number, y: number) =>
      x >= -PORT_MARGIN &&
      x <= data.width + PORT_MARGIN &&
      y >= -PORT_MARGIN &&
      y <= data.height + PORT_MARGIN,
  };

  return container;
}
