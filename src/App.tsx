import { useEffect, useRef } from "react";
import { createCanvasEngine, type CanvasEngine } from "./core";
import { buildDemoScene } from "../examples/demo-scene";

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ac = new AbortController();
    let engine: CanvasEngine | undefined;

    createCanvasEngine(container, {
      debug: import.meta.env.DEV,
      signal: ac.signal,
    })
      .then(async (e) => {
        if (ac.signal.aborted) {
          e.destroy();
          return;
        }
        engine = e;
        await buildDemoScene(e, ac.signal);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        throw err;
      });

    return () => {
      ac.abort();
      engine?.destroy();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
    />
  );
}
