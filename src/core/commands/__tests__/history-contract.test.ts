import { beforeEach, describe, expect, test } from "vitest";
import { ElementRegistry } from "../../registry/element-registry";
import { syncToContainer } from "../../registry/sync";
import { AssignCommand } from "../assign-command";
import type { Command } from "../command";
import { CommandHistory } from "../command";
import { DragCommand } from "../drag-command";
import { MoveCommand } from "../move-command";
import { ResizeCommand } from "../resize-command";
import { makeGroup, makeNode } from "./helpers";

const sync = syncToContainer;

type Snapshot = Record<
  string,
  { x: number; y: number; w: number; h: number; visible: boolean; parentGroupId: string | null }
>;

function snapshotRegistry(registry: ElementRegistry): Snapshot {
  const result: Snapshot = {};
  for (const [id, el] of registry.getAllElements()) {
    result[id] = {
      x: el.x,
      y: el.y,
      w: el.width,
      h: el.height,
      visible: el.visible,
      parentGroupId: el.parentGroupId,
    };
  }
  return result;
}

function assertContractHolds(
  registry: ElementRegistry,
  history: CommandHistory,
  command: Command,
  label: string,
): void {
  history.execute(command);
  const afterExecute = snapshotRegistry(registry);

  history.undo();
  const afterUndo = snapshotRegistry(registry);

  history.redo();
  const afterRedo = snapshotRegistry(registry);

  expect(afterRedo, `${label}: redo state should match execute state`).toEqual(afterExecute);

  history.undo();
  const afterSecondUndo = snapshotRegistry(registry);
  expect(afterSecondUndo, `${label}: second undo should match first undo`).toEqual(afterUndo);
}

describe("History contract: execute → undo → redo round-trip", () => {
  let registry: ElementRegistry;
  let history: CommandHistory;

  beforeEach(() => {
    registry = new ElementRegistry();
    history = new CommandHistory();
  });

  test("MoveCommand satisfies round-trip contract", () => {
    registry.addElement("n1", makeNode("n1"));
    assertContractHolds(
      registry,
      history,
      new MoveCommand("n1", registry, 300, 400, sync, "s1"),
      "MoveCommand",
    );
  });

  test("ResizeCommand satisfies round-trip contract", () => {
    registry.addElement("n1", makeNode("n1"));
    assertContractHolds(
      registry,
      history,
      new ResizeCommand({
        elementId: "n1",
        registry,
        sync,
        sessionId: "s1",
        target: { x: 100, y: 200, width: 200, height: 100 },
      }),
      "ResizeCommand",
    );
  });

  test("AssignCommand satisfies round-trip contract", () => {
    registry.addElement("g1", makeGroup("g1"));
    registry.addElement("n1", makeNode("n1"));
    assertContractHolds(
      registry,
      history,
      new AssignCommand("n1", "g1", registry, sync),
      "AssignCommand",
    );
  });

  test("AssignCommand (remove) satisfies round-trip contract", () => {
    registry.addElement("g1", makeGroup("g1"));
    registry.addElement("n1", makeNode("n1"));
    registry.setParentGroup("n1", "g1");
    assertContractHolds(
      registry,
      history,
      new AssignCommand("n1", null, registry, sync),
      "AssignCommand(remove)",
    );
  });

  test("DragCommand satisfies round-trip contract", () => {
    registry.addElement("n1", makeNode("n1"));
    const startPositions = new Map([["n1", { x: 100, y: 200 }]]);
    const finalPositions = new Map([["n1", { x: 300, y: 400 }]]);
    assertContractHolds(
      registry,
      history,
      new DragCommand("n1", registry, startPositions, finalPositions, sync, "s1", null, null),
      "DragCommand",
    );
  });

  test("DragCommand with reparent satisfies round-trip contract", () => {
    registry.addElement("g1", makeGroup("g1"));
    registry.addElement("n1", makeNode("n1"));
    const startPositions = new Map([["n1", { x: 100, y: 200 }]]);
    const finalPositions = new Map([["n1", { x: 50, y: 80 }]]);
    assertContractHolds(
      registry,
      history,
      new DragCommand("n1", registry, startPositions, finalPositions, sync, "s1", null, "g1"),
      "DragCommand(reparent)",
    );
  });

  test("DragCommand with group and descendants satisfies round-trip contract", () => {
    registry.addElement("g1", makeGroup("g1"));
    const n1 = makeNode("n1", 50, 60);
    registry.addElement("n1", n1);
    registry.setParentGroup("n1", "g1");
    const startPositions = new Map([
      ["g1", { x: 0, y: 0 }],
      ["n1", { x: 50, y: 60 }],
    ]);
    const finalPositions = new Map([
      ["g1", { x: 100, y: 100 }],
      ["n1", { x: 150, y: 160 }],
    ]);
    assertContractHolds(
      registry,
      history,
      new DragCommand("g1", registry, startPositions, finalPositions, sync, "s1", null, null),
      "DragCommand(group+descendants)",
    );
  });
});
