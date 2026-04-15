import { describe, test, expect, vi, beforeEach } from "vitest";
import { deserializeScene, type DeserializeContext } from "../deserialize";
import { serialize } from "../serialize";
import { ElementRegistry } from "../../registry/element-registry";
import { CommandHistory } from "../../commands/command";
import { makeNode, makeGroup, makeEdge } from "../../commands/__tests__/helpers";
import type { CanvasEngine } from "../../engine";
import type { SceneData } from "../schema";

function createMockEngine(registry: ElementRegistry): CanvasEngine {
  return {
    addNode: vi.fn((id, opts) => {
      registry.addElement(id, makeNode(id, opts.x, opts.y, opts.width, opts.height));
    }),
    addGroup: vi.fn((id, opts) => {
      registry.addElement(id, makeGroup(id, { x: opts.x, y: opts.y, width: opts.width, height: opts.height }));
    }),
    addEdge: vi.fn((id, opts) => {
      registry.addEdge(id, makeEdge(id, opts.sourceId, opts.targetId));
    }),
    removeElement: vi.fn((id) => { registry.removeElement(id); }),
    removeEdge: vi.fn((id) => { registry.removeEdge(id); }),
    toggleCollapse: vi.fn(),
    viewport: { moveCenter: vi.fn(), setZoom: vi.fn() },
  } as unknown as CanvasEngine;
}

