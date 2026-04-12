import type { FederatedPointerEvent } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import type { CanvasEdge, CanvasElement } from "../types";
import type { ElementRegistry } from "../registry/element-registry";
import type { Command, CommandHistory } from "../commands/command";
import type { SelectionState } from "./selection-state";
import { getDescendants, assignToGroup, removeFromGroup } from "../hierarchy/group-ops";
import { findGroupAt } from "../hierarchy/membership";
import { updateEdgeGraphics } from "../elements/edge-renderer";

const CLICK_THRESHOLD_PX = 5;

export function enableItemDrag(
  element: CanvasElement,
  viewport: Viewport,
  registry: ElementRegistry,
  history: CommandHistory,
  selection: SelectionState,
  getScale: () => number,
  sync: (el: CanvasElement) => void,
): () => void {
  let dragging = false;
  let movedDistance = 0;
  let dragOffset = { x: 0, y: 0 };
  let downPos = { x: 0, y: 0 };

  let cachedDescendants: CanvasElement[] = [];
  let cachedEdges: CanvasEdge[] = [];
  let cachedExcludeIds: Set<string> = new Set();
  let startPositions: Map<string, { x: number; y: number }> = new Map();
  let startParentGroupId: string | null = null;

  const onPointerDown = (e: FederatedPointerEvent) => {
    if (selection.isResizing()) return;
    dragging = true;
    movedDistance = 0;
    element.container.cursor = "grabbing";
    viewport.pause = true;

    if (element.type === "group") {
      cachedDescendants = [...getDescendants(element.id, registry)];
      const allIds = [element.id, ...cachedDescendants.map((d) => d.id)];
      cachedExcludeIds = new Set(allIds);
      cachedEdges = collectEdgesForIds(allIds, registry);
    } else {
      cachedDescendants = [];
      cachedExcludeIds = new Set();
      cachedEdges = [...registry.getEdgesForNode(element.id)];
    }

    startPositions = new Map();
    startPositions.set(element.id, { x: element.x, y: element.y });
    for (const d of cachedDescendants) {
      startPositions.set(d.id, { x: d.x, y: d.y });
    }
    startParentGroupId = element.parentGroupId;

    const world = viewport.toWorld(e.global.x, e.global.y);
    dragOffset = { x: world.x - element.x, y: world.y - element.y };
    downPos = { x: e.global.x, y: e.global.y };
    e.stopPropagation();
  };

  const onPointerMove = (e: FederatedPointerEvent) => {
    if (!dragging) return;

    if (movedDistance < CLICK_THRESHOLD_PX) {
      movedDistance = Math.hypot(e.global.x - downPos.x, e.global.y - downPos.y);
    }

    const world = viewport.toWorld(e.global.x, e.global.y);

    if (element.type === "group") {
      const dx = world.x - dragOffset.x - element.x;
      const dy = world.y - dragOffset.y - element.y;
      element.x += dx;
      element.y += dy;
      element.container.x = element.x;
      element.container.y = element.y;
      for (const child of cachedDescendants) {
        child.x += dx;
        child.y += dy;
        child.container.x = child.x;
        child.container.y = child.y;
      }
      dragOffset = { x: world.x - element.x, y: world.y - element.y };
    } else {
      element.x = world.x - dragOffset.x;
      element.y = world.y - dragOffset.y;
      element.container.x = element.x;
      element.container.y = element.y;
    }

    for (const edge of cachedEdges) {
      updateEdgeGraphics(edge, registry, getScale);
    }
    selection.update();
  };

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    element.container.cursor = "grab";
    viewport.pause = false;

    if (movedDistance < CLICK_THRESHOLD_PX) {
      // Restore positions (no drag happened)
      for (const [id, pos] of startPositions) {
        const el = registry.getElement(id);
        if (el) { el.x = pos.x; el.y = pos.y; sync(el); }
      }
      selection.select(element.id);
    } else {
      // Capture final positions (already applied during drag)
      const finalPositions = new Map<string, { x: number; y: number }>();
      finalPositions.set(element.id, { x: element.x, y: element.y });
      for (const desc of cachedDescendants) {
        finalPositions.set(desc.id, { x: desc.x, y: desc.y });
      }

      const cx = element.x + element.width / 2;
      const cy = element.y + element.height / 2;
      const target = findGroupAt({ x: cx, y: cy }, registry, cachedExcludeIds);
      const oldParent = startParentGroupId;
      const needsReparent = target !== oldParent;

      // Already applied — just record for undo
      const dragCommand: Command = {
        type: "drag",
        execute() {
          for (const [id, pos] of finalPositions) {
            const el = registry.getElement(id);
            if (el) { el.x = pos.x; el.y = pos.y; sync(el); }
          }
          if (needsReparent) {
            if (target) assignToGroup(element.id, target, registry);
            else removeFromGroup(element.id, registry);
          }
        },
        undo() {
          for (const [id, pos] of startPositions) {
            const el = registry.getElement(id);
            if (el) { el.x = pos.x; el.y = pos.y; sync(el); }
          }
          if (needsReparent) {
            if (oldParent) assignToGroup(element.id, oldParent, registry);
            else removeFromGroup(element.id, registry);
          }
        },
      };
      history.record(dragCommand);

      if (needsReparent) {
        if (target) assignToGroup(element.id, target, registry);
        else removeFromGroup(element.id, registry);
      }
    }

    cachedDescendants = [];
    cachedEdges = [];
    cachedExcludeIds = new Set();
    startPositions = new Map();
  };

  element.container.eventMode = "static";
  element.container.cursor = "grab";
  element.container.on("pointerdown", onPointerDown);
  element.container.on("globalpointermove", onPointerMove);
  element.container.on("pointerup", onPointerUp);
  element.container.on("pointerupoutside", onPointerUp);

  return () => {
    element.container.off("pointerdown", onPointerDown);
    element.container.off("globalpointermove", onPointerMove);
    element.container.off("pointerup", onPointerUp);
    element.container.off("pointerupoutside", onPointerUp);
  };
}

function collectEdgesForIds(ids: string[], registry: ElementRegistry): CanvasEdge[] {
  const seen = new Set<string>();
  const result: CanvasEdge[] = [];
  for (const id of ids) {
    for (const edge of registry.getEdgesForNode(id)) {
      if (!seen.has(edge.id)) {
        seen.add(edge.id);
        result.push(edge);
      }
    }
  }
  return result;
}
