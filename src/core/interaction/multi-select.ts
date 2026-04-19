import { Graphics } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import type { ReadonlyElementRegistry } from "../registry/element-registry";
import type { SelectionState } from "./selection-state";
import type { ViewportPauseController } from "../viewport/pause-controller";

const MARQUEE_COLOR = 0x3b82f6;
const MARQUEE_FILL_ALPHA = 0.08;
const MARQUEE_STROKE_ALPHA = 0.5;
const DRAG_THRESHOLD = 5;

export function enableMarqueeSelect(
  viewport: Viewport,
  registry: ReadonlyElementRegistry,
  selection: SelectionState,
  getScale: () => number,
  onClearSelection: () => void,
  pauseCtrl?: ViewportPauseController,
): () => void {
  const marquee = new Graphics();
  marquee.visible = false;
  viewport.addChild(marquee);

  let active = false;
  let startWorld = { x: 0, y: 0 };
  let downOnBackground = false;
  let downScreen = { x: 0, y: 0 };
  let shiftHeld = false;

  const onPointerDown = (e: FederatedPointerEvent) => {
    downOnBackground = e.target === viewport;
    if (!downOnBackground) return;
    // Pause viewport immediately to prevent pan jitter before marquee threshold
    pauseCtrl ? pauseCtrl.acquire() : (viewport.pause = true);
    downScreen = { x: e.globalX, y: e.globalY };
    shiftHeld = e.shiftKey;
    const world = viewport.toWorld(e.global.x, e.global.y);
    startWorld = { x: world.x, y: world.y };
  };

  const onPointerMove = (e: FederatedPointerEvent) => {
    if (!downOnBackground) return;
    const dist = Math.hypot(e.globalX - downScreen.x, e.globalY - downScreen.y);
    if (!active && dist >= DRAG_THRESHOLD) {
      active = true;
      marquee.visible = true;
    }
    if (!active) return;

    const world = viewport.toWorld(e.global.x, e.global.y);
    const x = Math.min(startWorld.x, world.x);
    const y = Math.min(startWorld.y, world.y);
    const w = Math.abs(world.x - startWorld.x);
    const h = Math.abs(world.y - startWorld.y);
    const scale = getScale();

    marquee.clear();
    marquee.rect(x, y, w, h);
    marquee.fill({ color: MARQUEE_COLOR, alpha: MARQUEE_FILL_ALPHA });
    marquee.stroke({ width: 1 / scale, color: MARQUEE_COLOR, alpha: MARQUEE_STROKE_ALPHA });
  };

  const onPointerUp = (e: FederatedPointerEvent) => {
    if (!downOnBackground) return;
    downOnBackground = false;

    if (active) {
      active = false;
      marquee.clear();
      marquee.visible = false;
      pauseCtrl ? pauseCtrl.release() : (viewport.pause = false);

      const world = viewport.toWorld(e.global.x, e.global.y);
      const x1 = Math.min(startWorld.x, world.x);
      const y1 = Math.min(startWorld.y, world.y);
      const x2 = Math.max(startWorld.x, world.x);
      const y2 = Math.max(startWorld.y, world.y);

      // Collect elements intersecting the marquee rect.
      // Groups are only included if fully enclosed by the marquee (Figma behavior:
      // dragging inside a group selects its children, not the group itself).
      const hitSet = new Set<string>();
      for (const el of registry.getAllElements().values()) {
        if (!el.visible) continue;
        const intersects = el.x + el.width >= x1 && el.x <= x2 && el.y + el.height >= y1 && el.y <= y2;
        if (!intersects) continue;
        if (el.type === "group") {
          const fullyEnclosed = el.x >= x1 && el.y >= y1 && el.x + el.width <= x2 && el.y + el.height <= y2;
          if (!fullyEnclosed) continue;
        }
        hitSet.add(el.id);
      }
      // Exclude children whose parent group is also selected (prevents double-move)
      const hitIds: string[] = [];
      for (const id of hitSet) {
        const el = registry.getElement(id);
        if (el?.parentGroupId && hitSet.has(el.parentGroupId)) continue;
        hitIds.push(id);
      }

      if (shiftHeld) {
        for (const id of hitIds) selection.toggle(id);
      } else {
        selection.selectMultiple(hitIds);
      }
    } else {
      // Click on background (no drag) → clear selection
      pauseCtrl ? pauseCtrl.release() : (viewport.pause = false);
      const dist = Math.hypot(e.globalX - downScreen.x, e.globalY - downScreen.y);
      if (dist < DRAG_THRESHOLD) onClearSelection();
    }
  };

  viewport.on("pointerdown", onPointerDown);
  viewport.on("globalpointermove", onPointerMove);
  viewport.on("pointerup", onPointerUp);
  viewport.on("pointerupoutside", onPointerUp);

  return () => {
    viewport.off("pointerdown", onPointerDown);
    viewport.off("globalpointermove", onPointerMove);
    viewport.off("pointerup", onPointerUp);
    viewport.off("pointerupoutside", onPointerUp);
    marquee.removeFromParent();
    marquee.destroy();
  };
}
