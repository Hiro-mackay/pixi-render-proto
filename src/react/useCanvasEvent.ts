import { useEffect, useRef } from "react";
import { useCanvas } from "./useCanvas";
import type { CanvasEventName, CanvasEventMap } from "../core";

export function useCanvasEvent<E extends CanvasEventName>(
  event: E,
  handler: (data: CanvasEventMap[E]) => void,
): void {
  const engine = useCanvas();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!engine) return;
    return engine.on(event, (data) => handlerRef.current(data));
  }, [engine, event]);
}
