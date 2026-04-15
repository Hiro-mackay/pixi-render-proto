import { describe, test, expect, beforeEach } from "vitest";
import { ElementRegistry } from "../../registry/element-registry";
import {
  canAssign,
  assignToGroup,
  removeFromGroup,
  getDescendants,
  isDescendantOf,
  updateVisibility,
  applyParentChange,
} from "../group-ops";
import type { GroupMeta } from "../../types";
import { makeNode, makeGroup } from "../../commands/__tests__/helpers";

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

    test("should throw on circular parentGroupId", () => {
      registry.addElement("gA", makeGroup("gA"));
      registry.addElement("gB", makeGroup("gB"));

      registry.setParentGroup("gB", "gA");
      // Creating A→B when B→A already exists would form a cycle
      expect(() => registry.setParentGroup("gA", "gB")).toThrow("cycle");
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

    test("should hide node when assigned to a collapsed group", () => {
      registry.addElement("g1", makeGroup("g1"));
      registry.addElement("n1", makeNode("n1"));

      (registry.getElementOrThrow("g1").meta as GroupMeta).collapsed = true;

      assignToGroup("n1", "g1", registry);
      updateVisibility("g1", registry);

      expect(registry.getElementOrThrow("n1").visible).toBe(false);
    });

    test("should recompute visibility when reparenting to collapsed ancestor", () => {
      registry.addElement("gOuter", makeGroup("gOuter"));
      registry.addElement("gInner", makeGroup("gInner"));
      registry.addElement("n1", makeNode("n1"));

      assignToGroup("gInner", "gOuter", registry);
      assignToGroup("n1", "gInner", registry);

      // Outer collapses: everything hidden
      (registry.getElementOrThrow("gOuter").meta as GroupMeta).collapsed = true;
      updateVisibility("gOuter", registry);
      expect(registry.getElementOrThrow("n1").visible).toBe(false);

      // Remove gInner (simulates group deletion reparenting children to gOuter)
      registry.setParentGroup("n1", "gOuter");
      updateVisibility("gOuter", registry);

      // n1 should still be hidden because gOuter is collapsed
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

    test("should return false when cyclic assignment is rejected", () => {
      registry.addElement("gA", makeGroup("gA"));
      registry.addElement("gB", makeGroup("gB"));
      assignToGroup("gB", "gA", registry);

      expect(assignToGroup("gA", "gB", registry)).toBe(false);
    });

    test("should return true on valid assignment", () => {
      registry.addElement("g1", makeGroup("g1"));
      registry.addElement("n1", makeNode("n1"));

      expect(assignToGroup("n1", "g1", registry)).toBe(true);
      expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g1");
    });
  });

  describe("isDescendantOf cycle safety", () => {
    test("should prevent cycle creation in setParentGroup", () => {
      registry.addElement("gA", makeGroup("gA"));
      registry.addElement("gB", makeGroup("gB"));

      registry.setParentGroup("gB", "gA");
      expect(() => registry.setParentGroup("gA", "gB")).toThrow("cycle");
    });
  });

  describe("applyParentChange", () => {
    test("should call sync when assigning to a new parent", () => {
      registry.addElement("g1", makeGroup("g1"));
      registry.addElement("n1", makeNode("n1"));

      const synced: string[] = [];
      const sync = (el: { id: string }) => synced.push(el.id);

      applyParentChange("n1", "g1", registry, sync);

      expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g1");
      expect(synced).toContain("n1");
    });

    test("should call sync when removing from parent", () => {
      registry.addElement("g1", makeGroup("g1"));
      registry.addElement("n1", makeNode("n1"));
      assignToGroup("n1", "g1", registry);

      const synced: string[] = [];
      const sync = (el: { id: string }) => synced.push(el.id);

      applyParentChange("n1", null, registry, sync);

      expect(registry.getElementOrThrow("n1").parentGroupId).toBeNull();
      expect(synced).toContain("n1");
    });

    test("should no-op when assigning to the same parent", () => {
      registry.addElement("g1", makeGroup("g1"));
      registry.addElement("n1", makeNode("n1"));
      assignToGroup("n1", "g1", registry);

      const synced: string[] = [];
      const sync = (el: { id: string }) => synced.push(el.id);

      applyParentChange("n1", "g1", registry, sync);

      expect(synced).toEqual([]);
    });

    test("should no-op when cyclic assignment is rejected", () => {
      registry.addElement("gA", makeGroup("gA"));
      registry.addElement("gB", makeGroup("gB"));
      assignToGroup("gB", "gA", registry);

      const synced: string[] = [];
      const sync = (el: { id: string }) => synced.push(el.id);

      applyParentChange("gA", "gB", registry, sync);

      expect(registry.getElementOrThrow("gA").parentGroupId).toBeNull();
      expect(synced).toEqual([]);
    });
  });
});
