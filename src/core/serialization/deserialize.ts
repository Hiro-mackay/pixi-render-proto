import type { CanvasEngine } from "../engine";
import type { ElementRegistry } from "../registry/element-registry";
import type { CommandHistory } from "../commands/command";
import type { SceneData } from "./schema";
import { validateSceneData } from "./validate";
import { updateVisibility } from "../hierarchy/group-ops";
import { syncElement } from "../registry/sync";
import { serialize as serializeScene } from "./serialize";

const CURRENT_VERSION = 1;

const migrators = new Map<number, (data: unknown) => unknown>();

function migrate(data: SceneData): SceneData {
  let current: unknown = data;
  let version = data.version;
  while (version < CURRENT_VERSION) {
    const migrator = migrators.get(version);
    if (!migrator) {
      throw new Error(`No migrator for version ${version} → ${version + 1}`);
    }
    current = migrator(current);
    version++;
  }
  return current as SceneData;
}

export interface DeserializeContext {
  readonly engine: CanvasEngine;
  readonly registry: ElementRegistry;
  readonly history: CommandHistory;
}

export function deserializeScene(data: unknown, ctx: DeserializeContext): void {
  const validated = validateSceneData(data);

  if (validated.version > CURRENT_VERSION) {
    throw new Error(`Unknown scene version: ${validated.version}. Max supported: ${CURRENT_VERSION}`);
  }

  const scene = validated.version < CURRENT_VERSION ? migrate(validated) : validated;

  // Snapshot current scene for rollback on failure
  const snapshot = serializeScene(ctx.registry);

  clearScene(ctx);

  try {
    applyScene(scene, ctx);
  } catch (err) {
    // Rollback: clear partial import and restore previous scene
    clearScene(ctx);
    try {
      applyScene(snapshot, ctx);
    } catch (rollbackErr) {
      console.error("Rollback after failed import also failed:", rollbackErr);
    }
    throw err;
  }

  ctx.history.clear();
}

function clearScene(ctx: DeserializeContext): void {
  for (const id of [...ctx.registry.getAllEdges().keys()]) {
    ctx.engine.removeEdge(id);
  }
  for (const id of [...ctx.registry.getAllElements().keys()]) {
    ctx.engine.removeElement(id);
  }
}

function applyScene(scene: SceneData, ctx: DeserializeContext): void {
  for (const g of scene.groups) {
    ctx.engine.addGroup(g.id, {
      label: g.label, x: g.x, y: g.y, width: g.width, height: g.height, color: g.color,
    });
    if (g.collapsed) {
      const el = ctx.registry.getElement(g.id);
      if (el?.type === "group") {
        el.meta.expandedHeight = g.expandedHeight;
        el.meta.collapsed = true;
        el.height = g.height;
      }
    }
  }

  for (const n of scene.nodes) {
    ctx.engine.addNode(n.id, {
      label: n.label, x: n.x, y: n.y, width: n.width, height: n.height, color: n.color,
    });
  }

  for (const m of scene.groupMemberships) {
    if (ctx.registry.getElement(m.childId) && ctx.registry.getElement(m.groupId)) {
      ctx.registry.setParentGroup(m.childId, m.groupId);
    }
  }

  for (const g of scene.groups) {
    if (g.collapsed) {
      updateVisibility(g.id, ctx.registry, syncElement);
    }
  }

  for (const e of scene.edges) {
    if (!ctx.registry.getElement(e.sourceId) || !ctx.registry.getElement(e.targetId)) continue;
    ctx.engine.addEdge(e.id, {
      sourceId: e.sourceId, sourceSide: e.sourceSide,
      targetId: e.targetId, targetSide: e.targetSide,
      label: e.label, labelColor: e.labelColor,
    });
  }

  if (scene.viewport) {
    ctx.engine.viewport.moveCenter(scene.viewport.x, scene.viewport.y);
    ctx.engine.viewport.setZoom(scene.viewport.zoom, true);
  }
}
