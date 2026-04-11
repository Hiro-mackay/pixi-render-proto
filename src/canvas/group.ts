import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { viewState } from "./view-state";
import type { Redrawable } from "./types";
import { textResolution } from "./types";

export type GroupData = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: number;
};

const GROUP_LABEL_STYLE = new TextStyle({
  fontFamily: "system-ui, sans-serif",
  fontSize: 11,
  fill: 0x718096,
  fontWeight: "bold",
  letterSpacing: 1,
});

export function createGroup(data: GroupData): Container {
  const container = new Container();
  container.label = data.id;
  container.position.set(data.x, data.y);
  container.eventMode = "static";
  container.cursor = "grab";

  const borderColor = data.color ?? 0x2d3748;
  // Halve each RGB channel independently via bitmask to avoid cross-channel bleed
  const fillColor = data.color ? (data.color & 0xfefefe) >> 1 : 0x1a1a2e;

  const bg: Redrawable = new Graphics();
  const drawBg = () => {
    bg.clear();
    bg.roundRect(0, 0, data.width, data.height, 12);
    bg.fill({ color: fillColor, alpha: 0.3 });
    bg.stroke({
      width: 2 / viewState.scale,
      color: borderColor,
      alpha: 0.6,
    });
  };
  drawBg();
  bg.__redraw = drawBg;

  const headerLine: Redrawable = new Graphics();
  const drawHeader = () => {
    headerLine.clear();
    headerLine.moveTo(0, 24);
    headerLine.lineTo(data.width, 24);
    headerLine.stroke({
      width: 1 / viewState.scale,
      color: borderColor,
      alpha: 0.3,
    });
  };
  drawHeader();
  headerLine.__redraw = drawHeader;

  container.addChild(bg);
  container.addChild(headerLine);

  const label = new Text({
    text: data.label.toUpperCase(),
    style: GROUP_LABEL_STYLE,
    resolution: textResolution(),
  });
  label.position.set(12, 6);
  container.addChild(label);

  container.hitArea = {
    contains: (x: number, y: number) =>
      x >= 0 && x <= data.width && y >= 0 && y <= 24,
  };

  return container;
}
