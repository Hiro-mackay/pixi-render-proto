import { describe, test, expect, beforeEach, vi } from "vitest";
import { Container, Text } from "pixi.js";
import { RedrawManager } from "../redraw-manager";
import type { Redrawable } from "../../types";

function makeItem(visible = true): Redrawable {
  return { visible, __redraw: vi.fn() } as unknown as Redrawable;
}

function makeContainerTree(): { root: Container; childRedrawable: Redrawable; text: Text; nonRedrawChild: Container } {
  const root = new Container();
  const childRedrawable = new Container() as unknown as Redrawable;
  childRedrawable.__redraw = vi.fn();
  const text = new Text({ text: "label" });
  const nonRedrawChild = new Container();
  root.addChild(childRedrawable as unknown as Container, text, nonRedrawChild);
  return { root, childRedrawable, text, nonRedrawChild };
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

  describe("registerTree / unregisterTree", () => {
    test("should register __redraw children from a container tree", () => {
      const { root, childRedrawable } = makeContainerTree();
      manager.registerTree(root);
      manager.markAllDirty();
      manager.flush();

      expect(childRedrawable.__redraw).toHaveBeenCalledOnce();
    });

    test("should skip children without __redraw", () => {
      const { root, nonRedrawChild } = makeContainerTree();
      manager.registerTree(root);
      manager.markAllDirty();
      manager.flush();

      expect((nonRedrawChild as unknown as Redrawable).__redraw).toBeUndefined();
    });

    test("should unregister tree and stop tracking", () => {
      const { root, childRedrawable } = makeContainerTree();
      manager.registerTree(root);
      manager.unregisterTree(root);
      manager.markAllDirty();
      manager.flush();

      expect(childRedrawable.__redraw).not.toHaveBeenCalled();
    });
  });

  describe("markTreeDirty", () => {
    test("should mark only items within the given container tree as dirty", () => {
      const { root, childRedrawable } = makeContainerTree();
      const outside = makeItem();
      manager.registerTree(root);
      manager.register(outside);

      manager.markTreeDirty(root);
      manager.flush();

      expect(childRedrawable.__redraw).toHaveBeenCalledOnce();
      expect(outside.__redraw).not.toHaveBeenCalled();
    });

    test("should not mark items that were never registered", () => {
      const { root, childRedrawable } = makeContainerTree();
      // Register tree then unregister it — markTreeDirty should be a no-op
      manager.registerTree(root);
      manager.unregisterTree(root);

      manager.markTreeDirty(root);
      manager.flush();

      expect(childRedrawable.__redraw).not.toHaveBeenCalled();
    });
  });

  describe("updateTextResolutions", () => {
    test("should update resolution of tracked Text items", () => {
      const { root, text } = makeContainerTree();
      manager.registerTree(root);

      manager.updateTextResolutions(2);

      // In test env (no window), dpr defaults to 1 → ceil(2 * 1) = 2
      expect(text.resolution).toBe(2);
    });

    test("should not update Text items after unregisterTree", () => {
      const { root, text } = makeContainerTree();
      manager.registerTree(root);
      manager.unregisterTree(root);

      const originalRes = text.resolution;
      manager.updateTextResolutions(4);

      expect(text.resolution).toBe(originalRes);
    });

    test("should cap resolution at MAX_TEXT_RESOLUTION", () => {
      const { root, text } = makeContainerTree();
      manager.registerTree(root);

      manager.updateTextResolutions(100);

      expect(text.resolution).toBe(8);
    });
  });
});
