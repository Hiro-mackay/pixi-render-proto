import type { Side } from "../types";

export type CanvasEventMap = {
  "element:select": { ids: readonly string[] };
  "element:deselect": { ids: readonly string[] };
  "element:move": { id: string; x: number; y: number };
  "element:resize": { id: string; width: number; height: number };
  "edge:create": { id: string };
  "edge:delete": { id: string };
  "edge:reconnect": { id: string; endpoint: "source" | "target"; newNodeId: string; newSide: Side };
  "group:collapse": { id: string };
  "group:expand": { id: string };
  "group:membership": { childId: string; oldGroupId: string | null; newGroupId: string | null };
  "history:change": { canUndo: boolean; canRedo: boolean };
  "selection:change": { selectedIds: readonly string[] };
};

export type CanvasEventName = keyof CanvasEventMap;

type Handler<E extends CanvasEventName> = (data: CanvasEventMap[E]) => void;

export class CanvasEventEmitter {
  private readonly listeners = new Map<string, Set<Handler<never>>>();
  suppressed = false;

  on<E extends CanvasEventName>(event: E, handler: Handler<E>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => { set.delete(handler as Handler<never>); };
  }

  emit<E extends CanvasEventName>(event: E, data: CanvasEventMap[E]): void {
    if (this.suppressed) return;
    const set = this.listeners.get(event);
    if (!set) return;
    for (const handler of set) {
      (handler as Handler<E>)(data);
    }
  }

  destroy(): void {
    this.listeners.clear();
  }
}
