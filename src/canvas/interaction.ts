import { Container, FederatedPointerEvent } from "pixi.js";
import { Viewport } from "pixi-viewport";
import { type EdgeDisplay, updateEdge } from "./edge";
import { SelectionManager } from "./selection";
import { nodeSizeMap } from "./types";

const CLICK_THRESHOLD_PX = 5;

export function enableDrag(
  node: Container,
  viewport: Viewport,
  edges: EdgeDisplay[],
  selection: SelectionManager,
): void {
  let dragging = false;
  let movedDistance = 0;
  let dragOffset = { x: 0, y: 0 };
  let downPos = { x: 0, y: 0 };

  node.on("pointerdown", (e: FederatedPointerEvent) => {
    if (selection.isResizing()) return;
    dragging = true;
    movedDistance = 0;
    node.cursor = "grabbing";
    viewport.pause = true;

    const worldPos = viewport.toWorld(e.global.x, e.global.y);
    dragOffset.x = worldPos.x - node.x;
    dragOffset.y = worldPos.y - node.y;
    downPos.x = e.global.x;
    downPos.y = e.global.y;

    e.stopPropagation();
  });

  node.on("globalpointermove", (e: FederatedPointerEvent) => {
    if (!dragging) return;

    const dx = e.global.x - downPos.x;
    const dy = e.global.y - downPos.y;
    movedDistance = Math.max(movedDistance, Math.hypot(dx, dy));

    const worldPos = viewport.toWorld(e.global.x, e.global.y);
    node.x = worldPos.x - dragOffset.x;
    node.y = worldPos.y - dragOffset.y;

    const related = edges.filter(
      (edge) => edge.sourceNode === node || edge.targetNode === node,
    );
    for (const edge of related) {
      updateEdge(edge);
    }

    // Keep selection outline following the dragged node
    selection.update();
  });

  const finish = () => {
    if (!dragging) return;
    const wasClick = movedDistance < CLICK_THRESHOLD_PX;
    dragging = false;
    node.cursor = "grab";
    viewport.pause = false;

    if (wasClick) {
      const size = nodeSizeMap.get(node);
      if (size) {
        selection.select(node, size.width, size.height);
      }
    }
  };

  node.on("pointerup", finish);
  node.on("pointerupoutside", finish);
}

export function enableGroupDrag(
  group: Container,
  childNodes: Container[],
  viewport: Viewport,
  edges: EdgeDisplay[],
  selection: SelectionManager,
): void {
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };

  group.on("pointerdown", (e: FederatedPointerEvent) => {
    dragging = true;
    group.cursor = "grabbing";
    viewport.pause = true;

    const worldPos = viewport.toWorld(e.global.x, e.global.y);
    dragOffset.x = worldPos.x - group.x;
    dragOffset.y = worldPos.y - group.y;

    e.stopPropagation();
  });

  group.on("globalpointermove", (e: FederatedPointerEvent) => {
    if (!dragging) return;

    const worldPos = viewport.toWorld(e.global.x, e.global.y);
    const dx = worldPos.x - dragOffset.x - group.x;
    const dy = worldPos.y - dragOffset.y - group.y;

    group.x += dx;
    group.y += dy;

    for (const child of childNodes) {
      child.x += dx;
      child.y += dy;
    }

    const affected = edges.filter(
      (edge) =>
        childNodes.includes(edge.sourceNode) ||
        childNodes.includes(edge.targetNode),
    );
    for (const edge of affected) {
      updateEdge(edge);
    }

    dragOffset.x = worldPos.x - group.x;
    dragOffset.y = worldPos.y - group.y;

    // Keep selection outline following dragged node
    selection.update();
  });

  const stopDrag = () => {
    if (!dragging) return;
    dragging = false;
    group.cursor = "grab";
    viewport.pause = false;
  };

  group.on("pointerup", stopDrag);
  group.on("pointerupoutside", stopDrag);
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

/**
 * Clear selection when clicking on empty viewport space.
 */
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
