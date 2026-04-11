import { test, expect, type Page } from "@playwright/test";

const SCENE_LOAD_WAIT = 5_000;

test.describe("Edge Creation UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 10_000 });
    await page.waitForTimeout(SCENE_LOAD_WAIT);
  });

  test("selecting a node shows connection ports", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const nodePos = await findOnScreenNode(page);
    if (!nodePos) throw new Error("No on-screen node found");

    // Snapshot before click
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.waitForTimeout(300);
    const before = await capturePixels(page);

    // Click to select the node (ports should appear)
    await page.mouse.click(box.x + nodePos.x, box.y + nodePos.y);
    await page.waitForTimeout(400);

    await page.screenshot({
      path: "tests/screenshots/edge-create-select.png",
    });

    const after = await capturePixels(page);

    let blueDelta = 0;
    for (let i = 0; i < before.length; i += 4) {
      const bb = before[i + 2]!;
      const hr = after[i]!, hb = after[i + 2]!;
      if (hb - bb > 40 && hb > 150 && hr < 150) blueDelta++;
    }

    // Selection outline + ports should produce blue pixels
    expect(blueDelta).toBeGreaterThan(10);
  });

  test("drag from port to another node creates an edge", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    // Use the same approach as the working dangling-edge test
    const nodePos = await findOnScreenNode(page);
    if (!nodePos) throw new Error("No on-screen node found");

    // Find a second node to the right (target)
    const targetPos = await page.evaluate(() => {
      const app = (window as any).__PIXI_APP__;
      if (!app?.stage) return null;
      const screenW = app.renderer.width;
      const screenH = app.renderer.height;
      const nodes: { x: number; y: number }[] = [];
      const walk = (c: any, d: number) => {
        if (!c || d > 10) return;
        if (typeof c.label === "string" && c.label.startsWith("node-")) {
          const b = c.getBounds();
          const cx = b.x + b.width / 2;
          const cy = b.y + b.height / 2;
          if (cx > screenW * 0.55 && cx < screenW - 50 && cy > 50 && cy < screenH - 50) {
            nodes.push({ x: cx, y: cy });
          }
          return;
        }
        for (const ch of c.children ?? []) walk(ch, d + 1);
      };
      walk(app.stage, 0);
      return nodes[0] ?? null;
    });
    if (!targetPos) throw new Error("No target node found");

    const edgesBefore = await countEdgeLines(page);

    // Select source node
    await page.mouse.click(box.x + nodePos.x, box.y + nodePos.y);
    await page.waitForTimeout(400);

    // Drag from approximate right port position to target
    const portX = box.x + nodePos.x + 50;
    const portY = box.y + nodePos.y;

    await page.mouse.move(portX, portY, { steps: 5 });
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.mouse.move(box.x + targetPos.x, box.y + targetPos.y, { steps: 20 });
    await page.waitForTimeout(200);

    await page.screenshot({
      path: "tests/screenshots/edge-create-during-drag.png",
    });

    await page.mouse.up();
    await page.waitForTimeout(400);

    await page.screenshot({
      path: "tests/screenshots/edge-create-after-drag.png",
    });

    const edgesAfter = await countEdgeLines(page);
    expect(edgesAfter).toBe(edgesBefore + 1);
  });

  test("drag to empty space creates a dangling edge", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const nodePos = await findOnScreenNode(page);
    if (!nodePos) throw new Error("No on-screen node found");

    const edgesBefore = await countEdgeLines(page);

    // Select node
    await page.mouse.click(box.x + nodePos.x, box.y + nodePos.y);
    await page.waitForTimeout(400);

    // Get the right port position (node center + offset to right edge)
    const portX = box.x + nodePos.x + 50;
    const portY = box.y + nodePos.y;

    // Drag from port to empty space
    await page.mouse.move(portX, portY, { steps: 5 });
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.mouse.move(portX + 200, portY + 100, { steps: 15 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(400);

    await page.screenshot({
      path: "tests/screenshots/edge-create-dangling.png",
    });

    const edgesAfter = await countEdgeLines(page);
    // Dangling edge should still be created
    expect(edgesAfter).toBe(edgesBefore + 1);
  });
});

async function findOnScreenNode(page: Page): Promise<{ x: number; y: number } | null> {
  return await page.evaluate(() => {
    const app = (window as any).__PIXI_APP__;
    if (!app?.stage) return null;
    const screenW = app.renderer.width;
    const screenH = app.renderer.height;

    const onScreen: { x: number; y: number }[] = [];
    const walk = (c: any, depth: number) => {
      if (!c || depth > 10) return;
      if (typeof c.label === "string" && c.label.startsWith("node-")) {
        const b = c.getBounds();
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        if (cx > 0 && cx < screenW && cy > 0 && cy < screenH) {
          onScreen.push({ x: cx, y: cy });
        }
        return;
      }
      for (const child of c.children ?? []) walk(child, depth + 1);
    };
    walk(app.stage, 0);

    return onScreen[Math.floor(onScreen.length / 2)] ?? null;
  });
}

async function capturePixels(page: Page): Promise<Uint8ClampedArray> {
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

async function countEdgeLines(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const app = (window as any).__PIXI_APP__;
    if (!app?.stage) return -1;
    let count = 0;
    const walk = (c: any, depth: number) => {
      if (!c || depth > 12) return;
      if (c.label === "edge-line-layer") {
        count = c.children?.length ?? 0;
        return;
      }
      for (const child of c.children ?? []) walk(child, depth + 1);
    };
    walk(app.stage, 0);
    return count;
  });
}
