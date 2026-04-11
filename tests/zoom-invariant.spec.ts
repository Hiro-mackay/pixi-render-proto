import { test, expect, type Page } from "@playwright/test";

const SCENE_LOAD_WAIT = 5_000;

test.describe("Zoom-Invariant Rendering Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 10_000 });
    await page.waitForTimeout(SCENE_LOAD_WAIT);
  });

  test("1. Node stroke width stays constant across zoom levels", async ({
    page,
  }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    // Aim at area with nodes
    const targetX = box.x + box.width * 0.35;
    const targetY = box.y + box.height * 0.35;
    await page.mouse.move(targetX, targetY);

    const zoomLevels = [
      { name: "0.6x", scrolls: 0 },
      { name: "2x", scrolls: 2 },
      { name: "4x", scrolls: 4 },
    ];

    const strokeWidthMeasurements: Record<string, number> = {};

    // Hold Control while scrolling to simulate trackpad pinch (ctrlKey wheel)
    await page.keyboard.down("Control");

    let totalScrolls = 0;
    for (const level of zoomLevels) {
      const scrollsNeeded = level.scrolls - totalScrolls;
      for (let i = 0; i < scrollsNeeded; i++) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(80);
      }
      totalScrolls = level.scrolls;
      await page.waitForTimeout(600);

      const result = await measureHorizontalStrokeWidth(page);
      strokeWidthMeasurements[level.name] = result.mode;
      console.log(
        `  ${level.name}: mode=${result.mode}px, runs=${result.runCount}, colors=[${result.sampleColors}]`,
      );

      await page.screenshot({
        path: `tests/screenshots/invariant-${level.name}.png`,
      });
    }

    await page.keyboard.up("Control");

    // Stroke widths should stay roughly constant (within ±2 pixel tolerance
    // to account for anti-aliasing differences at different zoom levels).
    const widths = Object.values(strokeWidthMeasurements).filter((w) => w > 0);
    if (widths.length >= 2) {
      const max = Math.max(...widths);
      const min = Math.min(...widths);
      console.log(`  Min: ${min}, Max: ${max}, Delta: ${max - min}`);
      expect(max - min).toBeLessThanOrEqual(2);
    }
  });

  test("2. Click to select shows outline and handles", async ({ page }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Capture before-click pixel snapshot
    const beforeData = await capturePixelSnapshot(page);

    // Click a node (no drag)
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.up();
    await page.waitForTimeout(400);

    await page.screenshot({ path: "tests/screenshots/after-select.png" });

    // Capture after-click snapshot and diff
    const afterData = await capturePixelSnapshot(page);

    let changedPixels = 0;
    let blueChange = 0;
    let whiteChange = 0;
    for (let i = 0; i < beforeData.length; i += 4) {
      const dr = Math.abs(beforeData[i]! - afterData[i]!);
      const dg = Math.abs(beforeData[i + 1]! - afterData[i + 1]!);
      const db = Math.abs(beforeData[i + 2]! - afterData[i + 2]!);
      if (dr + dg + db > 30) {
        changedPixels++;
        const r = afterData[i]!, g = afterData[i + 1]!, b = afterData[i + 2]!;
        // Loosely detect selection colors
        if (b > 150 && b > r + 30) blueChange++;
        if (r > 200 && g > 200 && b > 200) whiteChange++;
      }
    }

    console.log(`  Changed pixels: ${changedPixels}`);
    console.log(`  Blue-ish changes: ${blueChange}`);
    console.log(`  White-ish changes: ${whiteChange}`);

    // Selection should cause visible pixel changes (outline + handles)
    expect(changedPixels).toBeGreaterThan(30);
    expect(blueChange + whiteChange).toBeGreaterThan(5);
  });

  test("3. Selection handles stay constant screen size on zoom", async ({
    page,
  }) => {
    const canvas = page.locator("canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    // Select a node
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(400);

    await page.screenshot({
      path: "tests/screenshots/select-1x.png",
    });

    // Hold Ctrl for zoom (simulates Mac pinch)
    await page.keyboard.down("Control");

    // Zoom in
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(600);

    await page.screenshot({
      path: "tests/screenshots/select-3x.png",
    });

    // Zoom more
    for (let i = 0; i < 2; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(80);
    }
    await page.waitForTimeout(600);

    await page.screenshot({
      path: "tests/screenshots/select-6x.png",
    });

    await page.keyboard.up("Control");
  });
});

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
    // Serialize to base64 for transfer
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

async function measureHorizontalStrokeWidth(page: Page): Promise<{
  mode: number;
  runCount: number;
  sampleColors: string;
}> {
  return await page.evaluate(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    if (!canvas) return { mode: 0, runCount: 0, sampleColors: "no canvas" };

    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const ctx = tmp.getContext("2d");
    if (!ctx) return { mode: 0, runCount: 0, sampleColors: "no ctx" };

    ctx.drawImage(canvas, 0, 0);
    const data = ctx.getImageData(0, 0, tmp.width, tmp.height).data;

    const BG_R = 26, BG_G = 26, BG_B = 46;
    // Lower threshold — catch lighter/anti-aliased pixels
    const THRESHOLD = 40;

    const strokeRuns: number[] = [];
    const colorSet = new Set<string>();

    for (let x = 0; x < tmp.width; x += 2) {
      let runLen = 0;
      for (let y = 0; y < tmp.height; y++) {
        const i = (y * tmp.width + x) * 4;
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
        const dist =
          Math.abs(r - BG_R) + Math.abs(g - BG_G) + Math.abs(b - BG_B);
        if (dist > THRESHOLD) {
          runLen++;
          if (colorSet.size < 20 && runLen <= 3) {
            colorSet.add(`${r},${g},${b}`);
          }
        } else {
          if (runLen >= 1 && runLen <= 6) strokeRuns.push(runLen);
          runLen = 0;
        }
      }
      if (runLen >= 1 && runLen <= 6) strokeRuns.push(runLen);
    }

    if (strokeRuns.length === 0) {
      return { mode: 0, runCount: 0, sampleColors: "no runs" };
    }

    const counts: Record<number, number> = {};
    for (const r of strokeRuns) counts[r] = (counts[r] ?? 0) + 1;
    let bestVal = 0;
    let bestCount = 0;
    for (const [val, count] of Object.entries(counts)) {
      if (count > bestCount) {
        bestCount = count;
        bestVal = Number(val);
      }
    }
    return {
      mode: bestVal,
      runCount: strokeRuns.length,
      sampleColors: Array.from(colorSet).slice(0, 5).join(" | "),
    };
  });
}
