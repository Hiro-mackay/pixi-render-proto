import { describe, test, expect } from "vitest";
import { CommandHistory } from "../command";
import { MoveCommand } from "../move-command";
import { ResizeCommand } from "../resize-command";
import type { CanvasElement } from "../../types";
import { syncToContainer } from "../../registry/element-registry";

function makeElement(x: number, y: number, w = 100, h = 50): CanvasElement {
  const el: CanvasElement = {
    id: "n1", type: "node",
    x, y, width: w, height: h,
    visible: true, parentGroupId: null,
    container: { x, y, visible: true } as never,
    meta: { label: "test", color: 0 },
  };
  return el;
}

describe("MoveCommand", () => {
  test("should move an element to a new position", () => {
    const el = makeElement(0, 0);
    const cmd = new MoveCommand(el, 100, 200, syncToContainer, "s1");
    cmd.execute();
    expect(el.x).toBe(100);
    expect(el.y).toBe(200);
  });

  test("should restore original position on undo", () => {
    const el = makeElement(50, 60);
    const cmd = new MoveCommand(el, 200, 300, syncToContainer, "s1");
    cmd.execute();
    cmd.undo();
    expect(el.x).toBe(50);
    expect(el.y).toBe(60);
  });

  test("should merge continuous drag movements in the same session", () => {
    const history = new CommandHistory();
    const el = makeElement(0, 0);

    history.execute(new MoveCommand(el, 10, 10, syncToContainer, "drag-1"));
    history.execute(new MoveCommand(el, 20, 20, syncToContainer, "drag-1"));
    history.execute(new MoveCommand(el, 30, 30, syncToContainer, "drag-1"));

    expect(el.x).toBe(30);

    // One undo should revert all the way back to original
    history.undo();
    expect(el.x).toBe(0);
    expect(history.canUndo).toBe(false);
  });

  test("should not merge movements from different sessions", () => {
    const history = new CommandHistory();
    const el = makeElement(0, 0);

    history.execute(new MoveCommand(el, 10, 10, syncToContainer, "drag-1"));
    history.execute(new MoveCommand(el, 50, 50, syncToContainer, "drag-2"));

    history.undo();
    expect(el.x).toBe(10);
  });
});

describe("ResizeCommand", () => {
  test("should resize an element", () => {
    const el = makeElement(0, 0, 100, 50);
    const cmd = new ResizeCommand(el, 0, 0, 200, 100, syncToContainer, "s1");
    cmd.execute();
    expect(el.width).toBe(200);
    expect(el.height).toBe(100);
  });

  test("should restore original size and position on undo", () => {
    const el = makeElement(10, 20, 100, 50);
    const cmd = new ResizeCommand(el, 5, 15, 200, 100, syncToContainer, "s1");
    cmd.execute();
    cmd.undo();
    expect(el.x).toBe(10);
    expect(el.y).toBe(20);
    expect(el.width).toBe(100);
    expect(el.height).toBe(50);
  });

  test("should merge continuous resize in the same session", () => {
    const history = new CommandHistory();
    const el = makeElement(0, 0, 100, 50);

    history.execute(new ResizeCommand(el, 0, 0, 120, 60, syncToContainer, "r1"));
    history.execute(new ResizeCommand(el, 0, 0, 150, 80, syncToContainer, "r1"));

    history.undo();
    expect(el.width).toBe(100);
    expect(el.height).toBe(50);
  });

  test("should undo resize even when element was mutated before command creation", () => {
    const el = makeElement(10, 20, 100, 50);

    // Simulate what resize-handles.ts does: mutate element during drag,
    // then create command with already-mutated values
    el.x = 5;
    el.y = 15;
    el.width = 200;
    el.height = 100;

    // Pass explicit old values to avoid the bug where old === new
    const cmd = new ResizeCommand(el, 5, 15, 200, 100, syncToContainer, "s1",
      10, 20, 100, 50);
    // Don't execute — values already applied

    cmd.undo();
    expect(el.x).toBe(10);
    expect(el.y).toBe(20);
    expect(el.width).toBe(100);
    expect(el.height).toBe(50);

    cmd.execute();
    expect(el.width).toBe(200);
    expect(el.height).toBe(100);
  });
});

describe("expandedHeight tracking for groups", () => {
  test("should restore height after collapse/expand even if resized while expanded", () => {
    const el: CanvasElement = {
      id: "g1", type: "group",
      x: 0, y: 0, width: 400, height: 300,
      visible: true, parentGroupId: null,
      container: { x: 0, y: 0, visible: true } as never,
      meta: { label: "test", color: 0, collapsed: false, expandedHeight: 300 },
    };

    // Resize while expanded: height 300 → 500
    el.height = 500;
    (el.meta as { expandedHeight: number }).expandedHeight = 500;

    // Collapse
    (el.meta as { collapsed: boolean }).collapsed = true;
    el.height = 28;

    // Expand: should restore to 500, not 300
    (el.meta as { collapsed: boolean }).collapsed = false;
    el.height = (el.meta as { expandedHeight: number }).expandedHeight;

    expect(el.height).toBe(500);
  });
});
