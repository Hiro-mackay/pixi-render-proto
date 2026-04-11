import { test, expect } from "@playwright/test";

test.describe("StrictMode Lifecycle", () => {
  test("should not produce unhandled errors on initial load", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 10_000 });
    // Wait for StrictMode double-mount cycle to complete
    await page.waitForTimeout(2_000);

    const relevantErrors = errors.filter(
      (e) => !e.includes("404") && !e.includes("favicon"),
    );
    expect(relevantErrors).toEqual([]);
  });

  test("should produce exactly one canvas after StrictMode remount", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 10_000 });
    await page.waitForTimeout(2_000);

    const canvasCount = await page.evaluate(
      () => document.querySelectorAll("canvas").length,
    );
    expect(canvasCount).toBe(1);
  });

  test("should not leak event listeners on rapid navigation", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // Rapid mount/unmount cycle
    for (let i = 0; i < 3; i++) {
      await page.goto("/");
      await page.waitForTimeout(300);
      await page.goto("about:blank");
      await page.waitForTimeout(100);
    }

    // Final load
    await page.goto("/");
    await page.waitForSelector("canvas", { timeout: 10_000 });
    await page.waitForTimeout(1_500);

    const canvasCount = await page.evaluate(
      () => document.querySelectorAll("canvas").length,
    );
    expect(canvasCount).toBe(1);

    const relevantErrors = errors.filter(
      (e) => !e.includes("404") && !e.includes("favicon"),
    );
    expect(relevantErrors).toEqual([]);
  });
});
