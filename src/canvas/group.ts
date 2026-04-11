import { Assets, Container, FederatedPointerEvent, Graphics, Sprite, Text, TextStyle, Texture } from "pixi.js";
import { viewState } from "./view-state";
import type { GroupMeta, Redrawable } from "./types";
import { textResolution, elementSizeMap, groupMetaMap, groupChildrenMap } from "./types";
import { getDescendants } from "./group-hierarchy";

import chevronDownSvg from "../assets/icons/chevron-down.svg";
import chevronRightSvg from "../assets/icons/chevron-right.svg";

export type GroupData = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: number;
};

const HEADER_HEIGHT = 28;
const LABEL_BG = "group-bg";
const LABEL_HEADER = "group-header";
const LABEL_TOGGLE = "group-toggle";
const LABEL_BADGE = "group-badge";
const ICON_SIZE = 12;

const GROUP_LABEL_STYLE = new TextStyle({
  fontFamily: "system-ui, sans-serif",
  fontSize: 11,
  fill: 0x718096,
  fontWeight: "bold",
  letterSpacing: 1,
});

export type CollapseCallback = () => void;

type ChevronTextures = { down: Texture; right: Texture };
let chevronPromise: Promise<ChevronTextures> | null = null;
let chevronCache: ChevronTextures | null = null;

function loadChevronTextures(): Promise<ChevronTextures> {
  if (!chevronPromise) {
    chevronPromise = Promise.all([
      Assets.load<Texture>(chevronDownSvg),
      Assets.load<Texture>(chevronRightSvg),
    ]).then(([down, right]) => {
      chevronCache = { down, right };
      return chevronCache;
    });
  }
  return chevronPromise;
}

export function createGroup(
  data: GroupData,
  onCollapse?: CollapseCallback,
): Container {
  const container = new Container();
  container.label = data.id;
  container.position.set(data.x, data.y);
  container.eventMode = "static";
  container.cursor = "grab";

  const borderColor = data.color ?? 0x2d3748;
  const fillColor = data.color ? (data.color & 0xfefefe) >> 1 : 0x1a1a2e;

  const size = { width: data.width, height: data.height };
  elementSizeMap.set(container, size);

  let expandedHeight = data.height;

  const meta: GroupMeta = {
    id: data.id,
    label: data.label,
    color: borderColor,
    collapsed: false,
  };
  groupMetaMap.set(container, meta);
  groupChildrenMap.set(container, new Set());

  // --- Background ---
  const bg: Redrawable = new Graphics() as Redrawable;
  bg.label = LABEL_BG;
  const drawBg = () => {
    bg.clear();
    bg.roundRect(0, 0, size.width, size.height, 12);
    bg.fill({ color: fillColor, alpha: 0.3 });
    bg.stroke({
      width: 2 / viewState.scale,
      color: borderColor,
      alpha: 0.6,
    });
  };
  drawBg();
  bg.__redraw = drawBg;
  container.addChild(bg);

  // --- Header separator ---
  const headerLine: Redrawable = new Graphics() as Redrawable;
  headerLine.label = LABEL_HEADER;
  const drawHeader = () => {
    headerLine.clear();
    if (meta.collapsed) return;
    headerLine.moveTo(0, HEADER_HEIGHT);
    headerLine.lineTo(size.width, HEADER_HEIGHT);
    headerLine.stroke({
      width: 1 / viewState.scale,
      color: borderColor,
      alpha: 0.3,
    });
  };
  drawHeader();
  headerLine.__redraw = drawHeader;
  container.addChild(headerLine);

  // --- Label ---
  const label = new Text({
    text: data.label.toUpperCase(),
    style: GROUP_LABEL_STYLE,
    resolution: textResolution(),
  });
  label.position.set(12, 7);
  container.addChild(label);

  // --- Toggle icon (world-space fixed size, scales with zoom like everything else) ---
  const toggleBtn = new Container();
  toggleBtn.label = LABEL_TOGGLE;
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

  toggleBtn.position.set(size.width - ICON_SIZE - 4, HEADER_HEIGHT / 2);
  container.addChild(toggleBtn);

  toggleBtn.on("pointerenter", () => {
    iconSprite.alpha = 1.0;
  });
  toggleBtn.on("pointerleave", () => {
    iconSprite.alpha = 0.5;
  });

  toggleBtn.on("pointerdown", (e: FederatedPointerEvent) => {
    e.stopPropagation();
    meta.collapsed = !meta.collapsed;

    if (meta.collapsed) {
      expandedHeight = size.height;
      size.height = HEADER_HEIGHT;
    } else {
      size.height = expandedHeight;
    }

    // Update icon
    if (chevronCache) {
      iconSprite.texture = meta.collapsed ? chevronCache.right : chevronCache.down;
    }

    const descendants = getDescendants(container);
    for (const desc of descendants) {
      desc.visible = !meta.collapsed;
    }

    updateBadge(container, meta.collapsed ? descendants.length : 0);
    redrawGroupGraphics(container);
    onCollapse?.();
  });

  // --- Badge (child count when collapsed) ---
  const badge = new Text({
    text: "",
    style: new TextStyle({
      fontFamily: "system-ui, sans-serif",
      fontSize: 9,
      fill: 0x94a3b8,
    }),
    resolution: textResolution(),
  });
  badge.label = LABEL_BADGE;
  badge.visible = false;
  // Position right after the label text
  badge.position.set(12 + label.width + 8, 9);
  container.addChild(badge);

  return container;
}

export function resizeGroup(
  container: Container,
  width: number,
  height: number,
): void {
  const size = elementSizeMap.get(container);
  if (!size) return;
  size.width = width;
  size.height = height;
  redrawGroupGraphics(container);

  for (const child of container.children) {
    if (child.label === LABEL_TOGGLE) {
      child.position.set(width - ICON_SIZE - 4, HEADER_HEIGHT / 2);
      break;
    }
  }
}

export function isCollapsed(container: Container): boolean {
  return groupMetaMap.get(container)?.collapsed ?? false;
}

function updateBadge(container: Container, count: number): void {
  for (const child of container.children) {
    if (child.label === LABEL_BADGE && child instanceof Text) {
      if (count > 0) {
        child.text = `${count} items`;
        child.visible = true;
      } else {
        child.visible = false;
      }
      break;
    }
  }
}

function redrawGroupGraphics(container: Container): void {
  for (const child of container.children) {
    const l = child.label;
    if (l === LABEL_BG || l === LABEL_HEADER) {
      (child as Redrawable).__redraw?.();
    }
  }
}

export { HEADER_HEIGHT };
