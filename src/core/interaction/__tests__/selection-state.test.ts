import { Container, Graphics } from "pixi.js";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ElementRegistry } from "../../registry/element-registry";
import type { CanvasEdge, CanvasElement, Redrawable } from "../../types";
import { SelectionState } from "../selection-state";

function makeNode(id: string): CanvasElement {
  const container = new Container();
  container.label = id;
  const ports = new Container();
  ports.label = "ports";
  ports.visible = false;
  container.addChild(ports);
  return {
    id,
    type: "node",
    x: 100,
    y: 100,
    width: 140,
    height: 68,
    visible: true,
    parentGroupId: null,
    container,
    meta: { label: id, color: 0x2d3748 },
  };
}

describe("SelectionState", () => {
  let registry: ElementRegistry;
  let selectionLayer: Container;
  let selection: SelectionState;

  beforeEach(() => {
    registry = new ElementRegistry();
    selectionLayer = new Container();
    selection = new SelectionState(selectionLayer, registry, () => 1);
  });

  test("should have no selection initially", () => {
    expect(selection.getSelectedId()).toBeNull();
  });

  test("should select an element", () => {
    const node = makeNode("n1");
    registry.addElement("n1", node);

    selection.select("n1");
    expect(selection.getSelectedId()).toBe("n1");
  });

  test("should clear selection", () => {
    const node = makeNode("n1");
    registry.addElement("n1", node);

    selection.select("n1");
    selection.clear();
    expect(selection.getSelectedId()).toBeNull();
  });

  test("should replace selection when selecting different element", () => {
    const n1 = makeNode("n1");
    const n2 = makeNode("n2");
    registry.addElement("n1", n1);
    registry.addElement("n2", n2);

    selection.select("n1");
    selection.select("n2");
    expect(selection.getSelectedId()).toBe("n2");
  });

  test("should not re-select same element", () => {
    const node = makeNode("n1");
    registry.addElement("n1", node);

    selection.select("n1");
    const childCountAfterFirst = selectionLayer.children.length;
    selection.select("n1");
    expect(selectionLayer.children.length).toBe(childCountAfterFirst);
  });

  test("should track resizing state", () => {
    expect(selection.isResizing()).toBe(false);
    selection.setResizing(true);
    expect(selection.isResizing()).toBe(true);
    selection.setResizing(false);
    expect(selection.isResizing()).toBe(false);
  });

  test("should show ports on select and hide on clear", () => {
    const node = makeNode("n1");
    registry.addElement("n1", node);

    const ports = node.container.children.find((c) => c.label === "ports");

    selection.select("n1");
    expect(ports?.visible).toBe(true);

    selection.clear();
    expect(ports?.visible).toBe(false);
  });

  test("should fire onHandlesCreated with 8 handles when selecting", () => {
    const node = makeNode("n1");
    registry.addElement("n1", node);

    const callback = vi.fn();
    const selectionWithCallback = new SelectionState(selectionLayer, registry, () => 1, callback);

    selectionWithCallback.select("n1");
    expect(callback).toHaveBeenCalledOnce();
    const handles = callback.mock.calls[0]![0] as unknown[];
    expect(handles).toHaveLength(8);
  });

  test("should clean up on destroy", () => {
    const node = makeNode("n1");
    registry.addElement("n1", node);

    selection.select("n1");
    selection.destroy();
    expect(selection.getSelectedId()).toBeNull();
  });

  describe("multi-select", () => {
    test("should select multiple elements with selectMultiple", () => {
      const n1 = makeNode("n1");
      const n2 = makeNode("n2");
      registry.addElement("n1", n1);
      registry.addElement("n2", n2);

      selection.selectMultiple(["n1", "n2"]);
      expect(selection.getSelectedIds().size).toBe(2);
      expect(selection.isSelected("n1")).toBe(true);
      expect(selection.isSelected("n2")).toBe(true);
    });

    test("should return null from getSelectedId when multi-selected", () => {
      const n1 = makeNode("n1");
      const n2 = makeNode("n2");
      registry.addElement("n1", n1);
      registry.addElement("n2", n2);

      selection.selectMultiple(["n1", "n2"]);
      expect(selection.getSelectedId()).toBeNull();
    });

    test("should toggle adds and removes from selection", () => {
      const n1 = makeNode("n1");
      const n2 = makeNode("n2");
      registry.addElement("n1", n1);
      registry.addElement("n2", n2);

      selection.select("n1");
      selection.toggle("n2");
      expect(selection.getSelectedIds().size).toBe(2);

      selection.toggle("n1");
      expect(selection.getSelectedIds().size).toBe(1);
      expect(selection.isSelected("n2")).toBe(true);
      expect(selection.isSelected("n1")).toBe(false);
    });

    test("should not fire onHandlesCreated when multi-selected", () => {
      const n1 = makeNode("n1");
      const n2 = makeNode("n2");
      registry.addElement("n1", n1);
      registry.addElement("n2", n2);

      const callback = vi.fn();
      const sel = new SelectionState(selectionLayer, registry, () => 1, callback);

      sel.selectMultiple(["n1", "n2"]);
      expect(callback).not.toHaveBeenCalled();
    });

    test("should hide ports in multi-select", () => {
      const n1 = makeNode("n1");
      const n2 = makeNode("n2");
      registry.addElement("n1", n1);
      registry.addElement("n2", n2);

      selection.selectMultiple(["n1", "n2"]);

      const ports1 = n1.container.children.find((c) => c.label === "ports");
      const ports2 = n2.container.children.find((c) => c.label === "ports");
      expect(ports1?.visible).toBe(false);
      expect(ports2?.visible).toBe(false);
    });

    test("should show handles when toggle reduces to single selection", () => {
      const n1 = makeNode("n1");
      const n2 = makeNode("n2");
      registry.addElement("n1", n1);
      registry.addElement("n2", n2);

      const callback = vi.fn();
      const sel = new SelectionState(selectionLayer, registry, () => 1, callback);

      sel.selectMultiple(["n1", "n2"]);
      expect(callback).not.toHaveBeenCalled();

      sel.toggle("n1");
      expect(callback).toHaveBeenCalledOnce();
      expect(sel.getSelectedId()).toBe("n2");
    });

    test("should clear all multi-selection on clear()", () => {
      const n1 = makeNode("n1");
      const n2 = makeNode("n2");
      registry.addElement("n1", n1);
      registry.addElement("n2", n2);

      selection.selectMultiple(["n1", "n2"]);
      selection.clear();
      expect(selection.getSelectedIds().size).toBe(0);
    });

    test("should clear multi-selection when selecting a single element", () => {
      const n1 = makeNode("n1");
      const n2 = makeNode("n2");
      const n3 = makeNode("n3");
      registry.addElement("n1", n1);
      registry.addElement("n2", n2);
      registry.addElement("n3", n3);

      selection.selectMultiple(["n1", "n2"]);
      selection.select("n3");
      expect(selection.getSelectedIds().size).toBe(1);
      expect(selection.getSelectedId()).toBe("n3");
    });
  });

  describe("edge selection", () => {
    function makeEdge(id: string): CanvasEdge {
      return {
        id,
        sourceId: "n1",
        sourceSide: "right",
        sourceSidePinned: false,
        targetId: "n2",
        targetSide: "left",
        label: null,
        labelColor: null,
        line: new Graphics() as Redrawable,
        hitLine: new Graphics(),
        labelPill: null,
        labelText: null,
        selected: false,
      };
    }

    test("should have no edge selection initially", () => {
      expect(selection.getSelectedEdgeId()).toBeNull();
    });

    test("should select an edge", () => {
      const n1 = makeNode("n1");
      const n2 = makeNode("n2");
      registry.addElement("n1", n1);
      registry.addElement("n2", n2);
      const edge = makeEdge("e1");
      registry.addEdge("e1", edge);

      selection.selectEdge("e1");

      expect(selection.getSelectedEdgeId()).toBe("e1");
      expect(edge.selected).toBe(true);
    });

    test("should clear element selection when selecting an edge", () => {
      const n1 = makeNode("n1");
      const n2 = makeNode("n2");
      registry.addElement("n1", n1);
      registry.addElement("n2", n2);
      const edge = makeEdge("e1");
      registry.addEdge("e1", edge);

      selection.select("n1");
      selection.selectEdge("e1");

      expect(selection.getSelectedId()).toBeNull();
      expect(selection.getSelectedEdgeId()).toBe("e1");
    });

    test("should clear edge selection when selecting an element", () => {
      const n1 = makeNode("n1");
      const n2 = makeNode("n2");
      registry.addElement("n1", n1);
      registry.addElement("n2", n2);
      const edge = makeEdge("e1");
      registry.addEdge("e1", edge);

      selection.selectEdge("e1");
      selection.select("n1");

      expect(selection.getSelectedEdgeId()).toBeNull();
      expect(edge.selected).toBe(false);
      expect(selection.getSelectedId()).toBe("n1");
    });

    test("should clear edge selection on clear()", () => {
      const n1 = makeNode("n1");
      const n2 = makeNode("n2");
      registry.addElement("n1", n1);
      registry.addElement("n2", n2);
      const edge = makeEdge("e1");
      registry.addEdge("e1", edge);

      selection.selectEdge("e1");
      selection.clear();

      expect(selection.getSelectedEdgeId()).toBeNull();
      expect(edge.selected).toBe(false);
    });

    test("should not re-select same edge", () => {
      const n1 = makeNode("n1");
      const n2 = makeNode("n2");
      registry.addElement("n1", n1);
      registry.addElement("n2", n2);
      const edge = makeEdge("e1");
      registry.addEdge("e1", edge);

      selection.selectEdge("e1");
      selection.selectEdge("e1");

      expect(selection.getSelectedEdgeId()).toBe("e1");
    });
  });
});
