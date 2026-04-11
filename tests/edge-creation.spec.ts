import { test, expect, type Page } from "@playwright/test";

const SCENE_LOAD_WAIT = 5_000;

test.describe("Edge Creation UI", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 10_000 });
    await page.waitForTimeout(SCENE_LOAD_WAIT);
  });

  test("hover shows connection ports", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    // Screenshot first for debug
    await page.screenshot({
      path: "tests/screenshots/edge-create-initial.png",
    });

    // Check node structure + port setup
    const structure = await page.evaluate(() => {
      const app = (window as any).__PIXI_APP__;
      if (!app?.stage) return null;

      let firstNode: any = null;
      const walk = (c: any, depth: number) => {
        if (firstNode || !c || depth > 10) return;
        if (typeof c.label === "string" && c.label.startsWith("node-")) {
          firstNode = c;
          return;
        }
        for (const child of c.children ?? []) walk(child, depth + 1);
      };
      walk(app.stage, 0);

      if (!firstNode) return { error: "no node" };
      return {
        label: firstNode.label,
        eventMode: firstNode.eventMode,
        childCount: firstNode.children?.length ?? 0,
        childTypes: (firstNode.children ?? []).map((c: any) => ({
          type: c.constructor.name,
          visible: c.visible,
          eventMode: c.eventMode,
          pos: c.x !== undefined ? { x: c.x, y: c.y } : null,
        })),
      };
    });
    console.log("  Node structure:", JSON.stringify(structure, null, 2));

    // Find an on-screen node's screen position
    const debug = await page.evaluate(() => {
      const app = (window as any).__PIXI_APP__;
      if (!app?.stage) return { error: "no app" };

      const screenW = app.renderer.width;
      const screenH = app.renderer.height;

      const samples: any[] = [];
      const walk = (c: any, depth: number) => {
        if (!c || depth > 10) return;
        if (typeof c.label === "string" && c.label.startsWith("node-")) {
          const b = c.getBounds();
          if (samples.length < 3) {
            samples.push({
              id: c.label,
              worldPos: { x: c.x, y: c.y },
              bounds: {
                x: b.x, y: b.y, w: b.width, h: b.height,
              },
            });
          }
          return;
        }
        for (const child of c.children ?? []) walk(child, depth + 1);
      };
      walk(app.stage, 0);

      return {
        screenW,
        screenH,
        samples,
        viewportPos: app.stage.children.find((c: any) => c.constructor.name === "Viewport")?.position,
      };
    });

    console.log("  Debug:", JSON.stringify(debug, null, 2));

    const nodePos = await page.evaluate(() => {
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

    if (!nodePos) throw new Error("Could not find a node to hover");
    console.log(`  Hovering node at screen (${nodePos.x}, ${nodePos.y})`);

    // Snapshot before hover (mouse far from any node)
    await page.mouse.move(box.x + 5, box.y + 5);
    await page.waitForTimeout(300);
    const before = await capturePixels(page);

    // Hover the node with smooth motion (steps) so Pixi receives multiple
    // pointermove events and re-runs hit testing
    await page.mouse.move(box.x + nodePos.x, box.y + nodePos.y, { steps: 10 });
    await page.waitForTimeout(200);
    // Nudge the cursor slightly to ensure Pixi hit-tests again
    await page.mouse.move(
      box.x + nodePos.x + 1,
      box.y + nodePos.y + 1,
      { steps: 2 },
    );
    await page.waitForTimeout(400);

    await page.screenshot({
      path: "tests/screenshots/edge-create-hover.png",
    });

    const hover = await capturePixels(page);

    let hoverBlueDelta = 0;
    for (let i = 0; i < before.length; i += 4) {
      const bb = before[i + 2]!;
      const hr = hover[i]!, hg = hover[i + 1]!, hb = hover[i + 2]!;
      // Became significantly bluer (selection/port blue is ~3b82f6)
      if (hb - bb > 40 && hb > 150 && hr < 150) hoverBlueDelta++;
    }
    console.log(`  Hover blue pixel delta: ${hoverBlueDelta}`);
    expect(hoverBlueDelta).toBeGreaterThan(10);
  });

  test("drag from port to another node creates an edge", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    // Find two adjacent on-screen nodes and get port screen positions
    const positions = await page.evaluate(() => {
      const app = (window as any).__PIXI_APP__;
      if (!app?.stage) return null;
      const screenW = app.renderer.width;
      const screenH = app.renderer.height;

      const onScreenNodes: { node: any; center: { x: number; y: number } }[] = [];
      const walk = (c: any, depth: number) => {
        if (!c || depth > 10) return;
        if (typeof c.label === "string" && c.label.startsWith("node-")) {
          const b = c.getBounds();
          const cx = b.x + b.width / 2;
          const cy = b.y + b.height / 2;
          if (
            cx > 100 && cx < screenW - 100 &&
            cy > 100 && cy < screenH - 100
          ) {
            onScreenNodes.push({ node: c, center: { x: cx, y: cy } });
          }
          return;
        }
        for (const child of c.children ?? []) walk(child, depth + 1);
      };
      walk(app.stage, 0);

      if (onScreenNodes.length < 2) return null;

      // Pick two horizontally adjacent nodes
      const a = onScreenNodes[Math.floor(onScreenNodes.length / 3)]!;
      const b = onScreenNodes[Math.floor((onScreenNodes.length * 2) / 3)]!;

      const aBounds = a.node.getBounds();
      const bBounds = b.node.getBounds();
      return {
        // Right port of node A
        startPort: {
          x: aBounds.x + aBounds.width,
          y: aBounds.y + aBounds.height / 2,
        },
        // Center of node B as drop target
        endCenter: b.center,
      };
    });

    if (!positions) throw new Error("Not enough on-screen nodes");
    console.log(`  Start port: ${JSON.stringify(positions.startPort)}`);
    console.log(`  End center: ${JSON.stringify(positions.endCenter)}`);

    const edgesBefore = await countEdgeLines(page);

    // Hover over source node first to make ports visible
    await page.mouse.move(
      box.x + positions.startPort.x - 40,
      box.y + positions.startPort.y,
      { steps: 10 },
    );
    await page.waitForTimeout(300);

    // Drag from port to target
    await page.mouse.move(
      box.x + positions.startPort.x,
      box.y + positions.startPort.y,
      { steps: 5 },
    );
    await page.waitForTimeout(100);

    await page.screenshot({
      path: "tests/screenshots/edge-create-before-drag.png",
    });

    await page.mouse.down();
    await page.mouse.move(
      box.x + positions.endCenter.x,
      box.y + positions.endCenter.y,
      { steps: 20 },
    );
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
    console.log(`  Edges before: ${edgesBefore}, after: ${edgesAfter}`);
    expect(edgesAfter).toBe(edgesBefore + 1);
  });
});

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
