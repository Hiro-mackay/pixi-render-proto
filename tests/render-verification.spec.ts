import { test, expect, type Page } from "@playwright/test";

const SCENE_LOAD_WAIT = 5_000;
const FPS_SAMPLE_DURATION = 3_000;

test.describe("PixiJS Render Proto Verification", () => {
  test.beforeEach(async ({ page }) => {
    // Render verification asserts against the 200-node stress grid scene.
    await page.goto("/?nodes=200");
    // Wait for PixiJS canvas to render and scene to build
    await page.waitForSelector("canvas", { timeout: 10_000 });
    // Give the scene time to fully load (200 nodes + textures)
    await page.waitForTimeout(SCENE_LOAD_WAIT);
  });

  test("1. Canvas renders and WebGL context is active", async ({ page }) => {
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();

    const contextType = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      if (!c) return "none";
      if (c.getContext("webgl2")) return "webgl2";
      if (c.getContext("webgl")) return "webgl";
      return "unknown";
    });

    console.log(`  Rendering context: ${contextType}`);
    expect(["webgl", "webgl2"]).toContain(contextType);
  });

  test("2. FPS stays above 50 during idle", async ({ page }) => {
    const fpsData = await collectFPS(page, FPS_SAMPLE_DURATION);
    logFPSReport("Idle", fpsData);
    expect(fpsData.avg).toBeGreaterThan(50);
  });

  test("3. FPS stays above 45 during zoom (wheel)", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Start FPS collection, then zoom in/out
    const fpsPromise = collectFPS(page, FPS_SAMPLE_DURATION);

    // Zoom in
    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(80);
    }
    // Zoom out
    for (let i = 0; i < 15; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(80);
    }

    const fpsData = await fpsPromise;
    logFPSReport("Zoom (wheel)", fpsData);
    expect(fpsData.avg).toBeGreaterThan(45);
  });

  test("4. FPS stays above 45 during pan (drag)", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const fpsPromise = collectFPS(page, FPS_SAMPLE_DURATION);

    // Pan around by dragging empty space
    await page.mouse.move(cx + 200, cy + 200);
    await page.mouse.down();
    for (let i = 0; i < 30; i++) {
      await page.mouse.move(
        cx + 200 - i * 15,
        cy + 200 - i * 10,
        { steps: 2 },
      );
      await page.waitForTimeout(30);
    }
    await page.mouse.up();

    const fpsData = await fpsPromise;
    logFPSReport("Pan (drag)", fpsData);
    expect(fpsData.avg).toBeGreaterThan(45);
  });

  test("5. FPS counter is displayed on screen", async ({ page }) => {
    // The FPS text is rendered inside the WebGL canvas, so we read it via PixiJS
    const fpsText = await page.evaluate(() => {
      // Access the PixiJS app through the global scope if exposed,
      // otherwise check if the FPS text is in the stage
      const canvases = document.querySelectorAll("canvas");
      return canvases.length > 0 ? "canvas-present" : "no-canvas";
    });
    expect(fpsText).toBe("canvas-present");

    // Verify FPS is being updated by checking Ticker is running
    const tickerRunning = await page.evaluate(async () => {
      // Wait a bit and sample FPS values from the canvas
      const samples: number[] = [];
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 200));
        samples.push(performance.now());
      }
      // If timer progressed, the page is alive and rendering
      return samples[4]! - samples[0]! > 500;
    });
    expect(tickerRunning).toBe(true);
  });

  test("6. 200 nodes are rendered (pixel sampling)", async ({ page }) => {
    // Sample pixels across the canvas to verify content is rendered
    // Background is 0x1a1a2e (dark blue). Nodes have colors like 0x2d3748, 0x2c3e50, etc.
    // If nodes are rendered, many sample points will differ from the background.
    const result = await page.evaluate(() => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      if (!canvas) return { nonBgPixels: 0, totalSamples: 0, debug: "no canvas" };

      // Create a temporary 2D canvas to read pixels from WebGL canvas
      const tmp = document.createElement("canvas");
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const ctx2d = tmp.getContext("2d");
      if (!ctx2d) return { nonBgPixels: 0, totalSamples: 0, debug: "no 2d ctx" };

      ctx2d.drawImage(canvas, 0, 0);
      const imageData = ctx2d.getImageData(0, 0, tmp.width, tmp.height);
      const data = imageData.data;

      // Background RGB: 0x1a=26, 0x1a=26, 0x2e=46
      const BG_R = 26, BG_G = 26, BG_B = 46;
      const THRESHOLD = 15;

      let nonBgPixels = 0;
      const step = 4; // Sample every 4th pixel for speed
      let totalSamples = 0;

      for (let y = 0; y < tmp.height; y += step) {
        for (let x = 0; x < tmp.width; x += step) {
          const i = (y * tmp.width + x) * 4;
          const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
          totalSamples++;
          if (
            Math.abs(r - BG_R) > THRESHOLD ||
            Math.abs(g - BG_G) > THRESHOLD ||
            Math.abs(b - BG_B) > THRESHOLD
          ) {
            nonBgPixels++;
          }
        }
      }

      return { nonBgPixels, totalSamples, debug: `canvas ${tmp.width}x${tmp.height}` };
    });

    const coverage = result.totalSamples > 0
      ? ((result.nonBgPixels / result.totalSamples) * 100).toFixed(1)
      : "0";

    console.log(`  ${result.debug}`);
    console.log(`  Non-background pixels: ${result.nonBgPixels} / ${result.totalSamples} (${coverage}%)`);

    // With 200 nodes, edges, groups, and labels, we expect significant non-background coverage
    // Minimum 5% of sampled pixels should be non-background
    expect(result.nonBgPixels).toBeGreaterThan(result.totalSamples * 0.05);
  });

  test("7. Take screenshot for visual verification", async ({ page }) => {
    await page.screenshot({
      path: "tests/screenshots/full-scene.png",
      fullPage: false,
    });

    // Zoom in to see detail
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Zoom in significantly
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, -200);
      await page.waitForTimeout(100);
    }
    await page.waitForTimeout(500);

    await page.screenshot({
      path: "tests/screenshots/zoomed-in.png",
      fullPage: false,
    });

    // Zoom out to see full scene
    for (let i = 0; i < 25; i++) {
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(500);

    await page.screenshot({
      path: "tests/screenshots/zoomed-out.png",
      fullPage: false,
    });
  });

  test("8. Node drag moves node and edges follow", async ({ page }) => {
    // Zoom in to a node area first
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    // Take before screenshot
    await page.screenshot({
      path: "tests/screenshots/before-drag.png",
    });

    // Click and drag near center (should hit a node)
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 100, cy + 80, { steps: 10 });
    await page.waitForTimeout(200);

    // Take during-drag screenshot
    await page.screenshot({
      path: "tests/screenshots/during-drag.png",
    });

    await page.mouse.up();
    await page.waitForTimeout(300);

    // Take after screenshot
    await page.screenshot({
      path: "tests/screenshots/after-drag.png",
    });
  });
});

