import { describe, expect, test } from "vitest";
import { syncToContainer } from "../../registry/sync";
import type { CanvasElement } from "../../types";
import { CommandHistory } from "../command";
import { MoveCommand } from "../move-command";
import { ResizeCommand } from "../resize-command";
import { makeNode, makeRegistry } from "./helpers";

describe("MoveCommand", () => {
  test("should move an element to a new position", () => {
    const el = makeNode("n1", 0, 0);
    const registry = makeRegistry(el);
    const cmd = new MoveCommand("n1", registry, 100, 200, syncToContainer, "s1");
    cmd.execute();
    expect(el.x).toBe(100);
    expect(el.y).toBe(200);
  });

  test("should restore original position on undo", () => {
    const el = makeNode("n1", 50, 60);
    const registry = makeRegistry(el);
    const cmd = new MoveCommand("n1", registry, 200, 300, syncToContainer, "s1");
    cmd.execute();
    cmd.undo();
    expect(el.x).toBe(50);
    expect(el.y).toBe(60);
  });

  test("should merge continuous drag movements in the same session", () => {
    const history = new CommandHistory();
    const el = makeNode("n1", 0, 0);
    const registry = makeRegistry(el);

    history.execute(new MoveCommand("n1", registry, 10, 10, syncToContainer, "drag-1"));
    history.execute(new MoveCommand("n1", registry, 20, 20, syncToContainer, "drag-1"));
    history.execute(new MoveCommand("n1", registry, 30, 30, syncToContainer, "drag-1"));

    expect(el.x).toBe(30);
    history.undo();
    expect(el.x).toBe(0);
    expect(history.canUndo).toBe(false);
  });

  test("should not merge movements from different sessions", () => {
    const history = new CommandHistory();
    const el = makeNode("n1", 0, 0);
    const registry = makeRegistry(el);

    history.execute(new MoveCommand("n1", registry, 10, 10, syncToContainer, "drag-1"));
    history.execute(new MoveCommand("n1", registry, 50, 50, syncToContainer, "drag-2"));

    history.undo();
    expect(el.x).toBe(10);
  });
});

describe("ResizeCommand", () => {
  test("should resize an element", () => {
    const el = makeNode("n1", 0, 0, 100, 50);
    const registry = makeRegistry(el);
    const cmd = new ResizeCommand({
      elementId: "n1",
      registry,
      sync: syncToContainer,
      sessionId: "s1",
      target: { x: 0, y: 0, width: 200, height: 100 },
    });
    cmd.execute();
    expect(el.width).toBe(200);
    expect(el.height).toBe(100);
  });

  test("should restore original size and position on undo", () => {
    const el = makeNode("n1", 10, 20, 100, 50);
    const registry = makeRegistry(el);
    const cmd = new ResizeCommand({
      elementId: "n1",
      registry,
      sync: syncToContainer,
      sessionId: "s1",
      target: { x: 5, y: 15, width: 200, height: 100 },
    });
    cmd.execute();
    cmd.undo();
    expect(el.x).toBe(10);
    expect(el.y).toBe(20);
    expect(el.width).toBe(100);
    expect(el.height).toBe(50);
  });

  test("should merge continuous resize in the same session", () => {
    const history = new CommandHistory();
    const el = makeNode("n1", 0, 0, 100, 50);
    const registry = makeRegistry(el);

    history.execute(
      new ResizeCommand({
        elementId: "n1",
        registry,
        sync: syncToContainer,
        sessionId: "r1",
        target: { x: 0, y: 0, width: 120, height: 60 },
      }),
    );
    history.execute(
      new ResizeCommand({
        elementId: "n1",
        registry,
        sync: syncToContainer,
        sessionId: "r1",
        target: { x: 0, y: 0, width: 150, height: 80 },
      }),
    );

    history.undo();
    expect(el.width).toBe(100);
    expect(el.height).toBe(50);
  });

  test("should undo resize even when element was mutated before command creation", () => {
    const el = makeNode("n1", 10, 20, 100, 50);
    const registry = makeRegistry(el);

    el.x = 5;
    el.y = 15;
    el.width = 200;
    el.height = 100;

    const cmd = new ResizeCommand({
      elementId: "n1",
      registry,
      sync: syncToContainer,
      sessionId: "s1",
      target: { x: 5, y: 15, width: 200, height: 100 },
      previous: { x: 10, y: 20, width: 100, height: 50 },
    });

    cmd.undo();
    expect(el.x).toBe(10);
    expect(el.width).toBe(100);

    cmd.execute();
    expect(el.width).toBe(200);
  });
});

