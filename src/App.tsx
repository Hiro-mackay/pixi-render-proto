import { useEffect, useRef } from "react";
import { initCanvas, destroyCanvas, type CanvasContext } from "./canvas/setup";
import { buildDemoScene } from "./canvas/demo-scene";

export function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ac = new AbortController();
    let ctx: CanvasContext | undefined;

    initCanvas(container).then(async (c) => {
      ctx = c;
      if (ac.signal.aborted) {
        destroyCanvas(ctx);
        return;
      }
      await buildDemoScene(ctx, ac.signal);
    });

    return () => {
      ac.abort();
      if (ctx) destroyCanvas(ctx);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
    />
  );
}
