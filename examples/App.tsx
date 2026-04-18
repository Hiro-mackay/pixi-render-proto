import { useCallback } from "react";
import { CanvasProvider } from "../src/react";
import { buildDemoScene } from "./demo-scene";
import type { CanvasEngine } from "../src/core";

export function App() {
  const handleReady = useCallback(async (engine: CanvasEngine, signal: AbortSignal) => {
    const params = new URLSearchParams(window.location.search);
    const nodeCount = Number(params.get("nodes")) || undefined;
    await buildDemoScene(engine, signal, nodeCount);
  }, []);

  return (
    <CanvasProvider options={{ debug: import.meta.env.DEV }} onReady={handleReady} />
  );
}
