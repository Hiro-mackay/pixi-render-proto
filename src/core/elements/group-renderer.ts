import { Assets, Container, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { getTextResolution, HEADER_HEIGHT } from "../types";
import type { GroupElement, Redrawable } from "../types";

import chevronDownSvg from "../../assets/icons/chevron-down.svg";
import chevronRightSvg from "../../assets/icons/chevron-right.svg";

/** @internal Exported for testing only */
export function halveColor(color: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return ((r >> 1) << 16) | ((g >> 1) << 8) | (b >> 1);
}
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
let resolvedChevrons: ChevronTextures | null = null;

function loadChevronTextures(): Promise<ChevronTextures> {
  if (!chevronPromise) {
    chevronPromise = Promise.all([
      Assets.load<Texture>(chevronDownSvg),
      Assets.load<Texture>(chevronRightSvg),
    ]).then(([down, right]) => {
      const textures = { down, right };
      resolvedChevrons = textures;
      return textures;
    });
  }
  return chevronPromise;
}

export function preloadChevronTextures(): Promise<void> {
  return loadChevronTextures().then(() => undefined);
}

export function createGroupGraphics(
  element: GroupElement,
  getScale: () => number,
): Container {
  const container = new Container();
  container.label = element.id;
  container.position.set(element.x, element.y);
  // Use passive so that edges behind the group body remain clickable.
  // The drag-handle child (header area) provides the interactive hit target.
  container.eventMode = "passive";

  const meta = element.meta;
  const borderColor = meta.color;
  const bgFill = halveColor(meta.color);

  const bg: Redrawable = new Graphics();
  bg.label = "group-bg";
  bg.eventMode = "static";
  bg.cursor = "default";
  const drawBg = () => {
    bg.clear();
    bg.roundRect(0, 0, element.width, element.height, GROUP_CORNER_RADIUS);
    bg.fill({ color: bgFill, alpha: 0.3 });
    bg.stroke({ width: 2 / getScale(), color: borderColor, alpha: 0.6 });
  };
  drawBg();
  bg.__redraw = drawBg;
  container.addChild(bg);

  // Drag handle — uses explicit hitArea (not drawn geometry) so it survives Graphics.clear()
  const dragHandle = new Graphics();
  dragHandle.label = "group-drag-handle";
  dragHandle.eventMode = "static";
  dragHandle.cursor = "grab";
  let dragHandleCoversBody = false;
  dragHandle.hitArea = {
    contains: (x: number, y: number) => {
      const h = dragHandleCoversBody ? element.height : HEADER_HEIGHT;
      return x >= 0 && x <= element.width && y >= 0 && y <= h;
    },
  };
  (dragHandle as unknown as { setCoversBody: (v: boolean) => void }).setCoversBody = (v: boolean) => {
    dragHandleCoversBody = v;
  };
  container.addChild(dragHandle);

  const iconSprite = new Sprite();
  iconSprite.width = ICON_SIZE;
  iconSprite.height = ICON_SIZE;
  iconSprite.anchor.set(0.5, 0.5);
  iconSprite.alpha = 0.5;

  const headerLine: Redrawable = new Graphics();
  headerLine.label = "group-header";
  container.addChild(headerLine);

  const label = new Text({
    text: meta.label.toUpperCase(),
    style: GROUP_LABEL_STYLE.clone(),
    resolution: getTextResolution(),
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
  toggleBtn.addChild(iconSprite);
  container.addChild(toggleBtn);

  loadChevronTextures().then((textures) => {
    iconSprite.texture = meta.collapsed ? textures.right : textures.down;
    drawHeader();
  }).catch(() => { /* chevrons already preloaded in createCanvasEngine */ });

  const drawHeader = () => {
    headerLine.clear();
    if (resolvedChevrons) {
      iconSprite.texture = meta.collapsed ? resolvedChevrons.right : resolvedChevrons.down;
    }
    toggleBtn.position.set(element.width - ICON_SIZE - 4, HEADER_HEIGHT / 2);
    if (meta.collapsed) return;
    headerLine.moveTo(0, HEADER_HEIGHT);
    headerLine.lineTo(element.width, HEADER_HEIGHT);
    headerLine.stroke({ width: 1 / getScale(), color: borderColor, alpha: 0.3 });
  };
  drawHeader();
  headerLine.__redraw = drawHeader;

  const badge = new Text({ text: "", style: BADGE_STYLE.clone(), resolution: getTextResolution() });
  badge.label = "group-badge";
  badge.visible = false;
  badge.position.set(12 + label.width + 8, 9);
  container.addChild(badge);

  return container;
}