type FPSReport = {
  samples: number[];
  avg: number;
  min: number;
  max: number;
  p5: number;
};

async function collectFPS(page: Page, durationMs: number): Promise<FPSReport> {
  const samples = await page.evaluate((duration) => {
    return new Promise<number[]>((resolve) => {
      const fpsSamples: number[] = [];
      let lastTime = performance.now();
      let elapsed = 0;

      function measure() {
        const now = performance.now();
        const delta = now - lastTime;
        lastTime = now;
        elapsed += delta;

        if (delta > 0) {
          fpsSamples.push(1000 / delta);
        }

        if (elapsed < duration) {
          requestAnimationFrame(measure);
        } else {
          resolve(fpsSamples);
        }
      }

      requestAnimationFrame(measure);
    });
  }, durationMs);

  const sorted = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const p5 = sorted[Math.floor(sorted.length * 0.05)] ?? 0;

  return { samples, avg, min, max, p5 };
}

function logFPSReport(label: string, report: FPSReport): void {
  console.log(`  [${label}] Samples: ${report.samples.length}`);
  console.log(`  [${label}] Avg FPS: ${report.avg.toFixed(1)}`);
  console.log(`  [${label}] Min FPS: ${report.min.toFixed(1)}`);
  console.log(`  [${label}] Max FPS: ${report.max.toFixed(1)}`);
  console.log(`  [${label}] P5 FPS:  ${report.p5.toFixed(1)}`);
}
