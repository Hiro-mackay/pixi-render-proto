import type { FederatedPointerEvent } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import type { CanvasEdge, CanvasElement } from "../types";
import type { ElementRegistry } from "../registry/element-registry";
import type { CommandHistory } from "../commands/command";
import type { SelectionState } from "./selection-state";
import { DragCommand } from "../commands/drag-command";
import { getDescendants } from "../hierarchy/group-ops";
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
  onDragStateChange?: (dragging: boolean) => void,
): () => void {
  let dragging = false;
  let movedDistance = 0;
  let dragOffset = { x: 0, y: 0 };
  let downPos = { x: 0, y: 0 };
  let initialWorld = { x: 0, y: 0 };

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
    onDragStateChange?.(true);

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
    initialWorld = { x: world.x, y: world.y };
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
    const dx = world.x - initialWorld.x;
    const dy = world.y - initialWorld.y;

    if (element.type === "group") {
      const elStart = startPositions.get(element.id)!;
      element.x = elStart.x + dx;
      element.y = elStart.y + dy;
      sync(element);
      for (const child of cachedDescendants) {
        const childStart = startPositions.get(child.id)!;
        child.x = childStart.x + dx;
        child.y = childStart.y + dy;
        sync(child);
      }
    } else {
      element.x = world.x - dragOffset.x;
      element.y = world.y - dragOffset.y;
      sync(element);
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
    onDragStateChange?.(false);

    if (movedDistance < CLICK_THRESHOLD_PX) {
      for (const [id, pos] of startPositions) {
        const el = registry.getElement(id);
        if (el) { el.x = pos.x; el.y = pos.y; sync(el); }
      }
      selection.select(element.id);
    } else {
      const finalPositions = new Map<string, { x: number; y: number }>();
      finalPositions.set(element.id, { x: element.x, y: element.y });
      for (const desc of cachedDescendants) {
        finalPositions.set(desc.id, { x: desc.x, y: desc.y });
      }

      const cx = element.x + element.width / 2;
      const cy = element.y + element.height / 2;
      const target = findGroupAt({ x: cx, y: cy }, registry, cachedExcludeIds);

      history.execute(new DragCommand(
        element.id, registry,
        startPositions, finalPositions,
        sync, crypto.randomUUID(),
        startParentGroupId, target,
      ));
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
