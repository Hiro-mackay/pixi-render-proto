import { describe, expect, test } from "vitest";
import { ReconnectEdgeCommand } from "../edge-command";
import { makeEdge, makeNode, makeRegistry } from "./helpers";

describe("ReconnectEdgeCommand", () => {
  function setup() {
    const n1 = makeNode("n1");
    const n2 = makeNode("n2");
    const n3 = makeNode("n3");
    const registry = makeRegistry(n1, n2, n3);
    registry.addEdge("e1", makeEdge("e1", "n1", "n2"));
    return registry;
  }

  test("should reconnect source endpoint on execute", () => {
    const registry = setup();
    const cmd = new ReconnectEdgeCommand("e1", "source", "n3", "bottom", registry);

    cmd.execute();

    const edge = registry.getEdgeOrThrow("e1");
    expect(edge.sourceId).toBe("n3");
    expect(edge.sourceSide).toBe("bottom");
    expect(edge.targetId).toBe("n2");
  });

  test("should restore original source on undo", () => {
    const registry = setup();
    const cmd = new ReconnectEdgeCommand("e1", "source", "n3", "bottom", registry);

    cmd.execute();
    cmd.undo();

    const edge = registry.getEdgeOrThrow("e1");
    expect(edge.sourceId).toBe("n1");
    expect(edge.sourceSide).toBe("right");
  });

  test("should reconnect target endpoint on execute", () => {
    const registry = setup();
    const cmd = new ReconnectEdgeCommand("e1", "target", "n3", "top", registry);

    cmd.execute();

    const edge = registry.getEdgeOrThrow("e1");
    expect(edge.sourceId).toBe("n1");
    expect(edge.targetId).toBe("n3");
    expect(edge.targetSide).toBe("top");
  });

  test("should restore original target on undo", () => {
    const registry = setup();
    const cmd = new ReconnectEdgeCommand("e1", "target", "n3", "top", registry);

    cmd.execute();
    cmd.undo();

    const edge = registry.getEdgeOrThrow("e1");
    expect(edge.targetId).toBe("n2");
    expect(edge.targetSide).toBe("left");
  });

  test("should survive undo-redo cycle", () => {
    const registry = setup();
    const cmd = new ReconnectEdgeCommand("e1", "target", "n3", "top", registry);

    cmd.execute();
    cmd.undo();
    cmd.execute();

    const edge = registry.getEdgeOrThrow("e1");
    expect(edge.targetId).toBe("n3");
    expect(edge.targetSide).toBe("top");
  });

  test("should have type edge", () => {
    const registry = setup();
    const cmd = new ReconnectEdgeCommand("e1", "source", "n3", "bottom", registry);
    expect(cmd.type).toBe("edge");
  });

  test("should update edge index on execute", () => {
    const registry = setup();
    const cmd = new ReconnectEdgeCommand("e1", "source", "n3", "bottom", registry);

    cmd.execute();

    expect(registry.getEdgesForNode("n1")).toHaveLength(0);
    expect(registry.getEdgesForNode("n3")).toHaveLength(1);
    expect(registry.getEdgesForNode("n2")).toHaveLength(1);
  });

  test("should restore edge index on undo", () => {
    const registry = setup();
    const cmd = new ReconnectEdgeCommand("e1", "source", "n3", "bottom", registry);

    cmd.execute();
    cmd.undo();

    expect(registry.getEdgesForNode("n1")).toHaveLength(1);
    expect(registry.getEdgesForNode("n3")).toHaveLength(0);
  });
});
