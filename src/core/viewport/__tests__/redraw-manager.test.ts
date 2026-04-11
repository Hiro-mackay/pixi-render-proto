import { describe, test, expect, beforeEach, vi } from "vitest";
import { RedrawManager } from "../redraw-manager";
import type { Redrawable } from "../../types";

function makeItem(visible = true): Redrawable {
  return { visible, __redraw: vi.fn() } as unknown as Redrawable;
}

describe("RedrawManager", () => {
  let manager: RedrawManager;

  beforeEach(() => {
    manager = new RedrawManager();
  });

  describe("only changed elements are redrawn", () => {
    test("should redraw a moved element but not untouched ones", () => {
      const moved = makeItem();
      const still = makeItem();
      manager.register(moved);
      manager.register(still);

      manager.markDirty(moved);
      manager.flush();

      expect(moved.__redraw).toHaveBeenCalledOnce();
      expect(still.__redraw).not.toHaveBeenCalled();
    });

    test("should not redraw the same element twice without a new change", () => {
      const item = makeItem();
      manager.register(item);
      manager.markDirty(item);
      manager.flush();
      manager.flush();

      expect(item.__redraw).toHaveBeenCalledOnce();
    });
  });

  describe("zoom triggers full redraw", () => {
    test("should redraw all elements when zoom changes", () => {
      const a = makeItem();
      const b = makeItem();
      manager.register(a);
      manager.register(b);

      manager.markAllDirty();
      manager.flush();

      expect(a.__redraw).toHaveBeenCalledOnce();
      expect(b.__redraw).toHaveBeenCalledOnce();
    });
  });

  describe("hidden elements are skipped", () => {
    test("should not redraw collapsed or invisible elements", () => {
      const hidden = makeItem(false);
      manager.register(hidden);
      manager.markDirty(hidden);
      manager.flush();

      expect(hidden.__redraw).not.toHaveBeenCalled();
    });
  });

  describe("cleanup on element removal", () => {
    test("should stop tracking removed elements", () => {
      const item = makeItem();
      manager.register(item);
      manager.unregister(item);
      manager.markAllDirty();
      manager.flush();

      expect(item.__redraw).not.toHaveBeenCalled();
    });
  });
});
