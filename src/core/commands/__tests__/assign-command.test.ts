import { describe, test, expect, beforeEach } from "vitest";
import { AssignCommand } from "../assign-command";
import { ElementRegistry } from "../../registry/element-registry";
import { syncToContainer } from "../../registry/sync";
import { makeNode, makeGroup } from "./helpers";

describe("AssignCommand", () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
  });

  test("should assign a node to a group", () => {
    registry.addElement("g1", makeGroup("g1"));
    registry.addElement("n1", makeNode("n1"));

    const cmd = new AssignCommand("n1", "g1", registry, syncToContainer);
    cmd.execute();

    expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g1");
  });

  test("should undo assignment back to root", () => {
    registry.addElement("g1", makeGroup("g1"));
    registry.addElement("n1", makeNode("n1"));

    const cmd = new AssignCommand("n1", "g1", registry, syncToContainer);
    cmd.execute();
    cmd.undo();

    expect(registry.getElementOrThrow("n1").parentGroupId).toBeNull();
    expect(registry.getElementOrThrow("n1").visible).toBe(true);
  });

  test("should remove from group when target is null", () => {
    registry.addElement("g1", makeGroup("g1"));
    registry.addElement("n1", makeNode("n1"));
    registry.setParentGroup("n1", "g1");

    const cmd = new AssignCommand("n1", null, registry, syncToContainer);
    cmd.execute();

    expect(registry.getElementOrThrow("n1").parentGroupId).toBeNull();
  });

  test("should undo removal back to group", () => {
    registry.addElement("g1", makeGroup("g1"));
    registry.addElement("n1", makeNode("n1"));
    registry.setParentGroup("n1", "g1");

    const cmd = new AssignCommand("n1", null, registry, syncToContainer);
    cmd.execute();
    cmd.undo();

    expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g1");
  });

  test("should move node between groups (g1 -> g2)", () => {
    registry.addElement("g1", makeGroup("g1"));
    registry.addElement("g2", makeGroup("g2"));
    registry.addElement("n1", makeNode("n1"));
    registry.setParentGroup("n1", "g1");

    const cmd = new AssignCommand("n1", "g2", registry, syncToContainer);
    cmd.execute();

    expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g2");
    expect(registry.getChildrenOf("g1")).toHaveLength(0);
    expect(registry.getChildrenOf("g2")).toHaveLength(1);
  });

  test("should undo group transfer back to original group", () => {
    registry.addElement("g1", makeGroup("g1"));
    registry.addElement("g2", makeGroup("g2"));
    registry.addElement("n1", makeNode("n1"));
    registry.setParentGroup("n1", "g1");

    const cmd = new AssignCommand("n1", "g2", registry, syncToContainer);
    cmd.execute();
    cmd.undo();

    expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g1");
    expect(registry.getChildrenOf("g1")).toHaveLength(1);
    expect(registry.getChildrenOf("g2")).toHaveLength(0);
  });

  test("should hide node when assigned to collapsed group", () => {
    registry.addElement("g1", makeGroup("g1", { collapsed: true }));
    registry.addElement("n1", makeNode("n1"));

    const cmd = new AssignCommand("n1", "g1", registry, syncToContainer);
    cmd.execute();

    expect(registry.getElementOrThrow("n1").visible).toBe(false);
  });
});
