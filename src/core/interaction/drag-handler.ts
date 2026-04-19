import { Graphics, type FederatedPointerEvent } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import { ACCENT_COLOR, type CanvasEdge, type CanvasElement } from "../types";
import type { ElementRegistry } from "../registry/element-registry";
import type { CommandHistory } from "../commands/command";
import type { SelectionState } from "./selection-state";
import type { ViewportPauseController } from "../viewport/pause-controller";
import { DragCommand } from "../commands/drag-command";
import { getDescendants } from "../hierarchy/group-ops";
import { findGroupAt } from "../hierarchy/membership";
import { updateEdgeGraphics } from "../elements/edge-renderer";
import { drawHighlight } from "./ghost-graphics";

import { snapToGrid } from "../geometry/snap";

const CLICK_THRESHOLD_PX = 5;

export interface ItemDragOptions {
  readonly element: CanvasElement;
  readonly viewport: Viewport;
  readonly registry: ElementRegistry;
  readonly history: CommandHistory;
  readonly selection: SelectionState;
  readonly getScale: () => number;
  readonly sync: (el: CanvasElement) => void;
  readonly onDragStateChange?: (dragging: boolean) => void;
  readonly gridSize?: number;
  readonly pauseCtrl?: ViewportPauseController;
  readonly onDragEnd?: (movedIds: string[]) => void;
  readonly ghostLayer?: import("pixi.js").Container;
}

const DROP_HIGHLIGHT_COLOR = ACCENT_COLOR;

export function enableItemDrag(opts: ItemDragOptions): () => void {
  const { element, viewport, registry, history, selection, getScale, sync,
    onDragStateChange, gridSize, pauseCtrl, onDragEnd, ghostLayer } = opts;
  let dragging = false;
  let movedDistance = 0;
  let downPos = { x: 0, y: 0 };
  let initialWorld = { x: 0, y: 0 };
  let shiftHeld = false;

  // Drop-target highlight (lazy-created on first drag)
  let dropHighlight: Graphics | null = null;
  const getDropHighlight = (): Graphics => {
    if (!dropHighlight) {
      dropHighlight = new Graphics();
      dropHighlight.visible = false;
      ghostLayer?.addChild(dropHighlight);
    }
    return dropHighlight;
  };
  let highlightedGroupId: string | null = null;

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
    dragTarget.cursor = "grabbing";
    pauseCtrl ? pauseCtrl.acquire() : (viewport.pause = true);
    onDragStateChange?.(true);

    // Select on pointerdown so outline/handles are visible during drag (Figma behavior)
    if (!shiftHeld && !selection.isSelected(element.id)) {
      selection.select(element.id);
    }

    // Determine drag participants
    const isMultiSelected = selection.getSelectedIds().size > 1 && selection.isSelected(element.id);
    if (isMultiSelected) {
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

    // Highlight the drop-target group
    if (movedDistance >= CLICK_THRESHOLD_PX) {
      const firstRoot = dragRoots[0];
      const rootEl = firstRoot ? registry.getElement(firstRoot) : undefined;
      const cx = rootEl ? rootEl.x + rootEl.width / 2 : 0;
      const cy = rootEl ? rootEl.y + rootEl.height / 2 : 0;
      const targetId = findGroupAt({ x: cx, y: cy }, registry, cachedExcludeIds);
      if (targetId !== highlightedGroupId) {
        highlightedGroupId = targetId;
        const targetEl = targetId ? registry.getElement(targetId) : undefined;
        drawHighlight(getDropHighlight(), targetEl ?? null, getScale(), DROP_HIGHLIGHT_COLOR);
      }
    }
  };

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    dragTarget.cursor = "grab";
    pauseCtrl ? pauseCtrl.release() : (viewport.pause = false);
    onDragStateChange?.(false);
    highlightedGroupId = null;
    drawHighlight(getDropHighlight(), null, getScale(), DROP_HIGHLIGHT_COLOR);

    if (movedDistance < CLICK_THRESHOLD_PX) {
      // Restore original positions and edge graphics
      for (const [id, pos] of startPositions) {
        const el = registry.getElement(id);
        if (el) { el.x = pos.x; el.y = pos.y; sync(el); }
      }
      for (const edge of cachedEdges) {
        updateEdgeGraphics(edge, registry, getScale);
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

  // For groups, bind to the drag-handle child so edges behind the group body remain clickable.
  // For nodes, bind to the container directly.
  const dragTarget = element.type === "group"
    ? element.container.children.find((c) => c.label === "group-drag-handle") ?? element.container
    : element.container;
  if (element.type !== "group") {
    element.container.eventMode = "static";
    element.container.cursor = "grab";
  }
  dragTarget.on("pointerdown", onPointerDown);
  dragTarget.on("globalpointermove", onPointerMove);
  dragTarget.on("pointerup", onPointerUp);
  dragTarget.on("pointerupoutside", onPointerUp);

  return () => {
    dragTarget.off("pointerdown", onPointerDown);
    dragTarget.off("globalpointermove", onPointerMove);
    dragTarget.off("pointerup", onPointerUp);
    dragTarget.off("pointerupoutside", onPointerUp);
    if (dropHighlight) {
      dropHighlight.removeFromParent();
      dropHighlight.destroy();
    }
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
