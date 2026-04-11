import { test, expect, type Page } from "@playwright/test";

const SCENE_LOAD_WAIT = 5_000;

test.describe("Rendering Quality Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 10_000 });
    await page.waitForTimeout(SCENE_LOAD_WAIT);
  });

  test("1. Zoom levels comparison (1x, 2x, 4x, 8x)", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Move mouse to center for wheel zoom
    await page.mouse.move(cx, cy);

    // 1x - default view
    await page.screenshot({ path: "tests/screenshots/quality-1x.png" });

    // 2x zoom
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, -150);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: "tests/screenshots/quality-2x.png" });

    // 4x zoom
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, -150);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: "tests/screenshots/quality-4x.png" });

    // 8x zoom
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, -150);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: "tests/screenshots/quality-8x.png" });
  });

  test("2. Edge sharpness: measure blur on straight lines", async ({
    page,
  }) => {
    // Analyze how many intermediate gray pixels exist around edges
    // Sharp edges have abrupt color transitions; blurry edges have gradients
    const result = await page.evaluate(() => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      if (!canvas) return null;

      const tmp = document.createElement("canvas");
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const ctx = tmp.getContext("2d");
      if (!ctx) return null;

      ctx.drawImage(canvas, 0, 0);
      const data = ctx.getImageData(0, 0, tmp.width, tmp.height).data;

      // Analyze horizontal scan lines for edge transitions
      // Count how many pixels are "in-between" colors (anti-aliased / blurred)
      let sharpTransitions = 0;
      let blurryTransitions = 0;

      for (let y = 0; y < tmp.height; y += 2) {
        let prevLuma = -1;
        for (let x = 0; x < tmp.width; x++) {
          const i = (y * tmp.width + x) * 4;
          const luma =
            0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
          if (prevLuma >= 0) {
            const diff = Math.abs(luma - prevLuma);
            if (diff > 30) sharpTransitions++;
            else if (diff > 5 && diff <= 30) blurryTransitions++;
          }
          prevLuma = luma;
        }
      }

      const ratio =
        sharpTransitions + blurryTransitions > 0
          ? sharpTransitions / (sharpTransitions + blurryTransitions)
          : 0;

      return {
        sharpTransitions,
        blurryTransitions,
        sharpnessRatio: ratio,
        resolution: `${tmp.width}x${tmp.height}`,
        devicePixelRatio: window.devicePixelRatio,
      };
    });

    if (result) {
      console.log(`  Canvas resolution: ${result.resolution}`);
      console.log(`  Device pixel ratio: ${result.devicePixelRatio}`);
      console.log(`  Sharp transitions: ${result.sharpTransitions}`);
      console.log(`  Blurry transitions: ${result.blurryTransitions}`);
      console.log(
        `  Sharpness ratio: ${(result.sharpnessRatio * 100).toFixed(1)}%`,
      );
    }

    expect(result).not.toBeNull();
  });

  test("3. Text quality at zoom levels", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    // Take full-width screenshots at each zoom level to ensure nodes stay in frame
    const zoomLevels = [
      { name: "1x", scrolls: 0 },
      { name: "2x", scrolls: 6 },
      { name: "4x", scrolls: 14 },
    ];

    // Position mouse at a node cluster area (upper-left quadrant where nodes are)
    const targetX = box.x + box.width * 0.35;
    const targetY = box.y + box.height * 0.35;
    await page.mouse.move(targetX, targetY);

    let totalScrolls = 0;
    for (const level of zoomLevels) {
      const scrollsNeeded = level.scrolls - totalScrolls;
      for (let i = 0; i < scrollsNeeded; i++) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(80);
      }
      totalScrolls = level.scrolls;
      await page.waitForTimeout(600);

      await page.screenshot({
        path: `tests/screenshots/text-quality-${level.name}.png`,
      });
    }
  });

  test("4. Icon quality at zoom levels", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const targetX = box.x + box.width * 0.35;
    const targetY = box.y + box.height * 0.35;
    await page.mouse.move(targetX, targetY);

    const zoomLevels = [
      { name: "1x", scrolls: 0 },
      { name: "4x", scrolls: 14 },
    ];

    let totalScrolls = 0;
    for (const level of zoomLevels) {
      const scrollsNeeded = level.scrolls - totalScrolls;
      for (let i = 0; i < scrollsNeeded; i++) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(80);
      }
      totalScrolls = level.scrolls;
      await page.waitForTimeout(600);

      await page.screenshot({
        path: `tests/screenshots/icon-quality-${level.name}.png`,
      });
    }
  });

  test("5. Canvas DPI and resolution info", async ({ page }) => {
    const info = await page.evaluate(() => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      if (!canvas) return null;

      return {
        cssWidth: canvas.clientWidth,
        cssHeight: canvas.clientHeight,
        bufferWidth: canvas.width,
        bufferHeight: canvas.height,
        devicePixelRatio: window.devicePixelRatio,
        effectiveScale: canvas.width / canvas.clientWidth,
        style: canvas.style.cssText,
      };
    });

    if (info) {
      console.log(`  CSS size: ${info.cssWidth}x${info.cssHeight}`);
      console.log(`  Buffer size: ${info.bufferWidth}x${info.bufferHeight}`);
      console.log(`  Device pixel ratio: ${info.devicePixelRatio}`);
      console.log(`  Effective scale: ${info.effectiveScale.toFixed(2)}x`);
      console.log(`  Canvas style: ${info.style}`);

      // Buffer should be at least 1x CSS size
      expect(info.bufferWidth).toBeGreaterThanOrEqual(info.cssWidth);
    }
    expect(info).not.toBeNull();
  });
});
