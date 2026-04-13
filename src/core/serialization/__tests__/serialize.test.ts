import { describe, test, expect, beforeEach } from "vitest";
import { serialize } from "../serialize";
import { ElementRegistry } from "../../registry/element-registry";
import { makeNode, makeGroup, makeEdge } from "../../commands/__tests__/helpers";

describe("serialize", () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
  });

  test("should serialize all nodes and groups", () => {
    registry.addElement("n1", makeNode("n1", 10, 20, 100, 50));
    registry.addElement("g1", makeGroup("g1", { x: 0, y: 0, width: 400, height: 300 }));

    const data = serialize(registry);

    expect(data.version).toBe(1);
    expect(data.nodes).toHaveLength(1);
    expect(data.groups).toHaveLength(1);
    expect(data.nodes[0]!.id).toBe("n1");
    expect(data.groups[0]!.id).toBe("g1");
  });

  test("should serialize edges", () => {
    registry.addElement("n1", makeNode("n1"));
    registry.addElement("n2", makeNode("n2"));
    registry.addEdge("e1", makeEdge("e1", "n1", "n2"));

    const data = serialize(registry);

    expect(data.edges).toHaveLength(1);
    expect(data.edges[0]!.sourceId).toBe("n1");
    expect(data.edges[0]!.targetId).toBe("n2");
  });

  test("should serialize group memberships", () => {
    registry.addElement("g1", makeGroup("g1"));
    registry.addElement("n1", makeNode("n1"));
    registry.setParentGroup("n1", "g1");

    const data = serialize(registry);

    expect(data.groupMemberships).toHaveLength(1);
    expect(data.groupMemberships[0]).toEqual({ childId: "n1", groupId: "g1" });
  });

  test("should preserve collapsed group state", () => {
    registry.addElement("g1", makeGroup("g1", { collapsed: true }));

    const data = serialize(registry);

    expect(data.groups[0]!.collapsed).toBe(true);
    expect(data.groups[0]!.expandedHeight).toBe(300);
  });

  test("should serialize viewport when provided", () => {
    registry.addElement("n1", makeNode("n1"));

    const data = serialize(registry, { x: 100, y: 200, zoom: 1.5 });

    expect(data.viewport).toEqual({ x: 100, y: 200, zoom: 1.5 });
  });

  test("should omit viewport when not provided", () => {
    registry.addElement("n1", makeNode("n1"));

    const data = serialize(registry);

    expect(data.viewport).toBeUndefined();
  });

  test("should produce empty arrays for empty registry", () => {
    const data = serialize(registry);

    expect(data.nodes).toEqual([]);
    expect(data.groups).toEqual([]);
    expect(data.edges).toEqual([]);
    expect(data.groupMemberships).toEqual([]);
  });
});
