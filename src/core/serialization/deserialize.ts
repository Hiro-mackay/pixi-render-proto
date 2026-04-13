import type { CanvasEngine } from "../engine";
import type { ElementRegistry } from "../registry/element-registry";
import type { CommandHistory } from "../commands/command";
import type { SceneData } from "./schema";
import { updateVisibility } from "../hierarchy/group-ops";
import { syncElement } from "../registry/sync";

const CURRENT_VERSION = 1;

/**
 * Version migration infrastructure.
 * Each migrator transforms data from version N to N+1.
 * Add entries as new versions are introduced:
 *   migrators.set(1, migrateV1toV2);
 */
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

export function deserializeScene(data: SceneData, ctx: DeserializeContext): void {
  if (data.version > CURRENT_VERSION) {
    throw new Error(`Unknown scene version: ${data.version}. Max supported: ${CURRENT_VERSION}`);
  }

  const scene = data.version < CURRENT_VERSION ? migrate(data) : data;

  // Clear existing scene
  for (const id of [...ctx.registry.getAllEdges().keys()]) {
    ctx.engine.removeEdge(id);
  }
  for (const id of [...ctx.registry.getAllElements().keys()]) {
    ctx.engine.removeElement(id);
  }

  // Add groups first (parents before children for hierarchy)
  for (const g of scene.groups) {
    ctx.engine.addGroup(g.id, {
      label: g.label, x: g.x, y: g.y, width: g.width, height: g.height, color: g.color,
    });
    // Restore collapsed state directly (bypass toggleCollapse to avoid Command/redraw)
    if (g.collapsed) {
      const el = ctx.registry.getElement(g.id);
      if (el?.type === "group") {
        el.meta.expandedHeight = g.expandedHeight;
        el.meta.collapsed = true;
        el.height = g.height;
      }
    }
  }

  // Add nodes
  for (const n of scene.nodes) {
    ctx.engine.addNode(n.id, {
      label: n.label, x: n.x, y: n.y, width: n.width, height: n.height, color: n.color,
    });
  }

  // Apply group memberships directly (bypass Command)
  for (const m of scene.groupMemberships) {
    if (ctx.registry.getElement(m.childId) && ctx.registry.getElement(m.groupId)) {
      ctx.registry.setParentGroup(m.childId, m.groupId);
    }
  }

  // Recompute visibility for collapsed groups (setParentGroup doesn't update visibility)
  for (const g of scene.groups) {
    if (g.collapsed) {
      updateVisibility(g.id, ctx.registry, syncElement);
    }
  }

  // Add edges (skip if source/target missing in the data)
  for (const e of scene.edges) {
    if (!ctx.registry.getElement(e.sourceId) || !ctx.registry.getElement(e.targetId)) continue;
    ctx.engine.addEdge(e.id, {
      sourceId: e.sourceId, sourceSide: e.sourceSide,
      targetId: e.targetId, targetSide: e.targetSide,
      label: e.label, labelColor: e.labelColor,
    });
  }

  // Restore viewport position
  if (scene.viewport) {
    ctx.engine.viewport.moveCenter(scene.viewport.x, scene.viewport.y);
    ctx.engine.viewport.setZoom(scene.viewport.zoom, true);
  }

  ctx.history.clear();
}
