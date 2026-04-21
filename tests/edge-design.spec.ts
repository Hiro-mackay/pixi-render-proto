import { test, expect } from "@playwright/test";

test.describe("Edge Design Showcase", () => {
  test.beforeEach(async ({ page }) => {
    // Force the stress grid scene so existing node-N ID assertions keep working.
    await page.goto("/?nodes=60");
    await page.waitForSelector("canvas", { timeout: 10_000 });
    await waitForSceneReady(page);
  });

  test("capture edges at multiple zoom levels", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);

    // Initial overview
    await page.screenshot({ path: "tests/screenshots/edge-initial.png" });

    // Zoom with very gentle deltas
    await page.keyboard.down("Control");

    // ~0.8x (just slightly zoomed in from 0.6x)
    await page.mouse.wheel(0, -25);
    await page.waitForTimeout(400);
    await page.screenshot({ path: "tests/screenshots/edge-close1.png" });

    // ~1x
    await page.mouse.wheel(0, -25);
    await page.waitForTimeout(400);
    await page.screenshot({ path: "tests/screenshots/edge-close2.png" });

    // ~1.3x
    await page.mouse.wheel(0, -25);
    await page.waitForTimeout(400);
    await page.screenshot({ path: "tests/screenshots/edge-close3.png" });

    await page.keyboard.up("Control");
  });

  test("clicking on an edge selects it (visual change)", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    // Find a visible hitLine with reasonable bounds
    const edgeCenter = await findEdgeHitCenter(page);
    if (!edgeCenter) throw new Error("No edge found");

    const before = await capturePixels(page);

    // Click on edge
    await page.mouse.click(box.x + edgeCenter.x, box.y + edgeCenter.y);
    await page.waitForTimeout(400);

    await page.screenshot({ path: "tests/screenshots/edge-selected.png" });

    const after = await capturePixels(page);

    // Selected edge should produce more blue pixels
    let blueDelta = 0;
    for (let i = 0; i < before.length; i += 4) {
      const bb = before[i + 2]!;
      const hb = after[i + 2]!, hr = after[i]!;
      if (hb - bb > 40 && hb > 150 && hr < 150) blueDelta++;
    }
    expect(blueDelta).toBeGreaterThan(5);
  });

  test("delete key removes selected edge, undo restores it", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const edgeCenter = await findEdgeHitCenter(page);
    if (!edgeCenter) throw new Error("No edge found");

    const edgesBefore = await countEdgeLines(page);

    // Click to select edge
    await page.mouse.click(box.x + edgeCenter.x, box.y + edgeCenter.y);
    await page.waitForTimeout(400);

    // Press Delete to remove
    await page.keyboard.press("Delete");
    await page.waitForTimeout(400);

    const edgesAfterDelete = await countEdgeLines(page);
    expect(edgesAfterDelete).toBe(edgesBefore - 1);

    // Undo
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+z`);
    await page.waitForTimeout(400);

    const edgesAfterUndo = await countEdgeLines(page);
    expect(edgesAfterUndo).toBe(edgesBefore);
  });
});

async function findEdgeHitCenter(page: import("@playwright/test").Page): Promise<{ x: number; y: number } | null> {
  return await page.evaluate(() => {
    const app = (window as any).__PIXI_APP__;
    if (!app?.stage) return null;
    const screenW = app.renderer.width;
    const screenH = app.renderer.height;

    let lineLayer: any = null;
    const walk = (c: any, d: number) => {
      if (!c || d > 8) return;
      if (c.label === "edge-line-layer") { lineLayer = c; return; }
      for (const ch of c.children ?? []) walk(ch, d + 1);
    };
    walk(app.stage, 0);
    if (!lineLayer) return null;

    // Find hitLines by cursor style (avoids index-position assumptions)
    for (const child of lineLayer.children) {
      if (!child || !child.visible || child.cursor !== "pointer") continue;
      const b = child.getBounds();
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      if (cx > 50 && cx < screenW - 50 && cy > 50 && cy < screenH - 50 && b.width > 10 && b.height > 10) {
        return { x: cx, y: cy };
      }
    }
    return null;
  });
}

async function capturePixels(page: import("@playwright/test").Page): Promise<Uint8ClampedArray> {
  const base64 = await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    if (!canvas) return "";
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const ctx = tmp.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(canvas, 0, 0);
    const data = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    let str = "";
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]!);
    return btoa(str);
  });
  const decoded = atob(base64);
  const result = new Uint8ClampedArray(decoded.length);
  for (let i = 0; i < decoded.length; i++) result[i] = decoded.charCodeAt(i);
  return result;
}

async function countEdgeLines(page: import("@playwright/test").Page): Promise<number> {
  return await page.evaluate(() => {
    const app = (window as any).__PIXI_APP__;
    if (!app?.stage) return -1;
    let count = 0;
    const walk = (c: any, d: number) => {
      if (!c || d > 12) return;
      if (c.label === "edge-line-layer") {
        for (const child of c.children ?? []) {
          if (child.cursor === "pointer") count++;
        }
        return;
      }
      for (const child of c.children ?? []) walk(child, d + 1);
    };
    walk(app.stage, 0);
    return count;
  });
}

async function waitForSceneReady(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const app = (window as any).__PIXI_APP__;
      if (!app?.stage) return false;
      let hasNodes = false;
      const walk = (c: any, d: number) => {
        if (!c || d > 6) return;
        if (typeof c.label === "string" && c.label.startsWith("node-")) { hasNodes = true; return; }
        for (const ch of c.children ?? []) { if (hasNodes) return; walk(ch, d + 1); }
      };
      walk(app.stage, 0);
      return hasNodes;
    },
    { timeout: 15_000 },
  );
  await page.waitForTimeout(200);
}
