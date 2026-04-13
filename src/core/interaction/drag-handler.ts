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
  let downPos = { x: 0, y: 0 };
  let initialWorld = { x: 0, y: 0 };
  let shiftHeld = false;

  // Drag participants: all elements that move together
  let participants: CanvasElement[] = [];
  let cachedEdges: CanvasEdge[] = [];
  let cachedExcludeIds = new Set<string>();
  let startPositions = new Map<string, { x: number; y: number }>();
  let startParentGroupId: string | null = null;

  const onPointerDown = (e: FederatedPointerEvent) => {
    if (selection.isResizing()) return;
    dragging = true;
    movedDistance = 0;
    shiftHeld = e.shiftKey;
    element.container.cursor = "grabbing";
    viewport.pause = true;
    onDragStateChange?.(true);

    // Determine drag participants
    const isMultiSelected = selection.getSelectedIds().size > 1 && selection.isSelected(element.id);
    if (isMultiSelected) {
      // Multi-drag: all selected elements + their descendants
      participants = collectParticipants([...selection.getSelectedIds()], registry);
    } else {
      // Single drag: this element + descendants if group
      participants = collectParticipants([element.id], registry);
    }

    const allIds = participants.map((p) => p.id);
    cachedExcludeIds = new Set(allIds);
    cachedEdges = collectEdgesForIds(allIds, registry);

    startPositions = new Map();
    for (const p of participants) {
      startPositions.set(p.id, { x: p.x, y: p.y });
    }
    startParentGroupId = element.parentGroupId;

    const world = viewport.toWorld(e.global.x, e.global.y);
    initialWorld = { x: world.x, y: world.y };
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

    for (const p of participants) {
      const start = startPositions.get(p.id);
      if (!start) continue;
      p.x = start.x + dx;
      p.y = start.y + dy;
      sync(p);
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
      // Restore original positions
      for (const [id, pos] of startPositions) {
        const el = registry.getElement(id);
        if (el) { el.x = pos.x; el.y = pos.y; sync(el); }
      }
      // Click behavior
      if (shiftHeld) {
        selection.toggle(element.id);
      } else {
        selection.select(element.id);
      }
    } else {
      const finalPositions = new Map<string, { x: number; y: number }>();
      for (const p of participants) {
        finalPositions.set(p.id, { x: p.x, y: p.y });
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

    participants = [];
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

function collectParticipants(ids: string[], registry: ElementRegistry): CanvasElement[] {
  const seen = new Set<string>();
  const result: CanvasElement[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const el = registry.getElement(id);
    if (!el) continue;
    seen.add(id);
    result.push(el);
    if (el.type === "group") {
      for (const desc of getDescendants(el.id, registry)) {
        if (!seen.has(desc.id)) {
          seen.add(desc.id);
          result.push(desc);
        }
      }
    }
  }
  return result;
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
