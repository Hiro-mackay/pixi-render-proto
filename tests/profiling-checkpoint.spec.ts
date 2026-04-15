import { test, expect } from "@playwright/test";

const PROFILES = [
  { nodes: 200, maxZoomMs: 16, minFps: 30 },
  { nodes: 500, maxZoomMs: 25, minFps: 24 },
  { nodes: 1000, maxZoomMs: 40, minFps: 15 },
] as const;

for (const { nodes, maxZoomMs, minFps } of PROFILES) {
  test.describe(`Profiling: ${nodes} nodes`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/?nodes=${nodes}`);
      await page.waitForSelector("canvas", { timeout: 30_000 });
      const waitMs = nodes <= 200 ? 2_000 : nodes <= 500 ? 4_000 : 8_000;
      await page.waitForTimeout(waitMs);
    });

    if (nodes >= 1000) test.slow();

    test(`idle FPS and zoom redraw (${nodes} nodes)`, async ({ page }) => {
      const canvas = page.locator("canvas");
      const box = await canvas.boundingBox();
      if (!box) throw new Error("Canvas not found");

      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);

      const results = await page.evaluate(() => {
        return new Promise<{
          zoomFrames: number;
          avgRedrawMs: number;
          minRedrawMs: number;
          maxRedrawMs: number;
          idleFps: number;
        }>((resolve) => {
          const measurements: number[] = [];
          let idleSamples = 0;
          let idleTotal = 0;

          let lastTime = performance.now();
          const measureIdle = () => {
            const now = performance.now();
            if (now - lastTime > 16) {
              idleSamples++;
              idleTotal += 1000 / (now - lastTime);
            }
            lastTime = now;
            if (idleSamples < 60) {
              requestAnimationFrame(measureIdle);
            } else {
              const app = window.__PIXI_APP__;
              if (!app) {
                resolve({ zoomFrames: 0, avgRedrawMs: 0, minRedrawMs: 0, maxRedrawMs: 0, idleFps: idleTotal / idleSamples });
                return;
              }

              const viewport = app.stage.children[0] as {
                scale: { x: number };
                setZoom: (s: number, c: boolean) => void;
                emit: (e: string, d: unknown) => void;
              };

              let step = 0;
              const zoomStep = () => {
                const start = performance.now();
                viewport.setZoom(1 + step * 0.1, false);
                viewport.emit("zoomed", { viewport, type: "test" });
                measurements.push(performance.now() - start);
                step++;
                if (step < 30) {
                  requestAnimationFrame(zoomStep);
                } else {
                  viewport.setZoom(1, false);
                  const sorted = [...measurements].sort((a, b) => a - b);
                  resolve({
                    zoomFrames: measurements.length,
                    avgRedrawMs: measurements.reduce((a, b) => a + b, 0) / measurements.length,
                    minRedrawMs: sorted[0]!,
                    maxRedrawMs: sorted[sorted.length - 1]!,
                    idleFps: idleTotal / idleSamples,
                  });
                }
              };
              requestAnimationFrame(zoomStep);
            }
          };
          requestAnimationFrame(measureIdle);
        });
      });

      console.log(`  [${nodes} nodes] Idle FPS: ${results.idleFps.toFixed(1)}`);
      console.log(
        `  [${nodes} nodes] Zoom: avg=${results.avgRedrawMs.toFixed(2)}ms, min=${results.minRedrawMs.toFixed(2)}ms, max=${results.maxRedrawMs.toFixed(2)}ms`,
      );

      expect(results.avgRedrawMs).toBeLessThan(maxZoomMs);
      expect(results.idleFps).toBeGreaterThan(minFps);
    });
  });
}
