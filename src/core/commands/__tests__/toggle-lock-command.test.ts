import { describe, expect, test } from "vitest";
import { ToggleNodeEdgeLockCommand } from "../toggle-lock-command";
import { makeEdge, makeNode, makeRegistry } from "./helpers";

describe("ToggleNodeEdgeLockCommand", () => {
  function setup() {
    // n1 at (0, 0), n2 to the right, n3 below — fixed positions so facingSide is deterministic.
    const n1 = makeNode("n1", 0, 0);
    const n2 = makeNode("n2", 400, 0);
    const n3 = makeNode("n3", 0, 400);
    const registry = makeRegistry(n1, n2, n3);
    // Seed edges with stored sides that DO NOT match facingSide — the lock command
    // should overwrite them with facingSide values on execute.
    registry.addEdge("e1", makeEdge("e1", "n1", "n2", { sourceSide: "top", targetSide: "bottom" }));
    registry.addEdge("e2", makeEdge("e2", "n1", "n3", { sourceSide: "left", targetSide: "right" }));
    return registry;
  }

  test("lock sets edgeSidesLocked on the node", () => {
    const registry = setup();
    const cmd = new ToggleNodeEdgeLockCommand("n1", registry);

    cmd.execute();

    expect(registry.getElementOrThrow("n1").edgeSidesLocked).toBe(true);
  });

  test("lock snapshots current facingSide values into connected edges", () => {
    const registry = setup();
    const cmd = new ToggleNodeEdgeLockCommand("n1", registry);

    cmd.execute();

    // n1 → n2 (right-ward): source side becomes "right"
    expect(registry.getEdgeOrThrow("e1").sourceSide).toBe("right");
    // n1 → n3 (downward): source side becomes "bottom"
    expect(registry.getEdgeOrThrow("e2").sourceSide).toBe("bottom");
    // target sides unchanged (target nodes were not locked)
    expect(registry.getEdgeOrThrow("e1").targetSide).toBe("bottom");
    expect(registry.getEdgeOrThrow("e2").targetSide).toBe("right");
  });

  test("undo after lock restores both lock flag and edge sides", () => {
    const registry = setup();
    const cmd = new ToggleNodeEdgeLockCommand("n1", registry);

    cmd.execute();
    cmd.undo();

    expect(registry.getElementOrThrow("n1").edgeSidesLocked).toBe(false);
    expect(registry.getEdgeOrThrow("e1").sourceSide).toBe("top");
    expect(registry.getEdgeOrThrow("e2").sourceSide).toBe("left");
  });

  test("unlock clears edgeSidesLocked without touching edge sides", () => {
    const registry = setup();
    registry.getElementOrThrow("n1").edgeSidesLocked = true;
    const cmd = new ToggleNodeEdgeLockCommand("n1", registry);

    cmd.execute();

    expect(registry.getElementOrThrow("n1").edgeSidesLocked).toBe(false);
    // Edge sides were the pre-existing stored values and should be untouched.
    expect(registry.getEdgeOrThrow("e1").sourceSide).toBe("top");
    expect(registry.getEdgeOrThrow("e2").sourceSide).toBe("left");
  });

  test("undo after unlock re-locks the node", () => {
    const registry = setup();
    registry.getElementOrThrow("n1").edgeSidesLocked = true;
    const cmd = new ToggleNodeEdgeLockCommand("n1", registry);

    cmd.execute();
    cmd.undo();

    expect(registry.getElementOrThrow("n1").edgeSidesLocked).toBe(true);
  });

  test("locking a target-end node snapshots the target side", () => {
    const registry = setup();
    // Lock n2 (target of e1). facingSide(n2, srcCenter) should be "left" since n1 is on its left.
    const cmd = new ToggleNodeEdgeLockCommand("n2", registry);

    cmd.execute();

    expect(registry.getElementOrThrow("n2").edgeSidesLocked).toBe(true);
    expect(registry.getEdgeOrThrow("e1").targetSide).toBe("left");
    // Source side of e1 was not captured (n1 not locked) — retains its original.
    expect(registry.getEdgeOrThrow("e1").sourceSide).toBe("top");
  });

  test("redo (re-execute) produces the same locked state", () => {
    const registry = setup();
    const cmd = new ToggleNodeEdgeLockCommand("n1", registry);

    cmd.execute();
    cmd.undo();
    cmd.execute();

    expect(registry.getElementOrThrow("n1").edgeSidesLocked).toBe(true);
    expect(registry.getEdgeOrThrow("e1").sourceSide).toBe("right");
    expect(registry.getEdgeOrThrow("e2").sourceSide).toBe("bottom");
  });
});
