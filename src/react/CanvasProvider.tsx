import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createCanvasEngine, type CanvasEngine, type EngineOptions } from "../core";

export const CanvasContext = createContext<CanvasEngine | null>(null);

interface CanvasProviderProps {
  readonly children?: ReactNode;
  readonly options?: Omit<EngineOptions, "signal">;
  readonly onReady?: (engine: CanvasEngine, signal: AbortSignal) => void;
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

    createCanvasEngine(container, { ...options, signal: ac.signal })
      .then((e) => {
        if (ac.signal.aborted) { e.destroy(); return; }
        eng = e;
        setEngine(e);
        onReady?.(e, ac.signal);
      })
      .catch((err: unknown) => {
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

  // Throw during render so Error Boundaries can catch it
  if (initError) throw initError;

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <CanvasContext value={engine}>
        {children}
      </CanvasContext>
    </div>
  );
}
