import { beforeEach, describe, expect, test } from "vitest";
import { makeEdge, makeGroup, makeNode } from "../../commands/__tests__/helpers";
import { ElementRegistry } from "../element-registry";

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

    test("should throw when adding edge with non-existent source", () => {
      registry.addElement("n2", makeNode("n2"));
      expect(() => registry.addEdge("e1", makeEdge("e1", "ghost", "n2"))).toThrow(/source/);
    });

    test("should throw when adding edge with non-existent target", () => {
      registry.addElement("n1", makeNode("n1"));
      expect(() => registry.addEdge("e1", makeEdge("e1", "n1", "ghost"))).toThrow(/target/);
    });
  });

  describe("removeElement edge safety", () => {
    test("should throw when connected edges remain", () => {
      registry.addElement("n1", makeNode("n1"));
      registry.addElement("n2", makeNode("n2"));
      registry.addEdge("e1", makeEdge("e1", "n1", "n2"));

      expect(() => registry.removeElement("n1")).toThrow(/connected edge/);
    });

    test("should allow removal after edges are explicitly removed", () => {
      registry.addElement("n1", makeNode("n1"));
      registry.addElement("n2", makeNode("n2"));
      registry.addEdge("e1", makeEdge("e1", "n1", "n2"));

      registry.removeEdge("e1");
      registry.removeElement("n1");

      expect(registry.getElement("n1")).toBeUndefined();
      expect(registry.getEdgesForNode("n2")).toEqual([]);
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

    test("should clear container mapping when element is removed", () => {
      const node = makeNode("n1");
      registry.addElement("n1", node);
      registry.removeElement("n1");
      expect(registry.getIdByContainer(node.container)).toBeUndefined();
    });
  });

  describe("group removal invariants", () => {
    test("should reset children parentGroupId when group is removed", () => {
      registry.addElement("g1", makeGroup("g1"));
      registry.addElement("n1", makeNode("n1"));
      registry.addElement("n2", makeNode("n2"));
      registry.setParentGroup("n1", "g1");
      registry.setParentGroup("n2", "g1");

      registry.removeElement("g1");

      expect(registry.getElementOrThrow("n1").parentGroupId).toBeNull();
      expect(registry.getElementOrThrow("n2").parentGroupId).toBeNull();
    });
  });

  describe("setParentGroup validation", () => {
    test("should throw when assigning to a non-existent group", () => {
      registry.addElement("n1", makeNode("n1"));
      expect(() => registry.setParentGroup("n1", "ghost")).toThrow();
    });

    test("should throw when assigning to a node instead of a group", () => {
      registry.addElement("n1", makeNode("n1"));
      registry.addElement("n2", makeNode("n2"));
      expect(() => registry.setParentGroup("n1", "n2")).toThrow(/not a group/);
    });
  });

  describe("reconnectEdge", () => {
    test("should reconnect source endpoint to a new node", () => {
      registry.addElement("n1", makeNode("n1"));
      registry.addElement("n2", makeNode("n2"));
      registry.addElement("n3", makeNode("n3"));
      registry.addEdge("e1", makeEdge("e1", "n1", "n2"));

      registry.reconnectEdge("e1", "source", "n3", "bottom");

      const edge = registry.getEdgeOrThrow("e1");
      expect(edge.sourceId).toBe("n3");
      expect(edge.sourceSide).toBe("bottom");
      expect(edge.targetId).toBe("n2");

      // Edge index should be updated
      expect(registry.getEdgesForNode("n1")).toHaveLength(0);
      expect(registry.getEdgesForNode("n3")).toHaveLength(1);
      expect(registry.getEdgesForNode("n2")).toHaveLength(1);
    });

    test("should reconnect target endpoint to a new node", () => {
      registry.addElement("n1", makeNode("n1"));
      registry.addElement("n2", makeNode("n2"));
      registry.addElement("n3", makeNode("n3"));
      registry.addEdge("e1", makeEdge("e1", "n1", "n2"));

      registry.reconnectEdge("e1", "target", "n3", "top");

      const edge = registry.getEdgeOrThrow("e1");
      expect(edge.sourceId).toBe("n1");
      expect(edge.targetId).toBe("n3");
      expect(edge.targetSide).toBe("top");

      expect(registry.getEdgesForNode("n2")).toHaveLength(0);
      expect(registry.getEdgesForNode("n3")).toHaveLength(1);
    });

    test("should throw when edge does not exist", () => {
      expect(() => registry.reconnectEdge("ghost", "source", "n1", "top")).toThrow();
    });

    test("should throw when new node does not exist", () => {
      registry.addElement("n1", makeNode("n1"));
      registry.addElement("n2", makeNode("n2"));
      registry.addEdge("e1", makeEdge("e1", "n1", "n2"));

      expect(() => registry.reconnectEdge("e1", "source", "ghost", "top")).toThrow(/not found/);
    });

    test("should clear position cache after reconnect", () => {
      registry.addElement("n1", makeNode("n1"));
      registry.addElement("n2", makeNode("n2"));
      registry.addElement("n3", makeNode("n3"));
      registry.addEdge("e1", makeEdge("e1", "n1", "n2"));

      const edge = registry.getEdgeOrThrow("e1");
      edge._posCache = {
        srcX: 0,
        srcY: 0,
        srcW: 0,
        srcH: 0,
        tgtX: 0,
        tgtY: 0,
        tgtW: 0,
        tgtH: 0,
        selected: false,
      };

      registry.reconnectEdge("e1", "target", "n3", "top");
      expect(edge._posCache).toBeUndefined();
    });
  });

  describe("re-add after removal", () => {
    test("should allow adding an element with the same id after removal", () => {
      registry.addElement("n1", makeNode("n1"));
      registry.removeElement("n1");
      registry.addElement("n1", makeNode("n1"));

      expect(registry.getElement("n1")).toBeDefined();
      expect(registry.getEdgesForNode("n1")).toEqual([]);
    });
  });
});
