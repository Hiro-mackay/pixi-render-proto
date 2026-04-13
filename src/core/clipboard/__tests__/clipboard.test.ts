import { describe, test, expect, beforeEach } from "vitest";
import { CanvasClipboard } from "../clipboard";
import { ElementRegistry } from "../../registry/element-registry";
import { CommandHistory } from "../../commands/command";
import { makeNode, makeGroup, makeEdge } from "../../commands/__tests__/helpers";
import type { AddElementOps, AddRemoveOps } from "../../commands/add-remove-command";

function createMockOps() {
  const added: Array<{ id: string; type: string }> = [];
  const removed: string[] = [];
  const edgesAdded: Array<{ id: string }> = [];
  const edgesRemoved: string[] = [];

  const elementOps: AddElementOps = {
    doAddNode: (id) => { added.push({ id, type: "node" }); },
    doAddGroup: (id) => { added.push({ id, type: "group" }); },
    doRemove: (id) => { removed.push(id); },
  };
  const edgeOps: AddRemoveOps = {
    doAddEdge: (id) => { edgesAdded.push({ id }); },
    doRemoveEdge: (id) => { edgesRemoved.push(id); },
  };

  return { elementOps, edgeOps, added, removed, edgesAdded, edgesRemoved };
}

describe("CanvasClipboard", () => {
  let registry: ElementRegistry;
  let clipboard: CanvasClipboard;
  let history: CommandHistory;

  beforeEach(() => {
    registry = new ElementRegistry();
    clipboard = new CanvasClipboard();
    history = new CommandHistory();
  });

  test("should be empty initially", () => {
    expect(clipboard.isEmpty()).toBe(true);
  });

  test("should not be empty after copy", () => {
    registry.addElement("n1", makeNode("n1"));
    clipboard.copy(new Set(["n1"]), registry);
    expect(clipboard.isEmpty()).toBe(false);
  });

  test("should copy selected nodes and paste with new IDs", () => {
    registry.addElement("n1", makeNode("n1"));
    clipboard.copy(new Set(["n1"]), registry);

    const { elementOps, edgeOps, added } = createMockOps();
    const ids = clipboard.paste(registry, history, elementOps, edgeOps);

    expect(ids).toHaveLength(1);
    expect(added).toHaveLength(1);
    expect(added[0]!.type).toBe("node");
    expect(ids[0]).not.toBe("n1");
  });

  test("should exclude edges where one endpoint is outside selection", () => {
    registry.addElement("n1", makeNode("n1"));
    registry.addElement("n2", makeNode("n2"));
    registry.addElement("n3", makeNode("n3"));
    registry.addEdge("e1", makeEdge("e1", "n1", "n2"));
    registry.addEdge("e2", makeEdge("e2", "n1", "n3"));

    clipboard.copy(new Set(["n1", "n2"]), registry);

    const { elementOps, edgeOps, edgesAdded } = createMockOps();
    clipboard.paste(registry, history, elementOps, edgeOps);

    expect(edgesAdded).toHaveLength(1);
  });

  test("should generate unique UUIDs on each paste", () => {
    registry.addElement("n1", makeNode("n1"));
    clipboard.copy(new Set(["n1"]), registry);

    const { elementOps, edgeOps } = createMockOps();
    const ids1 = clipboard.paste(registry, history, elementOps, edgeOps);
    const ids2 = clipboard.paste(registry, history, elementOps, edgeOps);

    expect(ids1[0]).not.toBe("n1");
    expect(ids2[0]).not.toBe("n1");
    expect(ids1[0]).not.toBe(ids2[0]);
  });

  test("should paste as single undo unit", () => {
    registry.addElement("n1", makeNode("n1"));
    registry.addElement("n2", makeNode("n2"));
    clipboard.copy(new Set(["n1", "n2"]), registry);

    const { elementOps, edgeOps } = createMockOps();
    clipboard.paste(registry, history, elementOps, edgeOps);

    expect(history.canUndo).toBe(true);
    history.undo();
    expect(history.canUndo).toBe(false);
  });

  test("should return empty array when pasting empty clipboard", () => {
    const { elementOps, edgeOps } = createMockOps();
    const ids = clipboard.paste(registry, history, elementOps, edgeOps);
    expect(ids).toHaveLength(0);
  });

  test("should copy group descendants even if not explicitly selected", () => {
    registry.addElement("g1", makeGroup("g1"));
    registry.addElement("n1", makeNode("n1"));
    registry.setParentGroup("n1", "g1");

    clipboard.copy(new Set(["g1"]), registry);

    // Use ops that actually add to registry (needed for membership command)
    const added: Array<{ id: string; type: string }> = [];
    const pasteRegistry = new ElementRegistry();
    const elementOps: AddElementOps = {
      doAddNode: (id, opts) => {
        pasteRegistry.addElement(id, makeNode(id, opts.x, opts.y, opts.width, opts.height));
        added.push({ id, type: "node" });
      },
      doAddGroup: (id, opts) => {
        pasteRegistry.addElement(id, makeGroup(id, { x: opts.x, y: opts.y, width: opts.width, height: opts.height }));
        added.push({ id, type: "group" });
      },
      doRemove: (id) => { pasteRegistry.removeElement(id); },
    };
    const edgeOps: AddRemoveOps = { doAddEdge: () => {}, doRemoveEdge: () => {} };

    clipboard.paste(pasteRegistry, history, elementOps, edgeOps);

    expect(added).toHaveLength(2);
  });

  test("should not overwrite clipboard data on duplicate", () => {
    registry.addElement("n1", makeNode("n1"));
    registry.addElement("n2", makeNode("n2"));

    clipboard.copy(new Set(["n1"]), registry);
    clipboard.duplicate(new Set(["n2"]), registry, history, createMockOps().elementOps, createMockOps().edgeOps);

    // Clipboard should still have n1 data
    const { elementOps, edgeOps, added } = createMockOps();
    clipboard.paste(registry, history, elementOps, edgeOps);

    expect(added).toHaveLength(1);
  });
});
