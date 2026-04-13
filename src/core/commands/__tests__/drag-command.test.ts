import { describe, test, expect, beforeEach } from "vitest";
import { DragCommand } from "../drag-command";
import { ElementRegistry } from "../../registry/element-registry";
import { syncToContainer } from "../../registry/sync";
import { makeNode, makeGroup } from "./helpers";

const sync = syncToContainer;

describe("DragCommand", () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
  });

  test("should move element to final position on execute", () => {
    registry.addElement("n1", makeNode("n1"));
    const cmd = new DragCommand(
      "n1", registry,
      new Map([["n1", { x: 100, y: 200 }]]),
      new Map([["n1", { x: 300, y: 400 }]]),
      sync, "s1", null, null,
    );
    cmd.execute();
    const el = registry.getElementOrThrow("n1");
    expect(el.x).toBe(300);
    expect(el.y).toBe(400);
  });

  test("should restore element to start position on undo", () => {
    registry.addElement("n1", makeNode("n1"));
    const cmd = new DragCommand(
      "n1", registry,
      new Map([["n1", { x: 100, y: 200 }]]),
      new Map([["n1", { x: 300, y: 400 }]]),
      sync, "s1", null, null,
    );
    cmd.execute();
    cmd.undo();
    const el = registry.getElementOrThrow("n1");
    expect(el.x).toBe(100);
    expect(el.y).toBe(200);
  });

  test("should move group and descendants together", () => {
    registry.addElement("g1", makeGroup("g1"));
    registry.addElement("n1", makeNode("n1", 50, 60));
    registry.setParentGroup("n1", "g1");

    const cmd = new DragCommand(
      "g1", registry,
      new Map([["g1", { x: 0, y: 0 }], ["n1", { x: 50, y: 60 }]]),
      new Map([["g1", { x: 100, y: 100 }], ["n1", { x: 150, y: 160 }]]),
      sync, "s1", null, null,
    );
    cmd.execute();
    expect(registry.getElementOrThrow("g1").x).toBe(100);
    expect(registry.getElementOrThrow("n1").x).toBe(150);

    cmd.undo();
    expect(registry.getElementOrThrow("g1").x).toBe(0);
    expect(registry.getElementOrThrow("n1").x).toBe(50);
  });
});
