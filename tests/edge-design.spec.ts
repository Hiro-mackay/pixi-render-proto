import { test } from "@playwright/test";

const SCENE_LOAD_WAIT = 5_000;

test.describe("Edge Design Showcase", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 10_000 });
    await page.waitForTimeout(SCENE_LOAD_WAIT);
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
});
