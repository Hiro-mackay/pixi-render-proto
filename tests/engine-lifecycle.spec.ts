import { test, expect } from "@playwright/test";

test.describe("Phase 0: Engine Lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 10_000 });
    await page.waitForTimeout(1_000);
  });

  test("should render canvas with WebGL context", async ({ page }) => {
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();

    const contextType = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      if (!c) return "none";
      if (c.getContext("webgl2")) return "webgl2";
      if (c.getContext("webgl")) return "webgl";
      return "unknown";
    });
    expect(["webgl", "webgl2"]).toContain(contextType);
  });

  test("should display dark background (0x1a1a2e)", async ({ page }) => {
    const bgColor = await page.evaluate(() => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      if (!canvas) return null;
      const tmp = document.createElement("canvas");
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const ctx = tmp.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(canvas, 0, 0);
      const pixel = ctx.getImageData(
        Math.floor(tmp.width / 2),
        Math.floor(tmp.height / 2),
        1,
        1,
      ).data;
      return { r: pixel[0], g: pixel[1], b: pixel[2] };
    });

    expect(bgColor).not.toBeNull();
    // Background 0x1a1a2e = rgb(26, 26, 46)
    expect(bgColor!.r).toBeCloseTo(26, -1);
    expect(bgColor!.g).toBeCloseTo(26, -1);
    expect(bgColor!.b).toBeCloseTo(46, -1);
  });

  test("should pan via mouse wheel", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);

    // Get viewport position before pan
    const before = await page.evaluate(() => {
      const app = window.__PIXI_APP__;
      if (!app) return null;
      const viewport = app.stage.children[0] as { x: number; y: number };
      return { x: viewport.x, y: viewport.y };
    });
    expect(before).not.toBeNull();

    // Pan via wheel
    await page.mouse.wheel(100, 100);
    await page.waitForTimeout(200);

    const after = await page.evaluate(() => {
      const app = window.__PIXI_APP__;
      if (!app) return null;
      const viewport = app.stage.children[0] as { x: number; y: number };
      return { x: viewport.x, y: viewport.y };
    });
    expect(after).not.toBeNull();

    // Viewport should have moved
    expect(after!.x).not.toBe(before!.x);
    expect(after!.y).not.toBe(before!.y);
  });

  test("should zoom via ctrl+wheel", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);

    const scaleBefore = await page.evaluate(() => {
      const app = window.__PIXI_APP__;
      if (!app) return null;
      const viewport = app.stage.children[0] as { scale: { x: number } };
      return viewport.scale.x;
    });
    expect(scaleBefore).not.toBeNull();

    // Zoom in via ctrl+wheel
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(200);
    await page.keyboard.up("Control");

    const scaleAfter = await page.evaluate(() => {
      const app = window.__PIXI_APP__;
      if (!app) return null;
      const viewport = app.stage.children[0] as { scale: { x: number } };
      return viewport.scale.x;
    });
    expect(scaleAfter).not.toBeNull();

    // Scale should have increased (zoomed in)
    expect(scaleAfter!).toBeGreaterThan(scaleBefore!);
  });

  test("should expose __PIXI_APP__ in debug mode", async ({ page }) => {
    const hasApp = await page.evaluate(() => window.__PIXI_APP__ !== null);
    expect(hasApp).toBe(true);
  });

  test("should have FPS ticker running", async ({ page }) => {
    const isRunning = await page.evaluate(() => {
      const app = window.__PIXI_APP__;
      return app !== null && app.ticker.started;
    });
    expect(isRunning).toBe(true);
  });

  test("should not leak canvas elements on navigation", async ({ page }) => {
    // Navigate away and back
    await page.goto("about:blank");
    await page.waitForTimeout(200);
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 10_000 });
    await page.waitForTimeout(1_000);

    const canvasCount = await page.evaluate(
      () => document.querySelectorAll("canvas").length,
    );
    expect(canvasCount).toBe(1);
  });
});
