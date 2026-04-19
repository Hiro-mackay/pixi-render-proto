import { beforeEach, describe, expect, test } from "vitest";
import { updateVisibility } from "../../hierarchy/group-ops";
import { ElementRegistry } from "../../registry/element-registry";
import { syncToContainer } from "../../registry/sync";
import type { GroupMeta, GroupOptions, NodeOptions } from "../../types";
import { AssignCommand } from "../assign-command";
import { CommandHistory } from "../command";
import { DeleteCommand } from "../delete-command";
import { makeGroup, makeNode } from "./helpers";

const sync = syncToContainer;

describe("Command integration: undo/redo round-trips", () => {
  let registry: ElementRegistry;
  let history: CommandHistory;

  beforeEach(() => {
    registry = new ElementRegistry();
    history = new CommandHistory();
  });

  test("assignToGroup -> undo -> redo preserves parentGroupId and visible", () => {
    registry.addElement("g1", makeGroup("g1"));
    registry.addElement("n1", makeNode("n1"));

    const cmd = new AssignCommand("n1", "g1", registry, sync);
    history.execute(cmd);
    expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g1");

    history.undo();
    expect(registry.getElementOrThrow("n1").parentGroupId).toBeNull();
    expect(registry.getElementOrThrow("n1").visible).toBe(true);

    history.redo();
    expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g1");
  });

  test("assign to collapsed group -> undo -> redo preserves visibility", () => {
    registry.addElement("g1", makeGroup("g1", { collapsed: true }));
    registry.addElement("n1", makeNode("n1"));

    const cmd = new AssignCommand("n1", "g1", registry, sync);
    history.execute(cmd);
    expect(registry.getElementOrThrow("n1").visible).toBe(false);

    history.undo();
    expect(registry.getElementOrThrow("n1").visible).toBe(true);

    history.redo();
    expect(registry.getElementOrThrow("n1").visible).toBe(false);
  });

  test("delete node from collapsed group -> undo restores visibility", () => {
    registry.addElement("g1", makeGroup("g1", { collapsed: true }));
    registry.addElement("n1", makeNode("n1"));
    registry.setParentGroup("n1", "g1");
    updateVisibility("g1", registry);
    expect(registry.getElementOrThrow("n1").visible).toBe(false);

    const doRemove = (id: string) => {
      registry.removeElement(id);
    };
    const doAddNode = (id: string, opts: NodeOptions) => {
      registry.addElement(id, makeNode(id, opts.x, opts.y));
    };
    const doAddGroup = () => {};
    const doAddEdge = () => {};

    const cmd = new DeleteCommand("n1", registry, sync, {
      doRemove,
      doAddNode,
      doAddGroup,
      doAddEdge,
    });
    history.execute(cmd);
    expect(registry.getElement("n1")).toBeUndefined();

    history.undo();
    expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g1");
    expect(registry.getElementOrThrow("n1").visible).toBe(false);
  });

  test("delete collapsed group -> undo restores collapsed + expandedHeight + children", () => {
    registry.addElement("g1", makeGroup("g1", { collapsed: true }));
    registry.addElement("n1", makeNode("n1"));
    registry.addElement("n2", makeNode("n2"));
    registry.setParentGroup("n1", "g1");
    registry.setParentGroup("n2", "g1");
    updateVisibility("g1", registry);

    const doRemove = (id: string) => {
      if (registry.getElementOrThrow(id).type === "group") {
        for (const child of [...registry.getChildrenOf(id)]) {
          registry.setParentGroup(child.id, null);
          child.visible = true;
          (child.container as { visible: boolean }).visible = true;
        }
      }
      registry.removeElement(id);
    };
    const doAddNode = () => {};
    const doAddGroup = (id: string, _opts: GroupOptions) => {
      registry.addElement(id, makeGroup(id));
    };
    const doAddEdge = () => {};

    const cmd = new DeleteCommand("g1", registry, sync, {
      doRemove,
      doAddNode,
      doAddGroup,
      doAddEdge,
    });
    history.execute(cmd);
    expect(registry.getElement("g1")).toBeUndefined();
    expect(registry.getElementOrThrow("n1").parentGroupId).toBeNull();

    history.undo();
    const restored = registry.getElementOrThrow("g1");
    const meta = restored.meta as GroupMeta;
    expect(meta.collapsed).toBe(true);
    expect(meta.expandedHeight).toBe(300);
    expect(restored.height).toBe(28);
    expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g1");
    expect(registry.getElementOrThrow("n2").parentGroupId).toBe("g1");
    expect(registry.getElementOrThrow("n1").visible).toBe(false);
    expect(registry.getElementOrThrow("n2").visible).toBe(false);
  });

  test("DeleteCommand redo: execute -> undo -> redo -> undo (2 cycles with edges)", () => {
    registry.addElement("g1", makeGroup("g1", { collapsed: true }));
    registry.addElement("n1", makeNode("n1"));
    registry.addElement("n2", makeNode("n2"));
    registry.setParentGroup("n1", "g1");
    registry.setParentGroup("n2", "g1");
    updateVisibility("g1", registry);

    const doRemove = (id: string) => {
      if (registry.getElementOrThrow(id).type === "group") {
        for (const child of [...registry.getChildrenOf(id)]) {
          registry.setParentGroup(child.id, null);
          child.visible = true;
          (child.container as { visible: boolean }).visible = true;
        }
      }
      registry.removeElement(id);
    };
    const doAddNode = () => {};
    const doAddGroup = (id: string, _opts: GroupOptions) => {
      registry.addElement(id, makeGroup(id));
    };
    const doAddEdge = () => {};

    const cmd = new DeleteCommand("g1", registry, sync, {
      doRemove,
      doAddNode,
      doAddGroup,
      doAddEdge,
    });

    // Cycle 1
    history.execute(cmd);
    expect(registry.getElement("g1")).toBeUndefined();
    history.undo();
    expect((registry.getElementOrThrow("g1").meta as GroupMeta).collapsed).toBe(true);
    expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g1");

    // Cycle 2
    history.redo();
    expect(registry.getElement("g1")).toBeUndefined();
    expect(registry.getElementOrThrow("n1").parentGroupId).toBeNull();
    history.undo();
    expect((registry.getElementOrThrow("g1").meta as GroupMeta).collapsed).toBe(true);
    expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g1");
    expect(registry.getElementOrThrow("n1").visible).toBe(false);
  });
});
