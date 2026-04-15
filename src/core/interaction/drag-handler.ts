import type { FederatedPointerEvent } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import type { CanvasEdge, CanvasElement } from "../types";
import type { ElementRegistry } from "../registry/element-registry";
import type { CommandHistory } from "../commands/command";
import type { SelectionState } from "./selection-state";
import type { ViewportPauseController } from "../viewport/pause-controller";
import { DragCommand } from "../commands/drag-command";
import { getDescendants } from "../hierarchy/group-ops";
import { findGroupAt } from "../hierarchy/membership";
import { updateEdgeGraphics } from "../elements/edge-renderer";

const CLICK_THRESHOLD_PX = 5;

function snapToGrid(value: number, gridSize: number | undefined): number {
  if (!gridSize) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function enableItemDrag(
  element: CanvasElement,
  viewport: Viewport,
  registry: ElementRegistry,
  history: CommandHistory,
  selection: SelectionState,
  getScale: () => number,
  sync: (el: CanvasElement) => void,
  onDragStateChange?: (dragging: boolean) => void,
  gridSize?: number,
  pauseCtrl?: ViewportPauseController,
  onDragEnd?: (movedIds: string[]) => void,
): () => void {
  let dragging = false;
  let movedDistance = 0;
  let downPos = { x: 0, y: 0 };
  let initialWorld = { x: 0, y: 0 };
  let shiftHeld = false;

  // Drag participants: all elements that move together
  let participants: CanvasElement[] = [];
  let dragRoots: string[] = [];
  let cachedEdges: CanvasEdge[] = [];
  let cachedExcludeIds = new Set<string>();
  let startPositions = new Map<string, { x: number; y: number }>();
  let startParentGroupIds = new Map<string, string | null>();

  const onPointerDown = (e: FederatedPointerEvent) => {
    if (selection.isResizing()) return;
    dragging = true;
    movedDistance = 0;
    shiftHeld = e.shiftKey;
    element.container.cursor = "grabbing";
    pauseCtrl ? pauseCtrl.acquire() : (viewport.pause = true);
    onDragStateChange?.(true);

    // Determine drag participants
    const isMultiSelected = selection.getSelectedIds().size > 1 && selection.isSelected(element.id);
    if (isMultiSelected) {
      // Filter to roots: exclude descendants whose ancestor is also selected
      dragRoots = filterToRoots(selection.getSelectedIds(), registry);
      participants = collectParticipants(dragRoots, registry);
    } else {
      dragRoots = [element.id];
      participants = collectParticipants(dragRoots, registry);
    }

    const allIds = participants.map((p) => p.id);
    cachedExcludeIds = new Set(allIds);
    cachedEdges = collectEdgesForIds(allIds, registry);

    startPositions = new Map();
    for (const p of participants) {
      startPositions.set(p.id, { x: p.x, y: p.y });
    }
    startParentGroupIds = new Map();
    for (const rootId of dragRoots) {
      const rootEl = registry.getElement(rootId);
      if (rootEl) startParentGroupIds.set(rootId, rootEl.parentGroupId);
    }

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
      p.x = snapToGrid(start.x + dx, gridSize);
      p.y = snapToGrid(start.y + dy, gridSize);
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
    pauseCtrl ? pauseCtrl.release() : (viewport.pause = false);
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

      const sessionId = crypto.randomUUID();

      const firstRoot = dragRoots[0];
      if (dragRoots.length === 1 && firstRoot) {
        const rootEl = registry.getElement(firstRoot);
        const cx = rootEl ? rootEl.x + rootEl.width / 2 : 0;
        const cy = rootEl ? rootEl.y + rootEl.height / 2 : 0;
        const target = findGroupAt({ x: cx, y: cy }, registry, cachedExcludeIds);
        history.execute(new DragCommand(
          firstRoot, registry, startPositions, finalPositions,
          sync, sessionId, startParentGroupIds.get(firstRoot) ?? null, target,
        ));
      } else {
        const commands = dragRoots.map((rootId) => {
          const rootEl = registry.getElement(rootId);
          const cx = rootEl ? rootEl.x + rootEl.width / 2 : 0;
          const cy = rootEl ? rootEl.y + rootEl.height / 2 : 0;
          const target = findGroupAt({ x: cx, y: cy }, registry, cachedExcludeIds);
          return new DragCommand(
            rootId, registry, startPositions, finalPositions,
            sync, sessionId, startParentGroupIds.get(rootId) ?? null, target,
          );
        });
        history.batch(commands);
      }
      onDragEnd?.(dragRoots);
    }

    participants = [];
    dragRoots = [];
    cachedEdges = [];
    cachedExcludeIds = new Set();
    startPositions = new Map();
    startParentGroupIds = new Map();
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

function filterToRoots(ids: ReadonlySet<string>, registry: ElementRegistry): string[] {
  const roots: string[] = [];
  for (const id of ids) {
    let el = registry.getElement(id);
    let ancestorSelected = false;
    while (el?.parentGroupId) {
      if (ids.has(el.parentGroupId)) { ancestorSelected = true; break; }
      el = registry.getElement(el.parentGroupId);
    }
    if (!ancestorSelected) roots.push(id);
  }
  return roots;
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
