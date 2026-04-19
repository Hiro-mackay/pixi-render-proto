import { test, expect } from "@playwright/test";

const LOAD_PROFILES = [
  { nodes: 200, maxLoadMs: 500, maxLongTaskMs: 100 },
  { nodes: 500, maxLoadMs: 1500, maxLongTaskMs: 150 },
  { nodes: 1000, maxLoadMs: 3000, maxLongTaskMs: 200 },
] as const;

for (const { nodes, maxLoadMs, maxLongTaskMs } of LOAD_PROFILES) {
  test.describe(`Load Performance: ${nodes} nodes`, () => {
    if (nodes >= 1000) test.slow();

    test(`initial load completes within ${maxLoadMs}ms with no long tasks above ${maxLongTaskMs}ms`, async ({
      page,
    }) => {
      // Set up Long Task observer before navigation.
      // Store both observer ref and task list so we can disconnect after measurement.
      await page.addInitScript(() => {
        const tasks: number[] = [];
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            tasks.push(entry.duration);
          }
        });
        observer.observe({ entryTypes: ["longtask"] });
        (window as unknown as Record<string, unknown>).__longTasks = tasks;
        (window as unknown as Record<string, unknown>).__longTaskObserver =
          observer;
      });

      await page.goto(`/?nodes=${nodes}`);
      await page.waitForSelector("canvas", { timeout: 30_000 });

      // Wait for scene-load measure to be recorded
      const loadMs = await page.evaluate(() => {
        return new Promise<number>((resolve, reject) => {
          let attempts = 0;
          const check = () => {
            const entries = performance.getEntriesByName(
              "scene-load",
              "measure",
            );
            if (entries.length > 0) {
              resolve(entries[0]!.duration);
            } else if (++attempts > 300) {
              reject(new Error("scene-load measure not recorded within 5s"));
            } else {
              requestAnimationFrame(check);
            }
          };
          check();
        });
      });

      // Heuristic settle: wait for any trailing long tasks triggered by the
      // first render frames after scene load. The PerformanceObserver captures
      // all tasks, but tasks scheduled after scene-load (layout, compositing)
      // may not fire until subsequent frames.
      await page.waitForTimeout(500);

      const maxLongTask = await page.evaluate(() => {
        const tasks = (window as unknown as Record<string, number[]>)
          .__longTasks;
        // Disconnect observer to prevent accumulation across test reuse
        const observer = (
          window as unknown as Record<string, PerformanceObserver>
        ).__longTaskObserver;
        observer?.disconnect();
        return tasks.length > 0 ? Math.max(...tasks) : 0;
      });

      console.log(
        `  [${nodes} nodes] Load: ${loadMs.toFixed(0)}ms, Max Long Task: ${maxLongTask.toFixed(0)}ms`,
      );

      expect(loadMs).toBeLessThan(maxLoadMs);
      expect(maxLongTask).toBeLessThan(maxLongTaskMs);
    });
  });
}
