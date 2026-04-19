import { beforeEach, describe, expect, test } from "vitest";
import type { EventDescriptor } from "../../events/event-emitter";
import { ElementRegistry } from "../../registry/element-registry";
import { CommandHistory } from "../command";
import { MoveCommand } from "../move-command";
import { ResizeCommand } from "../resize-command";
import { makeNode } from "./helpers";

describe("Undo/Redo domain events", () => {
  let registry: ElementRegistry;
  let emitted: EventDescriptor[];
  let history: CommandHistory;
  const noopSync = () => {};

  beforeEach(() => {
    registry = new ElementRegistry();
    emitted = [];
    history = new CommandHistory(200, (cmd, direction) => {
      const events = cmd.getDomainEvents?.(direction);
      if (events) emitted.push(...events);
    });
  });

  test("should emit element:move on undo of MoveCommand", () => {
    registry.addElement("n1", makeNode("n1", 0, 0, 100, 50));
    history.execute(new MoveCommand("n1", registry, 50, 60, noopSync, "s1"));
    expect(emitted).toHaveLength(0);

    history.undo();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({ event: "element:move", data: { id: "n1", x: 0, y: 0 } });
  });

  test("should emit element:move on redo of MoveCommand", () => {
    registry.addElement("n1", makeNode("n1", 0, 0, 100, 50));
    history.execute(new MoveCommand("n1", registry, 50, 60, noopSync, "s1"));
    history.undo();
    emitted.length = 0;

    history.redo();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({ event: "element:move", data: { id: "n1", x: 50, y: 60 } });
  });

  test("should emit element:resize on undo of ResizeCommand", () => {
    registry.addElement("n1", makeNode("n1", 0, 0, 100, 50));
    history.execute(
      new ResizeCommand({
        elementId: "n1",
        registry,
        target: { x: 0, y: 0, width: 200, height: 100 },
        sync: noopSync,
        sessionId: "s1",
      }),
    );
    emitted.length = 0;

    history.undo();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toEqual({
      event: "element:resize",
      data: { id: "n1", width: 100, height: 50 },
    });
  });

  test("should emit events for all commands in a batch on undo", () => {
    registry.addElement("n1", makeNode("n1", 0, 0, 100, 50));
    registry.addElement("n2", makeNode("n2", 200, 0, 100, 50));
    history.batch([
      new MoveCommand("n1", registry, 10, 10, noopSync, "s1"),
      new MoveCommand("n2", registry, 210, 10, noopSync, "s1"),
    ]);
    emitted.length = 0;

    history.undo();
    expect(emitted).toHaveLength(2);
    const ids = emitted.map((e) => (e.data as { id: string }).id).sort();
    expect(ids).toEqual(["n1", "n2"]);
  });
});
