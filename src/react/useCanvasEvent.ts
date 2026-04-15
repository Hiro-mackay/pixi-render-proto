import { useEffect } from "react";
import { useCanvas } from "./useCanvas";
import type { CanvasEventName, CanvasEventMap } from "../core";

export function useCanvasEvent<E extends CanvasEventName>(
  event: E,
  handler: (data: CanvasEventMap[E]) => void,
): void {
  const engine = useCanvas();
  useEffect(() => {
    if (!engine) return;
    return engine.on(event, handler);
  }, [engine, event, handler]);
}
