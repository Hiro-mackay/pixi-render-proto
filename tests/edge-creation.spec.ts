import { test, expect, type Page } from "@playwright/test";

test.describe("Edge Creation UI", () => {
  test.beforeEach(async ({ page }) => {
    // Force the stress grid scene so existing node-N ID assertions keep working.
    await page.goto("/?nodes=30");
    await page.waitForSelector("canvas", { timeout: 10_000 });
    await waitForSceneReady(page);
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

    const portInfo = await findSourcePortInfo(page);
    if (!portInfo) throw new Error("No source node with port found");

    const targetPos = await findTargetNode(page);
    if (!targetPos) throw new Error("No target node found");

    const edgesBefore = await countEdgeLines(page);

    // Select source node to make ports visible
    await page.mouse.click(
      box.x + portInfo.nodeCenter.x, box.y + portInfo.nodeCenter.y,
    );
    await page.waitForTimeout(400);

    // Drag from the exact right port position to target
    const portX = box.x + portInfo.portScreen.x;
    const portY = box.y + portInfo.portScreen.y;

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

  test("drag to empty space does not create an edge", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const nodePos = await findOnScreenNode(page);
    if (!nodePos) throw new Error("No on-screen node found");

    const edgesBefore = await countEdgeLines(page);

    // Select node
    await page.mouse.click(box.x + nodePos.x, box.y + nodePos.y);
    await page.waitForTimeout(400);

    // Drag from approximate right port to empty space
    const portX = box.x + nodePos.x + 50;
    const portY = box.y + nodePos.y;

    await page.mouse.move(portX, portY, { steps: 5 });
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.mouse.move(portX + 200, portY + 100, { steps: 15 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(400);

    const edgesAfter = await countEdgeLines(page);
    // No edge should be created when dropping on empty space
    expect(edgesAfter).toBe(edgesBefore);
  });

  test("undo removes created edge, redo restores it", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const portInfo = await findSourcePortInfo(page);
    if (!portInfo) throw new Error("No source node with port found");

    const targetPos = await findTargetNode(page);
    if (!targetPos) throw new Error("No target node found");

    const edgesBefore = await countEdgeLines(page);

    // Select source node
    await page.mouse.click(
      box.x + portInfo.nodeCenter.x, box.y + portInfo.nodeCenter.y,
    );
    await page.waitForTimeout(400);

    // Drag from exact port position to target
    const portX = box.x + portInfo.portScreen.x;
    const portY = box.y + portInfo.portScreen.y;
    await page.mouse.move(portX, portY, { steps: 5 });
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.mouse.move(box.x + targetPos.x, box.y + targetPos.y, { steps: 20 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await page.waitForTimeout(400);

    const edgesAfterCreate = await countEdgeLines(page);
    expect(edgesAfterCreate).toBe(edgesBefore + 1);

    // Undo
    const modifier = process.platform === "darwin" ? "Meta" : "Control";
    await page.keyboard.press(`${modifier}+z`);
    await page.waitForTimeout(400);

    const edgesAfterUndo = await countEdgeLines(page);
    expect(edgesAfterUndo).toBe(edgesBefore);

    // Redo
    await page.keyboard.press(`${modifier}+Shift+z`);
    await page.waitForTimeout(400);

    const edgesAfterRedo = await countEdgeLines(page);
    expect(edgesAfterRedo).toBe(edgesBefore + 1);
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
        // Count hitLines by cursor style (avoids child-count assumptions)
        for (const child of c.children ?? []) {
          if (child.cursor === "pointer") count++;
        }
        return;
      }
      for (const child of c.children ?? []) walk(child, depth + 1);
    };
    walk(app.stage, 0);
    return count;
  });
}

async function findSourcePortInfo(page: Page): Promise<{ nodeCenter: { x: number; y: number }; portScreen: { x: number; y: number } } | null> {
  return await page.evaluate(() => {
    const app = (window as any).__PIXI_APP__;
    if (!app?.stage) return null;
    const screenW = app.renderer.width;
    const screenH = app.renderer.height;
    const results: { nodeCenter: { x: number; y: number }; portScreen: { x: number; y: number } }[] = [];
    const walk = (c: any, d: number) => {
      if (!c || d > 10) return;
      if (typeof c.label === "string" && c.label.startsWith("node-")) {
        const b = c.getBounds();
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        if (cx > 50 && cx < screenW * 0.45 && cy > 50 && cy < screenH - 50) {
          const ports = c.children?.find((ch: any) => ch.label === "ports");
          const rightPort = ports?.children?.find((ch: any) => ch.label === "right");
          if (rightPort) {
            const pb = rightPort.getBounds();
            results.push({
              nodeCenter: { x: cx, y: cy },
              portScreen: { x: pb.x + pb.width / 2, y: pb.y + pb.height / 2 },
            });
          } else {
            // Ports are lazily created; estimate right port position from node bounds
            results.push({
              nodeCenter: { x: cx, y: cy },
              portScreen: { x: b.x + b.width + 14, y: cy },
            });
          }
        }
        return;
      }
      for (const ch of c.children ?? []) walk(ch, d + 1);
    };
    walk(app.stage, 0);
    return results[0] ?? null;
  });
}

async function findTargetNode(page: Page): Promise<{ x: number; y: number } | null> {
  return await page.evaluate(() => {
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
}

async function waitForSceneReady(page: Page): Promise<void> {
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
  // One extra frame for rendering to settle
  await page.waitForTimeout(200);
}
