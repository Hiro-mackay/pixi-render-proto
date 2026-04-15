import type { EdgeOptions, GroupOptions, NodeOptions } from "./types";
import type { ElementRegistry } from "./registry/element-registry";
import type { CommandHistory } from "./commands/command";
import type { SelectionState } from "./interaction/selection-state";
import type { EdgeCreator } from "./interaction/edge-creator";
import type { RedrawManager } from "./viewport/redraw-manager";
import { syncElement } from "./registry/sync";
import { DeleteCommand, type DeleteCommandOps } from "./commands/delete-command";
import { RemoveEdgeCommand, type AddRemoveOps } from "./commands/add-remove-command";
import { ReconnectEdgeCommand } from "./commands/edge-command";
import { createReconnectHandles, type ReconnectResult } from "./interaction/edge-reconnect";
import type { CanvasEventEmitter } from "./events/event-emitter";
import type { Container } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import type { ViewportPauseController } from "./viewport/pause-controller";

export interface EngineActionDeps {
  readonly registry: ElementRegistry;
  readonly history: CommandHistory;
  readonly selection: SelectionState;
  readonly redraw: RedrawManager;
  readonly events: CanvasEventEmitter;
  readonly selectionLayer: Container;
  readonly ghostLayer: Container;
  readonly viewport: Viewport;
  readonly getScale: () => number;
  readonly addNode: (id: string, opts: NodeOptions) => void;
  readonly addGroup: (id: string, opts: GroupOptions) => void;
  readonly addEdge: (id: string, opts: EdgeOptions) => void;
  readonly removeElement: (id: string) => void;
  readonly removeEdge: (id: string) => void;
  readonly afterCommand: () => void;
  readonly clearSelection: () => void;
  readonly select: (ids: readonly string[]) => void;
  readonly pauseCtrl?: ViewportPauseController;
}

export function createAddRemoveOps(deps: EngineActionDeps): AddRemoveOps {
  return {
    doAddEdge: (id, opts) => deps.addEdge(id, opts),
    doRemoveEdge: (id) => deps.removeEdge(id),
  };
}

export function createElementOps(deps: EngineActionDeps): DeleteCommandOps {
  return {
    doAddNode: (id, opts) => deps.addNode(id, opts),
    doAddGroup: (id, opts) => deps.addGroup(id, opts),
    doAddEdge: (id, opts) => deps.addEdge(id, opts),
    doRemove: (id) => deps.removeElement(id),
  };
}

export function selectEdge(
  edgeId: string,
  deps: EngineActionDeps,
  reconnectCleanup: { current: (() => void) | null },
): void {
  reconnectCleanup.current?.();
  reconnectCleanup.current = null;
  deps.selection.selectEdge(edgeId);
  const edge = deps.registry.getEdge(edgeId);
  if (edge) {
    reconnectCleanup.current = createReconnectHandles({
      edge, layer: deps.selectionLayer, viewport: deps.viewport,
      registry: deps.registry, getScale: deps.getScale, ghostLayer: deps.ghostLayer,
      onReconnect: (r: ReconnectResult) => {
        reconnectCleanup.current?.();
        reconnectCleanup.current = null;
        deps.history.execute(new ReconnectEdgeCommand(r.edgeId, r.endpoint, r.newNodeId, r.newSide, deps.registry));
        deps.events.emit("edge:reconnect", { id: r.edgeId, endpoint: r.endpoint, newNodeId: r.newNodeId, newSide: r.newSide });
        deps.afterCommand();
        selectEdge(r.edgeId, deps, reconnectCleanup);
      },
      pauseCtrl: deps.pauseCtrl,
    });
  }
  deps.redraw.markAllDirty();
  deps.redraw.flush();
}

export function handleEscape(edgeCreator: EdgeCreator, deps: EngineActionDeps): void {
  if (edgeCreator.isActive()) { edgeCreator.cancel(); deps.clearSelection(); return; }
  deps.clearSelection();
}

export function deleteSelected(
  deps: EngineActionDeps,
  addRemoveOps: AddRemoveOps,
  elementOps: DeleteCommandOps,
): void {
  const edgeId = deps.selection.getSelectedEdgeId();
  if (edgeId) {
    deps.clearSelection();
    deps.history.execute(new RemoveEdgeCommand(edgeId, deps.registry, addRemoveOps));
    deps.afterCommand();
    return;
  }

  const ids = [...deps.selection.getSelectedIds()];
  if (ids.length === 0) return;
  deps.clearSelection();

  const restored: string[] = [];
  const restoreOps: DeleteCommandOps = {
    ...elementOps,
    onRestore: (eid: string) => { restored.push(eid); deps.selection.selectMultiple(restored); },
  };
  if (ids.length === 1) {
    deps.history.execute(new DeleteCommand(ids[0]!, deps.registry, syncElement, restoreOps));
  } else {
    deps.history.batch(ids.map((id) => new DeleteCommand(id, deps.registry, syncElement, restoreOps)));
  }
  deps.afterCommand();
}
