import { describe, test, expect, beforeEach } from "vitest";
import { Container } from "pixi.js";
import { EdgeCreator, type EdgeCreatedEvent } from "../edge-creator";
import { ElementRegistry } from "../../registry/element-registry";
import type { CanvasElement } from "../../types";
import type { Viewport } from "pixi-viewport";

type MockViewport = Pick<Viewport, "pause" | "toWorld" | "on" | "off" | "addChild">;

function makeNode(id: string, x = 100, y = 100, w = 140, h = 68): CanvasElement {
  return {
    id, type: "node", x, y, width: w, height: h,
    visible: true, parentGroupId: null,
    container: new Container(),
    meta: { label: id, color: 0x2d3748 },
  };
}

function createMockViewport(): MockViewport {
  const vp = new Container() as unknown as MockViewport;
  (vp as { pause: boolean }).pause = false;
  (vp as { toWorld: (sx: number, sy: number) => { x: number; y: number } }).toWorld =
    (sx: number, sy: number) => ({ x: sx, y: sy });
  return vp;
}

describe("EdgeCreator", () => {
  let registry: ElementRegistry;
  let ghostLayer: Container;
  let viewport: MockViewport;
  let onEdgeCreated: (event: EdgeCreatedEvent) => void;
  let onEdgeCreatedCalls: EdgeCreatedEvent[];
  let edgeCreator: EdgeCreator;

  beforeEach(() => {
    registry = new ElementRegistry();
    registry.addElement("n1", makeNode("n1", 0, 0, 140, 68));
    registry.addElement("n2", makeNode("n2", 300, 0, 140, 68));
    ghostLayer = new Container();
    viewport = createMockViewport();
    onEdgeCreatedCalls = [];
    onEdgeCreated = (event: EdgeCreatedEvent) => { onEdgeCreatedCalls.push(event); };
    edgeCreator = new EdgeCreator(
      ghostLayer, viewport as unknown as Viewport, registry, () => 1,
      onEdgeCreated,
    );
  });

  test("should not be active initially", () => {
    expect(edgeCreator.isActive()).toBe(false);
  });

  test("should be active after start", () => {
    edgeCreator.start("n1", "right", 140, 34);
    expect(edgeCreator.isActive()).toBe(true);
    expect(viewport.pause).toBe(true);
  });

  test("should not be active after cancel", () => {
    edgeCreator.start("n1", "right", 140, 34);
    edgeCreator.cancel();
    expect(edgeCreator.isActive()).toBe(false);
    expect(viewport.pause).toBe(false);
  });

  test("should not be active after finishAt", () => {
    edgeCreator.start("n1", "right", 140, 34);
    // Finish at a position over n2 (toWorld is identity)
    edgeCreator.finishAt(350, 34);
    expect(edgeCreator.isActive()).toBe(false);
  });

  test("should call onEdgeCreated when finishing on a valid target", () => {
    edgeCreator.start("n1", "right", 140, 34);
    edgeCreator.finishAt(350, 34);
    expect(onEdgeCreatedCalls).toHaveLength(1);
    expect(onEdgeCreatedCalls[0]).toMatchObject({
      sourceId: "n1",
      sourceSide: "right",
      targetId: "n2",
    });
  });

  test("should not call onEdgeCreated when finishing on empty space", () => {
    edgeCreator.start("n1", "right", 140, 34);
    edgeCreator.finishAt(900, 900);
    expect(onEdgeCreatedCalls).toHaveLength(0);
  });

  test("should not call onEdgeCreated when finishing on the source node (self-loop)", () => {
    edgeCreator.start("n1", "right", 140, 34);
    edgeCreator.finishAt(70, 34);
    expect(onEdgeCreatedCalls).toHaveLength(0);
  });

  test("should clean up on destroy", () => {
    edgeCreator.start("n1", "right", 140, 34);
    edgeCreator.destroy();
    expect(edgeCreator.isActive()).toBe(false);
  });
});
