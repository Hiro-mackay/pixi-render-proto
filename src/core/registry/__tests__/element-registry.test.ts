import { describe, test, expect, beforeEach } from "vitest";
import { ElementRegistry } from "../element-registry";
import type { CanvasEdge, CanvasElement } from "../../types";

function makeNode(id: string): CanvasElement {
  return {
    id, type: "node",
    x: 0, y: 0, width: 100, height: 50,
    visible: true, parentGroupId: null,
    container: {} as never,
    meta: { label: id, color: 0x000000 },
  };
}

function makeGroup(id: string): CanvasElement {
  return {
    id, type: "group",
    x: 0, y: 0, width: 400, height: 300,
    visible: true, parentGroupId: null,
    container: {} as never,
    meta: { label: id, color: 0x000000, collapsed: false },
  };
}

function makeEdge(id: string, sourceId: string, targetId: string): CanvasEdge {
  return {
    id, sourceId, sourceSide: "right", targetId, targetSide: "left",
    label: null, line: {} as never, hitLine: {} as never,
    labelPill: null, labelText: null, selected: false,
  };
}

describe("ElementRegistry", () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
  });

  describe("scene composition", () => {
    test("should build a scene with nodes, groups, and edges", () => {
      registry.addElement("g1", makeGroup("g1"));
      registry.addElement("n1", makeNode("n1"));
      registry.addElement("n2", makeNode("n2"));
      registry.addEdge("e1", makeEdge("e1", "n1", "n2"));

      expect(registry.getAllNodes()).toHaveLength(2);
      expect(registry.getAllGroups()).toHaveLength(1);
      expect(registry.getAllEdges().size).toBe(1);
    });

    test("should reject duplicate element ids", () => {
      registry.addElement("n1", makeNode("n1"));
      expect(() => registry.addElement("n1", makeNode("n1"))).toThrow();
    });

    test("should reject duplicate edge ids", () => {
      registry.addElement("n1", makeNode("n1"));
      registry.addElement("n2", makeNode("n2"));
      registry.addEdge("e1", makeEdge("e1", "n1", "n2"));
      expect(() => registry.addEdge("e1", makeEdge("e1", "n1", "n2"))).toThrow();
    });

    test("should throw when accessing a non-existent element", () => {
      expect(() => registry.getElementOrThrow("ghost")).toThrow();
    });
  });

  describe("deleting a node removes its connected edges", () => {
    test("should clean up edges when source node is removed", () => {
      registry.addElement("n1", makeNode("n1"));
      registry.addElement("n2", makeNode("n2"));
      registry.addEdge("e1", makeEdge("e1", "n1", "n2"));

      registry.removeElement("n1");

      expect(registry.getEdge("e1")).toBeUndefined();
      expect(registry.getEdgesForNode("n2")).toEqual([]);
    });

    test("should clean up edges when target node is removed", () => {
      registry.addElement("n1", makeNode("n1"));
      registry.addElement("n2", makeNode("n2"));
      registry.addEdge("e1", makeEdge("e1", "n1", "n2"));

      registry.removeElement("n2");

      expect(registry.getEdge("e1")).toBeUndefined();
      expect(registry.getEdgesForNode("n1")).toEqual([]);
    });
  });

  describe("querying edges by node", () => {
    test("should find all edges connected to a node as source or target", () => {
      registry.addElement("n1", makeNode("n1"));
      registry.addElement("n2", makeNode("n2"));
      registry.addElement("n3", makeNode("n3"));
      registry.addEdge("e1", makeEdge("e1", "n1", "n2"));
      registry.addEdge("e2", makeEdge("e2", "n3", "n1"));

      const edges = registry.getEdgesForNode("n1");
      expect(edges).toHaveLength(2);
    });

    test("should return no edges for an isolated node", () => {
      registry.addElement("n1", makeNode("n1"));
      expect(registry.getEdgesForNode("n1")).toEqual([]);
    });
  });

  describe("group membership", () => {
    test("should assign a node to a group", () => {
      registry.addElement("g1", makeGroup("g1"));
      registry.addElement("n1", makeNode("n1"));
      registry.setParentGroup("n1", "g1");

      expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g1");
      expect(registry.getChildrenOf("g1")).toHaveLength(1);
    });

    test("should move a node between groups", () => {
      registry.addElement("g1", makeGroup("g1"));
      registry.addElement("g2", makeGroup("g2"));
      registry.addElement("n1", makeNode("n1"));

      registry.setParentGroup("n1", "g1");
      registry.setParentGroup("n1", "g2");

      expect(registry.getChildrenOf("g1")).toHaveLength(0);
      expect(registry.getChildrenOf("g2")).toHaveLength(1);
    });

    test("should remove a node from its group", () => {
      registry.addElement("g1", makeGroup("g1"));
      registry.addElement("n1", makeNode("n1"));
      registry.setParentGroup("n1", "g1");
      registry.setParentGroup("n1", null);

      expect(registry.getElementOrThrow("n1").parentGroupId).toBeNull();
      expect(registry.getChildrenOf("g1")).toHaveLength(0);
    });

    test("should remove child from group index when child is deleted", () => {
      registry.addElement("g1", makeGroup("g1"));
      registry.addElement("n1", makeNode("n1"));
      registry.setParentGroup("n1", "g1");

      registry.removeElement("n1");

      expect(registry.getChildrenOf("g1")).toHaveLength(0);
    });
  });

  describe("container reverse lookup", () => {
    test("should find element id from its container reference", () => {
      const node = makeNode("n1");
      registry.addElement("n1", node);
      expect(registry.getIdByContainer(node.container)).toBe("n1");
    });
  });
});
