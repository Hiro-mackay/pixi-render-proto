import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { TEXT_RESOLUTION } from "../types";
import type { GroupMeta, Redrawable } from "../types";

import chevronDownSvg from "../../assets/icons/chevron-down.svg";
import chevronRightSvg from "../../assets/icons/chevron-right.svg";

export const HEADER_HEIGHT = 28;
const ICON_SIZE = 12;
const GROUP_CORNER_RADIUS = 12;

const GROUP_LABEL_STYLE = new TextStyle({
  fontFamily: "system-ui, sans-serif",
  fontSize: 11,
  fill: 0x718096,
  fontWeight: "bold",
  letterSpacing: 1,
});

const BADGE_STYLE = new TextStyle({
  fontFamily: "system-ui, sans-serif",
  fontSize: 9,
  fill: 0x94a3b8,
});

type ChevronTextures = { down: Texture; right: Texture };
let chevronPromise: Promise<ChevronTextures> | null = null;

function loadChevronTextures(): Promise<ChevronTextures> {
  if (!chevronPromise) {
    chevronPromise = Promise.all([
      Assets.load<Texture>(chevronDownSvg),
      Assets.load<Texture>(chevronRightSvg),
    ]).then(([down, right]) => ({ down, right }));
  }
  return chevronPromise;
}

interface GroupRenderData {
  readonly id: string;
  readonly meta: GroupMeta;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function createGroupGraphics(
  data: GroupRenderData,
  getScale: () => number,
): Container {
  const container = new Container();
  container.label = data.id;
  container.position.set(data.x, data.y);
  container.eventMode = "static";
  container.cursor = "grab";

  const meta = data.meta;
  const borderColor = meta.color;
  const fillColor = (meta.color & 0xfefefe) >> 1;

  const bg: Redrawable = new Graphics();
  bg.label = "group-bg";
  const drawBg = () => {
    bg.clear();
    bg.roundRect(0, 0, data.width, data.height, GROUP_CORNER_RADIUS);
    bg.fill({ color: fillColor, alpha: 0.3 });
    bg.stroke({ width: 2 / getScale(), color: borderColor, alpha: 0.6 });
  };
  drawBg();
  bg.__redraw = drawBg;
  container.addChild(bg);

  const headerLine: Redrawable = new Graphics();
  headerLine.label = "group-header";
  const drawHeader = () => {
    headerLine.clear();
    if (meta.collapsed) return;
    headerLine.moveTo(0, HEADER_HEIGHT);
    headerLine.lineTo(data.width, HEADER_HEIGHT);
    headerLine.stroke({ width: 1 / getScale(), color: borderColor, alpha: 0.3 });
  };
  drawHeader();
  headerLine.__redraw = drawHeader;
  container.addChild(headerLine);

  const label = new Text({
    text: meta.label.toUpperCase(),
    style: GROUP_LABEL_STYLE,
    resolution: TEXT_RESOLUTION,
  });
  label.position.set(12, 7);
  container.addChild(label);

  const toggleBtn = new Container();
  toggleBtn.label = "group-toggle";
  toggleBtn.eventMode = "static";
  toggleBtn.cursor = "pointer";
  toggleBtn.hitArea = {
    contains: (x: number, y: number) =>
      x >= -ICON_SIZE && x <= ICON_SIZE && y >= -ICON_SIZE && y <= ICON_SIZE,
  };

  const iconSprite = new Sprite();
  iconSprite.width = ICON_SIZE;
  iconSprite.height = ICON_SIZE;
  iconSprite.anchor.set(0.5, 0.5);
  iconSprite.alpha = 0.5;
  toggleBtn.addChild(iconSprite);

  loadChevronTextures().then((textures) => {
    iconSprite.texture = meta.collapsed ? textures.right : textures.down;
  });

  toggleBtn.position.set(data.width - ICON_SIZE - 4, HEADER_HEIGHT / 2);
  container.addChild(toggleBtn);

  const badge = new Text({ text: "", style: BADGE_STYLE, resolution: TEXT_RESOLUTION });
  badge.label = "group-badge";
  badge.visible = false;
  badge.position.set(12 + label.width + 8, 9);
  container.addChild(badge);

  return container;
}
