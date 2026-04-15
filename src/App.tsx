import { useCallback } from "react";
import { CanvasProvider } from "./react";
import { buildDemoScene } from "../examples/demo-scene";
import type { CanvasEngine } from "./core";

export function App() {
  const handleReady = useCallback(async (engine: CanvasEngine, signal: AbortSignal) => {
    await buildDemoScene(engine, signal);
  }, []);

  return (
    <CanvasProvider options={{ debug: import.meta.env.DEV }} onReady={handleReady} />
  );
}
