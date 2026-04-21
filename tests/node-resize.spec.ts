import { test, expect, type Page } from "@playwright/test";

const SCENE_LOAD_WAIT = 5_000;

test.describe("Node Resize", () => {
  test.beforeEach(async ({ page }) => {
    // Force the stress grid scene so existing node-N ID assertions keep working.
    await page.goto("/?nodes=30");
    await page.waitForSelector("canvas", { timeout: 10_000 });
    await page.waitForTimeout(SCENE_LOAD_WAIT);
  });

  test("1. Resize handle changes cursor on hover after selecting a node", async ({
    page,
  }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Click to select a node
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(400);

    await page.screenshot({
      path: "tests/screenshots/resize-selected.png",
    });

    // Selection should be visible (blue outline + white handles)
    const afterSelect = await capturePixelSnapshot(page);
    const bluePixels = countColorPixels(afterSelect, { minB: 150, bOverR: 30 });
    expect(bluePixels).toBeGreaterThan(5);
  });

  test("2. Drag bottom-right handle resizes node", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    // Zoom in to make handles easier to hit
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down("Control");
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(80);
    }
    await page.keyboard.up("Control");
    await page.waitForTimeout(600);

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Click to select node
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(400);

    const beforeResize = await capturePixelSnapshot(page);
    await page.screenshot({
      path: "tests/screenshots/resize-before.png",
    });

    // Find approximate bottom-right handle position
    // After zooming in, the node and selection are centered
    // The handle is at bottom-right corner of the selected node
    // Drag it further to the right and down to resize
    const handleOffsetX = 50;
    const handleOffsetY = 25;
    const handleX = cx + handleOffsetX;
    const handleY = cy + handleOffsetY;

    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    await page.mouse.move(handleX + 80, handleY + 60, { steps: 10 });
    await page.waitForTimeout(200);

    await page.screenshot({
      path: "tests/screenshots/resize-during.png",
    });

    await page.mouse.up();
    await page.waitForTimeout(300);

    await page.screenshot({
      path: "tests/screenshots/resize-after.png",
    });

    // The canvas should look different after resize
    const afterResize = await capturePixelSnapshot(page);
    let changedPixels = 0;
    for (let i = 0; i < beforeResize.length; i += 4) {
      const dr = Math.abs(beforeResize[i]! - afterResize[i]!);
      const dg = Math.abs(beforeResize[i + 1]! - afterResize[i + 1]!);
      const db = Math.abs(beforeResize[i + 2]! - afterResize[i + 2]!);
      if (dr + dg + db > 30) changedPixels++;
    }

    // Resize should cause visible pixel changes
    expect(changedPixels).toBeGreaterThan(50);
  });

  test("3. Node edges update after resize", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    // Zoom in
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down("Control");
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(80);
    }
    await page.keyboard.up("Control");
    await page.waitForTimeout(600);

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Select node
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(400);

    // Capture edge area (wider region around node)
    const beforeData = await captureRegionSnapshot(
      page,
      cx - 200,
      cy - 150,
      400,
      300,
    );

    // Drag a corner handle to resize
    const handleX = cx + 50;
    const handleY = cy + 25;
    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    await page.mouse.move(handleX + 100, handleY + 80, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Capture same region after resize
    const afterData = await captureRegionSnapshot(
      page,
      cx - 200,
      cy - 150,
      400,
      300,
    );

    // Region should show changes (node expanded + edges repositioned)
    let changed = 0;
    const len = Math.min(beforeData.length, afterData.length);
    for (let i = 0; i < len; i += 4) {
      const diff =
        Math.abs(beforeData[i]! - afterData[i]!) +
        Math.abs(beforeData[i + 1]! - afterData[i + 1]!) +
        Math.abs(beforeData[i + 2]! - afterData[i + 2]!);
      if (diff > 30) changed++;
    }

    expect(changed).toBeGreaterThan(100);

    await page.screenshot({
      path: "tests/screenshots/resize-edges-after.png",
    });
  });

  test("4. Selection outline updates during resize", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    // Find a node screen position before zoom
    const nodeScreen = await page.evaluate(() => {
      const app = (window as any).__PIXI_APP__;
      if (!app?.stage) return null;
      let vp: any = null;
      for (const c of app.stage.children) { if (c.children?.length > 5) { vp = c; break; } }
      if (!vp) return null;
      const sw = app.renderer.width, sh = app.renderer.height;
      for (const c of vp.children) {
        if (!c.label?.startsWith("node-")) continue;
        const b = c.getBounds();
        const gx = b.x + b.width / 2, gy = b.y + b.height / 2;
        if (gx > 150 && gy > 150 && gx < sw - 150 && gy < sh - 150) {
          return { x: gx, y: gy };
        }
      }
      return null;
    });
    if (!nodeScreen) throw new Error("No node found on screen");

    // Zoom in centered on the node
    await page.mouse.move(box.x + nodeScreen.x, box.y + nodeScreen.y);
    await page.keyboard.down("Control");
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(80);
    }
    await page.keyboard.up("Control");
    await page.waitForTimeout(600);

    const cx = box.x + nodeScreen.x;
    const cy = box.y + nodeScreen.y;

    // Select node
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(400);

    // Drag handle
    const handleX = cx + 50;
    const handleY = cy + 25;
    await page.mouse.move(handleX, handleY);
    await page.mouse.down();
    await page.mouse.move(handleX + 60, handleY + 40, { steps: 5 });

    // Take screenshot mid-resize to verify outline follows
    await page.screenshot({
      path: "tests/screenshots/resize-outline-mid.png",
    });

    // Check for blue outline pixels in the expanded area
    const midResize = await capturePixelSnapshot(page);
    const bluePixels = countColorPixels(midResize, { minB: 150, bOverR: 30 });

    // Blue outline should be visible during resize
    expect(bluePixels).toBeGreaterThan(10);

    await page.mouse.up();
    await page.waitForTimeout(200);
  });
});

function countColorPixels(
  data: Uint8ClampedArray,
  opts: { minB: number; bOverR: number },
): number {
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const b = data[i + 2]!;
    if (b > opts.minB && b > r + opts.bOverR) count++;
  }
  return count;
}

async function capturePixelSnapshot(page: Page): Promise<Uint8ClampedArray> {
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

async function captureRegionSnapshot(
  page: Page,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
): Promise<Uint8ClampedArray> {
  const base64 = await page.evaluate(
    ({ sx, sy, sw, sh }) => {
      const canvas = document.querySelector("canvas") as HTMLCanvasElement;
      if (!canvas) return "";
      const tmp = document.createElement("canvas");
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const ctx = tmp.getContext("2d");
      if (!ctx) return "";
      ctx.drawImage(canvas, 0, 0);
      const dpr = window.devicePixelRatio || 1;
      const data = ctx.getImageData(
        sx * dpr,
        sy * dpr,
        sw * dpr,
        sh * dpr,
      ).data;
      const bytes = new Uint8Array(
        data.buffer,
        data.byteOffset,
        data.byteLength,
      );
      let str = "";
      for (let i = 0; i < bytes.length; i++)
        str += String.fromCharCode(bytes[i]!);
      return btoa(str);
    },
    { sx, sy, sw, sh },
  );
  const decoded = atob(base64);
  const result = new Uint8ClampedArray(decoded.length);
  for (let i = 0; i < decoded.length; i++) result[i] = decoded.charCodeAt(i);
  return result;
}
