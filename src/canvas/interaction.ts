import { Container, FederatedPointerEvent } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { type EdgeDisplay, updateEdge } from "./edge";
import { SelectionManager } from "./selection";
import { elementSizeMap, groupMetaMap } from "./types";
import {
  getDescendants,
  findGroupAt,
  assignToGroup,
  removeFromGroup,
  getParentGroup,
  isDescendantOf,
} from "./group-hierarchy";

const CLICK_THRESHOLD_PX = 5;

export type GroupHighlight = {
  show: (group: Container) => void;
  hide: () => void;
};

export type DragContext = {
  viewport: Viewport;
  edges: EdgeDisplay[];
  selection: SelectionManager;
  allGroups: Container[];
  groupHighlight: GroupHighlight;
};

export function enableItemDrag(item: Container, ctx: DragContext): void {
  const { viewport, edges, selection, allGroups, groupHighlight } = ctx;
  const isGroup = groupMetaMap.has(item);
  const itemSize = elementSizeMap.get(item) ?? { width: 0, height: 0 };

  let dragging = false;
  let movedDistance = 0;
  let dragOffset = { x: 0, y: 0 };
  let downPos = { x: 0, y: 0 };

  // Cached at pointerdown — avoid per-frame allocation
  let cachedDescendants: Container[] = [];
  let cachedCandidates: Container[] = [];
  let cachedEdges: EdgeDisplay[] = [];

  item.on("pointerdown", (e: FederatedPointerEvent) => {
    if (selection.isResizing()) return;
    dragging = true;
    movedDistance = 0;
    item.cursor = "grabbing";
    viewport.pause = true;

    // Build caches once per drag session
    if (isGroup) {
      cachedDescendants = getDescendants(item);
      const nodeSet = new Set(
        cachedDescendants.filter((d) => !groupMetaMap.has(d)),
      );
      cachedEdges = edges.filter(
        (e) => nodeSet.has(e.sourceNode) || nodeSet.has(e.targetNode),
      );
      cachedCandidates = allGroups.filter(
        (g) => g !== item && !isDescendantOf(g, item),
      );
    } else {
      cachedEdges = edges.filter(
        (e) => e.sourceNode === item || e.targetNode === item,
      );
      cachedCandidates = allGroups;
    }

    const worldPos = viewport.toWorld(e.global.x, e.global.y);
    dragOffset.x = worldPos.x - item.x;
    dragOffset.y = worldPos.y - item.y;
    downPos.x = e.global.x;
    downPos.y = e.global.y;

    e.stopPropagation();
  });

  item.on("globalpointermove", (e: FederatedPointerEvent) => {
    if (!dragging) return;

    if (movedDistance < CLICK_THRESHOLD_PX) {
      const screenDx = e.global.x - downPos.x;
      const screenDy = e.global.y - downPos.y;
      movedDistance = Math.hypot(screenDx, screenDy);
    }

    const worldPos = viewport.toWorld(e.global.x, e.global.y);

    if (isGroup) {
      const dx = worldPos.x - dragOffset.x - item.x;
      const dy = worldPos.y - dragOffset.y - item.y;
      item.x += dx;
      item.y += dy;
      for (const child of cachedDescendants) {
        child.x += dx;
        child.y += dy;
      }
      dragOffset.x = worldPos.x - item.x;
      dragOffset.y = worldPos.y - item.y;
    } else {
      item.x = worldPos.x - dragOffset.x;
      item.y = worldPos.y - dragOffset.y;
    }

    // Real-time group membership: assign/remove as item moves
    const cx = item.x + itemSize.width / 2;
    const cy = item.y + itemSize.height / 2;
    const candidate = findGroupAt(cachedCandidates, cx, cy);
    const currentParent = getParentGroup(item);

    if (candidate && candidate !== item && candidate !== currentParent) {
      groupHighlight.show(candidate);
      assignToGroup(item, candidate);
    } else if (!candidate && currentParent) {
      groupHighlight.hide();
      removeFromGroup(item);
    } else if (candidate && candidate !== item) {
      groupHighlight.show(candidate);
    } else {
      groupHighlight.hide();
    }

    for (const edge of cachedEdges) {
      updateEdge(edge);
    }

    selection.update();
  });

  const finish = () => {
    if (!dragging) return;
    const wasClick = movedDistance < CLICK_THRESHOLD_PX;
    dragging = false;
    item.cursor = "grab";
    viewport.pause = false;
    groupHighlight.hide();

    if (wasClick) {
      if (itemSize.width > 0) {
        selection.select(item, itemSize.width, itemSize.height);
      }
    }

    cachedDescendants = [];
    cachedCandidates = [];
    cachedEdges = [];
  };

  item.on("pointerup", finish);
  item.on("pointerupoutside", finish);
}

export function enableEdgeClick(
  edge: EdgeDisplay,
  selection: SelectionManager,
): void {
  let downPos = { x: 0, y: 0 };

  edge.hitLine.on("pointerdown", (e: FederatedPointerEvent) => {
    downPos.x = e.global.x;
    downPos.y = e.global.y;
    e.stopPropagation();
  });

  edge.hitLine.on("pointerup", (e: FederatedPointerEvent) => {
    const dx = e.global.x - downPos.x;
    const dy = e.global.y - downPos.y;
    if (Math.hypot(dx, dy) < CLICK_THRESHOLD_PX) {
      selection.selectEdge(edge);
    }
  });
}

export function enableDeselectOnEmptyClick(
  viewport: Viewport,
  selection: SelectionManager,
): void {
  let downPos = { x: 0, y: 0 };

  viewport.on("pointerdown", (e: FederatedPointerEvent) => {
    downPos.x = e.global.x;
    downPos.y = e.global.y;
  });

  viewport.on("pointerup", (e: FederatedPointerEvent) => {
    const dx = e.global.x - downPos.x;
    const dy = e.global.y - downPos.y;
    if (Math.hypot(dx, dy) < CLICK_THRESHOLD_PX) {
      selection.clear();
    }
  });
}