describe("deserializeScene", () => {
  let registry: ElementRegistry;
  let history: CommandHistory;
  let engine: CanvasEngine;
  let ctx: DeserializeContext;

  beforeEach(() => {
    registry = new ElementRegistry();
    history = new CommandHistory();
    engine = createMockEngine(registry);
    ctx = { engine, registry, history };
  });

  test("should restore nodes and groups from serialized data", () => {
    const data: SceneData = {
      version: 1,
      nodes: [{ id: "n1", x: 10, y: 20, width: 100, height: 50, label: "Node", color: 0x333 }],
      groups: [{ id: "g1", x: 0, y: 0, width: 400, height: 300, label: "Group", color: 0x555, collapsed: false, expandedHeight: 300 }],
      edges: [],
      groupMemberships: [],
    };

    deserializeScene(data, ctx);

    expect(registry.getElement("n1")).toBeDefined();
    expect(registry.getElement("g1")).toBeDefined();
  });

  test("should restore edges", () => {
    const data: SceneData = {
      version: 1,
      nodes: [
        { id: "n1", x: 0, y: 0, width: 100, height: 50, label: "A", color: 0x333 },
        { id: "n2", x: 200, y: 0, width: 100, height: 50, label: "B", color: 0x333 },
      ],
      groups: [],
      edges: [{ id: "e1", sourceId: "n1", sourceSide: "right", targetId: "n2", targetSide: "left" }],
      groupMemberships: [],
    };

    deserializeScene(data, ctx);

    expect(registry.getEdge("e1")).toBeDefined();
  });

  test("should skip edges with missing endpoints", () => {
    const data: SceneData = {
      version: 1,
      nodes: [{ id: "n1", x: 0, y: 0, width: 100, height: 50, label: "A", color: 0x333 }],
      groups: [],
      edges: [{ id: "e1", sourceId: "n1", sourceSide: "right", targetId: "missing", targetSide: "left" }],
      groupMemberships: [],
    };

    deserializeScene(data, ctx);

    expect(registry.getEdge("e1")).toBeUndefined();
  });

  test("should restore group memberships", () => {
    const data: SceneData = {
      version: 1,
      nodes: [{ id: "n1", x: 0, y: 0, width: 100, height: 50, label: "A", color: 0x333 }],
      groups: [{ id: "g1", x: 0, y: 0, width: 400, height: 300, label: "Group", color: 0x555, collapsed: false, expandedHeight: 300 }],
      edges: [],
      groupMemberships: [{ childId: "n1", groupId: "g1" }],
    };

    deserializeScene(data, ctx);

    expect(registry.getElement("n1")?.parentGroupId).toBe("g1");
  });

  test("should restore collapsed state directly without toggleCollapse", () => {
    const data: SceneData = {
      version: 1,
      nodes: [],
      groups: [{ id: "g1", x: 0, y: 0, width: 400, height: 300, label: "Group", color: 0x555, collapsed: true, expandedHeight: 300 }],
      edges: [],
      groupMemberships: [],
    };

    deserializeScene(data, ctx);

    const group = registry.getElement("g1");
    expect(group?.type).toBe("group");
    if (group?.type === "group") {
      expect(group.meta.collapsed).toBe(true);
      expect(group.meta.expandedHeight).toBe(300);
    }
    expect(engine.toggleCollapse).not.toHaveBeenCalled();
  });

  test("should clear history after deserialize", () => {
    // Add a command to history first
    history.execute({ type: "move", execute() {}, undo() {} });
    expect(history.canUndo).toBe(true);

    const data: SceneData = {
      version: 1, nodes: [], groups: [], edges: [], groupMemberships: [],
    };

    deserializeScene(data, ctx);

    expect(history.canUndo).toBe(false);
  });

  test("should throw on unknown version", () => {
    const data = {
      version: 99, nodes: [], groups: [], edges: [], groupMemberships: [],
    } as unknown as SceneData;

    expect(() => deserializeScene(data, ctx)).toThrow(/version/i);
  });

  test("should restore viewport position and zoom", () => {
    const data: SceneData = {
      version: 1, nodes: [], groups: [], edges: [], groupMemberships: [],
      viewport: { x: 100, y: 200, zoom: 1.5 },
    };

    deserializeScene(data, ctx);

    expect(engine.viewport.moveCenter).toHaveBeenCalledWith(100, 200);
    expect(engine.viewport.setZoom).toHaveBeenCalledWith(1.5, true);
  });

  test("should not touch viewport when not provided", () => {
    const data: SceneData = {
      version: 1, nodes: [], groups: [], edges: [], groupMemberships: [],
    };

    deserializeScene(data, ctx);

    expect(engine.viewport.moveCenter).not.toHaveBeenCalled();
    expect(engine.viewport.setZoom).not.toHaveBeenCalled();
  });

  test("should throw when scene data is null", () => {
    expect(() => deserializeScene(null, ctx)).toThrow(/non-null object/);
  });

  test("should throw when nodes array is missing", () => {
    expect(() => deserializeScene({ version: 1 }, ctx)).toThrow(/nodes/);
  });

  test("should throw when edge label is not a string", () => {
    expect(() => deserializeScene({
      version: 1, nodes: [], groups: [], edges: [{ id: "e1", sourceId: "n1", sourceSide: "right", targetId: "n2", targetSide: "left", label: 42 }], groupMemberships: [],
    }, ctx)).toThrow(/label/);
  });

  test("should throw when edge labelColor is not a number", () => {
    expect(() => deserializeScene({
      version: 1, nodes: [], groups: [], edges: [{ id: "e1", sourceId: "n1", sourceSide: "right", targetId: "n2", targetSide: "left", labelColor: "red" }], groupMemberships: [],
    }, ctx)).toThrow(/labelColor/);
  });

  test("should rollback on partial import failure", () => {
    registry.addElement("existing", makeNode("existing", 0, 0, 100, 50));

    // Mock engine that throws when it encounters the node id "n-bomb"
    const badEngine = {
      ...engine,
      addNode: vi.fn((id: string, opts: { x: number; y: number; width: number; height: number; label: string; color: number }) => {
        if (id === "n-bomb") throw new Error("boom");
        registry.addElement(id, makeNode(id, opts.x, opts.y, opts.width, opts.height));
      }),
    } as unknown as CanvasEngine;
    const badCtx: DeserializeContext = { engine: badEngine, registry, history };

    const data: SceneData = {
      version: 1,
      nodes: [
        { id: "n-ok", x: 0, y: 0, width: 100, height: 50, label: "OK", color: 0x333 },
        { id: "n-bomb", x: 0, y: 0, width: 100, height: 50, label: "Fail", color: 0x333 },
      ],
      groups: [], edges: [], groupMemberships: [],
    };

    expect(() => deserializeScene(data, badCtx)).toThrow("boom");

    // Original element should be restored via rollback
    expect(registry.getElement("existing")).toBeDefined();
    // Partial import element should not remain
    expect(registry.getElement("n-ok")).toBeUndefined();
  });

  test("should preserve history state when import fails and rolls back", () => {
    history.execute({ type: "move", execute() {}, undo() {} });
    expect(history.canUndo).toBe(true);

    const data = {
      version: 1,
      nodes: [{ id: "n-bomb", x: 0, y: 0, width: 100, height: 50, label: "Fail", color: 0x333 }],
      groups: [], edges: [], groupMemberships: [],
    } as unknown as SceneData;

    const badEngine = {
      ...engine,
      addNode: vi.fn(() => { throw new Error("boom"); }),
    } as unknown as CanvasEngine;

    expect(() => deserializeScene(data, { engine: badEngine, registry, history })).toThrow("boom");
    // history.clear() is only called on success, so pre-existing history survives
    expect(history.canUndo).toBe(true);
  });

  test("should round-trip via serialize -> deserialize", () => {
    // Build a scene
    registry.addElement("n1", makeNode("n1", 10, 20, 100, 50));
    registry.addElement("g1", makeGroup("g1"));
    registry.addElement("n2", makeNode("n2", 200, 20, 100, 50));
    registry.setParentGroup("n1", "g1");
    registry.addEdge("e1", makeEdge("e1", "n1", "n2"));

    const serialized = serialize(registry);

    // Deserialize into a fresh registry
    const reg2 = new ElementRegistry();
    const eng2 = createMockEngine(reg2);
    const ctx2: DeserializeContext = { engine: eng2, registry: reg2, history: new CommandHistory() };

    deserializeScene(serialized, ctx2);

    const reserialized = serialize(reg2);

    expect(reserialized.nodes).toHaveLength(serialized.nodes.length);
    expect(reserialized.groups).toHaveLength(serialized.groups.length);
    expect(reserialized.edges).toHaveLength(serialized.edges.length);
    expect(reserialized.groupMemberships).toHaveLength(serialized.groupMemberships.length);
  });
});
