import { describe, test, expect, vi } from "vitest";
import { AddEdgeCommand, RemoveEdgeCommand } from "../add-remove-command";
import type { EdgeOptions } from "../../types";
import { makeNode, makeEdge, makeRegistry } from "./helpers";

const EDGE_OPTS: EdgeOptions = {
  sourceId: "n1", sourceSide: "right",
  targetId: "n2", targetSide: "left",
  label: "HTTPS :443", labelColor: 0x3b82f6,
};

describe("AddEdgeCommand", () => {
  test("should call doAddEdge on execute", () => {
    const doAddEdge = vi.fn();
    const doRemoveEdge = vi.fn();
    const cmd = new AddEdgeCommand("e1", EDGE_OPTS, { doAddEdge, doRemoveEdge });

    cmd.execute();

    expect(doAddEdge).toHaveBeenCalledWith("e1", EDGE_OPTS);
    expect(doRemoveEdge).not.toHaveBeenCalled();
  });

  test("should call doRemoveEdge on undo", () => {
    const doAddEdge = vi.fn();
    const doRemoveEdge = vi.fn();
    const cmd = new AddEdgeCommand("e1", EDGE_OPTS, { doAddEdge, doRemoveEdge });

    cmd.execute();
    cmd.undo();

    expect(doRemoveEdge).toHaveBeenCalledWith("e1");
  });

  test("should have type add-remove", () => {
    const cmd = new AddEdgeCommand("e1", EDGE_OPTS, { doAddEdge: vi.fn(), doRemoveEdge: vi.fn() });
    expect(cmd.type).toBe("add-remove");
  });
});

describe("RemoveEdgeCommand", () => {
  test("should snapshot edge options and call doRemoveEdge on execute", () => {
    const n1 = makeNode("n1");
    const n2 = makeNode("n2");
    const registry = makeRegistry(n1, n2);
    registry.addEdge("e1", makeEdge("e1", "n1", "n2"));

    const doAddEdge = vi.fn();
    const doRemoveEdge = vi.fn();
    const cmd = new RemoveEdgeCommand("e1", registry, { doAddEdge, doRemoveEdge });

    cmd.execute();

    expect(doRemoveEdge).toHaveBeenCalledWith("e1");
    expect(doAddEdge).not.toHaveBeenCalled();
  });

  test("should call doAddEdge with snapshotted options on undo", () => {
    const n1 = makeNode("n1");
    const n2 = makeNode("n2");
    const registry = makeRegistry(n1, n2);
    registry.addEdge("e1", makeEdge("e1", "n1", "n2"));

    const doAddEdge = vi.fn();
    const doRemoveEdge = vi.fn();
    const cmd = new RemoveEdgeCommand("e1", registry, { doAddEdge, doRemoveEdge });

    cmd.execute();
    cmd.undo();

    expect(doAddEdge).toHaveBeenCalledWith("e1", expect.objectContaining({
      sourceId: "n1", sourceSide: "right",
      targetId: "n2", targetSide: "left",
    }));
  });

  test("should have type add-remove", () => {
    const n1 = makeNode("n1");
    const n2 = makeNode("n2");
    const registry = makeRegistry(n1, n2);
    registry.addEdge("e1", makeEdge("e1", "n1", "n2"));

    const cmd = new RemoveEdgeCommand("e1", registry, { doAddEdge: vi.fn(), doRemoveEdge: vi.fn() });
    expect(cmd.type).toBe("add-remove");
  });
});