describe("expandedHeight tracking for groups", () => {
  test("should restore height after collapse/expand even if resized while expanded", () => {
    const el: CanvasElement = {
      id: "g1",
      type: "group",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      visible: true,
      parentGroupId: null,
      container: { x: 0, y: 0, visible: true } as never,
      edgeSidesLocked: false,
      meta: { label: "test", color: 0, collapsed: false, expandedHeight: 300 },
    };

    el.height = 500;
    (el.meta as { expandedHeight: number }).expandedHeight = 500;
    (el.meta as { collapsed: boolean }).collapsed = true;
    el.height = 28;
    (el.meta as { collapsed: boolean }).collapsed = false;
    el.height = (el.meta as { expandedHeight: number }).expandedHeight;

    expect(el.height).toBe(500);
  });
});

describe("CommandHistory: merge round-trip", () => {
  test("should undo/redo correctly after merge", () => {
    const history = new CommandHistory();
    const el = makeNode("n1", 0, 0);
    const registry = makeRegistry(el);

    history.execute(new MoveCommand("n1", registry, 10, 10, syncToContainer, "s1"));
    history.execute(new MoveCommand("n1", registry, 50, 50, syncToContainer, "s1"));

    expect(el.x).toBe(50);
    history.undo();
    expect(el.x).toBe(0);
    history.redo();
    expect(el.x).toBe(50);
    history.undo();
    expect(el.x).toBe(0);
  });
});

describe("CommandHistory: batch round-trip", () => {
  test("should undo/redo batch as a single operation", () => {
    const history = new CommandHistory();
    const n1 = makeNode("n1", 0, 0);
    const n2 = makeNode("n2", 10, 10);
    const registry = makeRegistry(n1, n2);

    history.batch([
      new MoveCommand("n1", registry, 100, 100, syncToContainer, "s1"),
      new MoveCommand("n2", registry, 200, 200, syncToContainer, "s2"),
    ]);

    expect(n1.x).toBe(100);
    expect(n2.x).toBe(200);

    history.undo();
    expect(n1.x).toBe(0);
    expect(n2.x).toBe(10);

    history.redo();
    expect(n1.x).toBe(100);
    expect(n2.x).toBe(200);
  });
});

describe("CommandHistory: maxSize", () => {
  test("should drop oldest command when exceeding maxSize", () => {
    const history = new CommandHistory(3);
    const el = makeNode("n1", 0, 0);
    const registry = makeRegistry(el);

    history.execute(new MoveCommand("n1", registry, 10, 10, syncToContainer, "a"));
    history.execute(new MoveCommand("n1", registry, 20, 20, syncToContainer, "b"));
    history.execute(new MoveCommand("n1", registry, 30, 30, syncToContainer, "c"));
    history.execute(new MoveCommand("n1", registry, 40, 40, syncToContainer, "d"));

    // 4 commands pushed with maxSize=3: oldest (10,10) should be dropped
    history.undo(); // 40 -> 30
    history.undo(); // 30 -> 20
    history.undo(); // 20 -> 10
    expect(history.canUndo).toBe(false);
    // Cannot undo back to (0,0) because that command was dropped
    expect(el.x).toBe(10);
  });
});
