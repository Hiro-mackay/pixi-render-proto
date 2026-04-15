import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createCanvasEngine, type CanvasEngine, type EngineOptions } from "../core";

export const CanvasContext = createContext<CanvasEngine | null>(null);

interface CanvasProviderProps {
  readonly children?: ReactNode;
  readonly options?: Omit<EngineOptions, "signal">;
  readonly onReady?: (engine: CanvasEngine, signal: AbortSignal) => void | Promise<void>;
}

export function CanvasProvider({ children, options, onReady }: CanvasProviderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<CanvasEngine | null>(null);
  const [initError, setInitError] = useState<Error | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ac = new AbortController();
    let eng: CanvasEngine | undefined;

    (async () => {
      const e = await createCanvasEngine(container, { ...options, signal: ac.signal });
      if (ac.signal.aborted) { e.destroy(); return; }
      eng = e;
      setEngine(e);
      if (onReady) {
        await onReady(e, ac.signal);
      }
    })().catch((err: unknown) => {
      if (ac.signal.aborted) return;
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof Error) setInitError(err);
      else setInitError(new Error(String(err)));
    });

    return () => {
      ac.abort();
      eng?.destroy();
      setEngine(null);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- engine created once

  if (initError) throw initError;

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <CanvasContext value={engine}>
        {children}
      </CanvasContext>
    </div>
  );
}
