import { describe, test, expect, vi, beforeEach } from "vitest";
import { DeleteCommand } from "../delete-command";
import { ElementRegistry } from "../../registry/element-registry";
import { syncToContainer } from "../../registry/sync";
import { updateVisibility } from "../../hierarchy/group-ops";
import type { GroupMeta, NodeOptions, EdgeOptions } from "../../types";
import { makeNode, makeGroup, makeEdge } from "./helpers";

describe("DeleteCommand", () => {
  let registry: ElementRegistry;
  const sync = syncToContainer;
  let doRemove: ReturnType<typeof vi.fn<(id: string) => void>>;
  let doAddNode: ReturnType<typeof vi.fn<(id: string, opts: NodeOptions) => void>>;
  let doAddGroup: ReturnType<typeof vi.fn<(id: string, opts: unknown) => void>>;
  let doAddEdge: ReturnType<typeof vi.fn<(id: string, opts: EdgeOptions) => void>>;

  beforeEach(() => {
    registry = new ElementRegistry();
    doRemove = vi.fn<(id: string) => void>((id) => {
      for (const edge of registry.getEdgesForNode(id)) registry.removeEdge(edge.id);
      registry.removeElement(id);
    });
    doAddNode = vi.fn<(id: string, opts: NodeOptions) => void>();
    doAddGroup = vi.fn<(id: string, opts: unknown) => void>();
    doAddEdge = vi.fn<(id: string, opts: EdgeOptions) => void>();
  });

  test("should call doRemove on execute", () => {
    registry.addElement("n1", makeNode("n1"));
    const cmd = new DeleteCommand("n1", registry, sync, { doRemove, doAddNode, doAddGroup, doAddEdge });
    cmd.execute();
    expect(doRemove).toHaveBeenCalledWith("n1");
  });

  test("should call doAddNode on undo for a node", () => {
    const n1 = makeNode("n1", 50, 60);
    registry.addElement("n1", n1);
    const cmd = new DeleteCommand("n1", registry, sync, { doRemove, doAddNode, doAddGroup, doAddEdge });
    cmd.execute();
    cmd.undo();
    expect(doAddNode).toHaveBeenCalledOnce();
    const [id, opts] = doAddNode.mock.calls[0]!;
    expect(id).toBe("n1");
    expect((opts as NodeOptions).x).toBe(50);
  });

  test("should restore edges on undo", () => {
    registry.addElement("n1", makeNode("n1"));
    registry.addElement("n2", makeNode("n2"));
    registry.addEdge("e1", makeEdge("e1", "n1", "n2"));

    const reAddNode = vi.fn<(id: string, opts: NodeOptions) => void>((id) => {
      registry.addElement(id, makeNode(id));
    });
    const cmd = new DeleteCommand("n1", registry, sync, { doRemove, doAddNode: reAddNode, doAddGroup, doAddEdge });
    cmd.execute();
    cmd.undo();
    expect(doAddEdge).toHaveBeenCalledOnce();
    expect(doAddEdge.mock.calls[0]![0]).toBe("e1");
  });

  test("should restore parentGroupId on undo", () => {
    registry.addElement("g1", makeGroup("g1"));
    registry.addElement("n1", makeNode("n1"));
    registry.setParentGroup("n1", "g1");

    const reAddNode = vi.fn<(id: string, opts: NodeOptions) => void>(() => {
      registry.addElement("n1", makeNode("n1"));
    });
    const cmd = new DeleteCommand("n1", registry, sync, { doRemove, doAddNode: reAddNode, doAddGroup, doAddEdge });
    cmd.execute();
    cmd.undo();
    expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g1");
  });

  test("should restore children membership when undoing group deletion", () => {
    registry.addElement("g1", makeGroup("g1"));
    registry.addElement("n1", makeNode("n1"));
    registry.addElement("n2", makeNode("n2"));
    registry.setParentGroup("n1", "g1");
    registry.setParentGroup("n2", "g1");

    const engineRemove = vi.fn<(id: string) => void>((id) => {
      for (const child of [...registry.getChildrenOf(id)]) {
        registry.setParentGroup(child.id, null);
      }
      for (const edge of registry.getEdgesForNode(id)) registry.removeEdge(edge.id);
      registry.removeElement(id);
    });
    const engineAddGroup = vi.fn<(id: string, opts: unknown) => void>(() => {
      registry.addElement("g1", makeGroup("g1"));
    });
    const cmd = new DeleteCommand("g1", registry, sync, { doRemove: engineRemove, doAddNode, doAddGroup: engineAddGroup, doAddEdge });
    cmd.execute();
    cmd.undo();

    expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g1");
    expect(registry.getElementOrThrow("n2").parentGroupId).toBe("g1");
  });

  test("should restore collapsed and expandedHeight on group undo", () => {
    const g1 = makeGroup("g1", { collapsed: true });
    registry.addElement("g1", g1);

    const engineRemove = vi.fn<(id: string) => void>((id) => {
      for (const edge of registry.getEdgesForNode(id)) registry.removeEdge(edge.id);
      registry.removeElement(id);
    });
    const engineAddGroup = vi.fn<(id: string, opts: unknown) => void>(() => {
      registry.addElement("g1", makeGroup("g1"));
    });
    const cmd = new DeleteCommand("g1", registry, sync, { doRemove: engineRemove, doAddNode, doAddGroup: engineAddGroup, doAddEdge });
    cmd.execute();
    cmd.undo();

    const restored = registry.getElementOrThrow("g1");
    const meta = restored.meta as GroupMeta;
    expect(meta.collapsed).toBe(true);
    expect(meta.expandedHeight).toBe(300);
    expect(restored.height).toBe(28);
  });

  test("should restore visibility when undoing deletion from collapsed group", () => {
    registry.addElement("g1", makeGroup("g1", { collapsed: true }));
    registry.addElement("n1", makeNode("n1"));
    registry.setParentGroup("n1", "g1");
    updateVisibility("g1", registry);

    const engineRemoveNode = vi.fn<(id: string) => void>((id) => {
      for (const edge of registry.getEdgesForNode(id)) registry.removeEdge(edge.id);
      registry.removeElement(id);
    });
    const engineAddNode = vi.fn<(id: string, opts: NodeOptions) => void>(() => {
      registry.addElement("n1", makeNode("n1"));
    });
    const cmd = new DeleteCommand("n1", registry, sync, { doRemove: engineRemoveNode, doAddNode: engineAddNode, doAddGroup, doAddEdge });
    cmd.execute();
    cmd.undo();

    expect(registry.getElementOrThrow("n1").parentGroupId).toBe("g1");
    expect(registry.getElementOrThrow("n1").visible).toBe(false);
  });
});
