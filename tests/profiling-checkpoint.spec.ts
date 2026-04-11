import { test, expect } from "@playwright/test";

test.describe("Phase 1: Profiling Checkpoint", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 10_000 });
    await page.waitForTimeout(2_000);
  });

  test("redraw performance during zoom (200 nodes)", async ({ page }) => {
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

        // Measure idle FPS first
        let lastTime = performance.now();
        let idleFrames = 0;
        const measureIdle = () => {
          idleFrames++;
          const now = performance.now();
          if (now - lastTime > 16) {
            idleSamples++;
            idleTotal += 1000 / (now - lastTime);
          }
          lastTime = now;
          if (idleSamples < 60) {
            requestAnimationFrame(measureIdle);
          } else {
            // Now measure zoom redraw cost
            const app = window.__PIXI_APP__;
            if (!app) {
              resolve({
                zoomFrames: 0,
                avgRedrawMs: 0,
                minRedrawMs: 0,
                maxRedrawMs: 0,
                idleFps: idleTotal / idleSamples,
              });
              return;
            }

            const viewport = app.stage.children[0] as {
              scale: { x: number };
              setZoom: (s: number, c: boolean) => void;
              emit: (e: string, d: unknown) => void;
            };

            // Simulate 30 zoom steps and measure each
            let step = 0;
            const zoomStep = () => {
              const start = performance.now();

              const newScale = 1 + step * 0.1;
              viewport.setZoom(newScale, false);
              viewport.emit("zoomed", { viewport, type: "test" });

              const elapsed = performance.now() - start;
              measurements.push(elapsed);
              step++;

              if (step < 30) {
                requestAnimationFrame(zoomStep);
              } else {
                // Reset zoom
                viewport.setZoom(1, false);

                const sorted = [...measurements].sort((a, b) => a - b);
                resolve({
                  zoomFrames: measurements.length,
                  avgRedrawMs:
                    measurements.reduce((a, b) => a + b, 0) /
                    measurements.length,
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

    console.log(`  [200 nodes] Idle FPS: ${results.idleFps.toFixed(1)}`);
    console.log(
      `  [200 nodes] Zoom redraw: avg=${results.avgRedrawMs.toFixed(2)}ms, min=${results.minRedrawMs.toFixed(2)}ms, max=${results.maxRedrawMs.toFixed(2)}ms (${results.zoomFrames} frames)`,
    );

    // Zoom redraw should complete within 16ms (60fps budget)
    expect(results.avgRedrawMs).toBeLessThan(16);
    expect(results.idleFps).toBeGreaterThan(30);
  });
});
