import { Container, Graphics, Text, TextStyle, Sprite } from "pixi.js";
import { TEXT_RESOLUTION } from "../types";
import type { NodeMeta, Redrawable } from "../types";

const NODE_STROKE_WIDTH = 1.5;
const NODE_STROKE_COLOR = 0x4a5568;
const NODE_CORNER_RADIUS = 8;
const DEFAULT_NODE_COLOR = 0x2d3748;
const ICON_SIZE = 28;

const LABEL_STYLE = new TextStyle({
  fontFamily: "system-ui, sans-serif",
  fontSize: 12,
  fill: 0xffffff,
  wordWrap: true,
  wordWrapWidth: 120,
  align: "center",
});

interface NodeRenderData {
  readonly id: string;
  readonly meta: NodeMeta;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function createNodeGraphics(
  data: NodeRenderData,
  getScale: () => number,
): Container {
  const container = new Container();
  container.label = data.id;
  container.position.set(data.x, data.y);
  container.eventMode = "static";
  container.cursor = "grab";

  const meta = data.meta;
  const color = meta.color ?? DEFAULT_NODE_COLOR;

  const bg: Redrawable = new Graphics();
  const drawBg = () => {
    bg.clear();
    bg.roundRect(0, 0, data.width, data.height, NODE_CORNER_RADIUS);
    bg.fill(color);
    bg.stroke({ width: NODE_STROKE_WIDTH / getScale(), color: NODE_STROKE_COLOR });
  };
  drawBg();
  bg.__redraw = drawBg;
  container.addChild(bg);

  if (meta.icon) {
    const iconSprite = new Sprite(meta.icon);
    iconSprite.width = ICON_SIZE;
    iconSprite.height = ICON_SIZE;
    iconSprite.position.set((data.width - ICON_SIZE) / 2, 10);
    container.addChild(iconSprite);
  }

  const label = new Text({
    text: meta.label,
    style: LABEL_STYLE,
    resolution: TEXT_RESOLUTION,
  });
  label.anchor.set(0.5, 0);
  label.position.set(data.width / 2, meta.icon ? 42 : 12);
  container.addChild(label);

  return container;
}
