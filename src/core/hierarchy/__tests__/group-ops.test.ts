import { describe, test, expect, beforeEach } from "vitest";
import { ElementRegistry } from "../../registry/element-registry";
import {
  canAssign,
  assignToGroup,
  removeFromGroup,
  getDescendants,
  isDescendantOf,
  updateVisibility,
} from "../group-ops";
import type { CanvasElement, GroupMeta } from "../../types";

function makeNode(id: string): CanvasElement {
  return {
    id, type: "node",
    x: 100, y: 100, width: 100, height: 50,
    visible: true, parentGroupId: null,
    container: { x: 100, y: 100, visible: true } as never,
    meta: { label: id, color: 0 },
  };
}

function makeGroup(id: string): CanvasElement {
  return {
    id, type: "group",
    x: 0, y: 0, width: 400, height: 300,
    visible: true, parentGroupId: null,
    container: { x: 0, y: 0, visible: true } as never,
    meta: { label: id, color: 0, collapsed: false, expandedHeight: 300 } satisfies GroupMeta,
  };
}

describe("group hierarchy operations", () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
  });

  describe("cycle prevention", () => {
    test("should reject assigning an element to itself", () => {
      registry.addElement("g1", makeGroup("g1"));
      expect(canAssign("g1", "g1", registry)).toBe(false);
    });

    test("should reject creating a cycle (A→B→A)", () => {
      registry.addElement("gA", makeGroup("gA"));
      registry.addElement("gB", makeGroup("gB"));
      assignToGroup("gB", "gA", registry);

      expect(canAssign("gA", "gB", registry)).toBe(false);
    });

    test("should reject deeper cycles (A→B→C→A)", () => {
      registry.addElement("gA", makeGroup("gA"));
      registry.addElement("gB", makeGroup("gB"));
      registry.addElement("gC", makeGroup("gC"));
      assignToGroup("gB", "gA", registry);
      assignToGroup("gC", "gB", registry);

      expect(canAssign("gA", "gC", registry)).toBe(false);
    });

    test("should allow valid assignments", () => {
      registry.addElement("g1", makeGroup("g1"));
      registry.addElement("n1", makeNode("n1"));
      expect(canAssign("n1", "g1", registry)).toBe(true);
    });
  });

  describe("descendants", () => {
    test("should return all nested descendants", () => {
      registry.addElement("g1", makeGroup("g1"));
      registry.addElement("g2", makeGroup("g2"));
      registry.addElement("n1", makeNode("n1"));
      registry.addElement("n2", makeNode("n2"));

      assignToGroup("g2", "g1", registry);
      assignToGroup("n1", "g1", registry);
      assignToGroup("n2", "g2", registry);

      const desc = getDescendants("g1", registry);
      expect(desc.map((d) => d.id).sort()).toEqual(["g2", "n1", "n2"]);
    });

    test("should detect descendant relationships", () => {
      registry.addElement("g1", makeGroup("g1"));
      registry.addElement("g2", makeGroup("g2"));
      registry.addElement("n1", makeNode("n1"));

      assignToGroup("g2", "g1", registry);
      assignToGroup("n1", "g2", registry);

      expect(isDescendantOf("n1", "g1", registry)).toBe(true);
      expect(isDescendantOf("g1", "n1", registry)).toBe(false);
    });
  });

  describe("visibility derives from ancestor collapse state", () => {
    test("should hide all descendants when a group is collapsed", () => {
      registry.addElement("g1", makeGroup("g1"));
      registry.addElement("n1", makeNode("n1"));
      registry.addElement("n2", makeNode("n2"));
      assignToGroup("n1", "g1", registry);
      assignToGroup("n2", "g1", registry);

      (registry.getElementOrThrow("g1").meta as GroupMeta).collapsed = true;
      updateVisibility("g1", registry);

      expect(registry.getElementOrThrow("n1").visible).toBe(false);
      expect(registry.getElementOrThrow("n2").visible).toBe(false);
    });

    test("should preserve child group's collapse state when parent expands", () => {
      registry.addElement("gParent", makeGroup("gParent"));
      registry.addElement("gChild", makeGroup("gChild"));
      registry.addElement("n1", makeNode("n1"));
      assignToGroup("gChild", "gParent", registry);
      assignToGroup("n1", "gChild", registry);

      // Child group is collapsed
      (registry.getElementOrThrow("gChild").meta as GroupMeta).collapsed = true;

      // Parent collapses: everything hidden
      (registry.getElementOrThrow("gParent").meta as GroupMeta).collapsed = true;
      updateVisibility("gParent", registry);
      expect(registry.getElementOrThrow("gChild").visible).toBe(false);
      expect(registry.getElementOrThrow("n1").visible).toBe(false);

      // Parent expands: child group visible, but n1 stays hidden (child group still collapsed)
      (registry.getElementOrThrow("gParent").meta as GroupMeta).collapsed = false;
      updateVisibility("gParent", registry);
      expect(registry.getElementOrThrow("gChild").visible).toBe(true);
      expect(registry.getElementOrThrow("n1").visible).toBe(false);
    });
  });

  describe("group membership", () => {
    test("should assign and remove from group", () => {
      registry.addElement("g1", makeGroup("g1"));
      registry.addElement("n1", makeNode("n1"));

      assignToGroup("n1", "g1", registry);
      expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g1");

      removeFromGroup("n1", registry);
      expect(registry.getElementOrThrow("n1").parentGroupId).toBeNull();
    });

    test("should silently reject cyclic assignment", () => {
      registry.addElement("gA", makeGroup("gA"));
      registry.addElement("gB", makeGroup("gB"));
      assignToGroup("gB", "gA", registry);

      assignToGroup("gA", "gB", registry);
      // gA should NOT have gB as parent (cycle rejected)
      expect(registry.getElementOrThrow("gA").parentGroupId).toBeNull();
    });
  });
});
