import { Container, Graphics, Text, TextStyle, Sprite } from "pixi.js";
import { getTextResolution } from "../types";
import type { NodeElement, Redrawable } from "../types";

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

export function createNodeGraphics(
  element: NodeElement,
  getScale: () => number,
): Container {
  const container = new Container();
  container.label = element.id;
  container.position.set(element.x, element.y);
  container.eventMode = "static";
  container.cursor = "grab";

  const bg: Redrawable = new Graphics();
  container.addChild(bg);

  let iconSprite: Sprite | null = null;
  if (element.meta.icon) {
    iconSprite = new Sprite(element.meta.icon);
    iconSprite.width = ICON_SIZE;
    iconSprite.height = ICON_SIZE;
    container.addChild(iconSprite);
  }

  const label = new Text({
    text: element.meta.label,
    style: LABEL_STYLE.clone(),
    resolution: getTextResolution(),
  });
  label.anchor.set(0.5, 0);
  container.addChild(label);

  const drawBg = () => {
    const color = element.meta.color ?? DEFAULT_NODE_COLOR;
    bg.clear();
    bg.roundRect(0, 0, element.width, element.height, NODE_CORNER_RADIUS);
    bg.fill(color);
    bg.stroke({ width: NODE_STROKE_WIDTH / getScale(), color: NODE_STROKE_COLOR });
    if (iconSprite) {
      iconSprite.position.set((element.width - ICON_SIZE) / 2, 10);
    }
    label.text = element.meta.label;
    label.style.wordWrapWidth = Math.max(element.width - 16, 20);
    label.position.set(element.width / 2, element.meta.icon ? 42 : 12);
  };
  drawBg();
  bg.__redraw = drawBg;

  return container;
}
