import { describe, test, expect, beforeEach, vi } from "vitest";
import { CommandHistory, type Command } from "../command";
import { CommandExecutionError } from "../../errors";

function makeCommand(): Command {
  return { type: "move", execute: vi.fn(), undo: vi.fn() };
}

function makeMergeableCommand(
  sessionId: string,
): Command & { execute: ReturnType<typeof vi.fn>; undo: ReturnType<typeof vi.fn> } {
  return {
    type: "move",
    execute: vi.fn(),
    undo: vi.fn(),
    merge(other: Command) {
      const o = other as { sessionId?: string };
      if (o.sessionId === sessionId) return other;
      return null;
    },
    sessionId,
  } as Command & { execute: ReturnType<typeof vi.fn>; undo: ReturnType<typeof vi.fn>; sessionId: string };
}

describe("CommandHistory", () => {
  let history: CommandHistory;

  beforeEach(() => {
    history = new CommandHistory();
  });

  describe("executing commands", () => {
    test("should execute the command immediately", () => {
      const cmd = makeCommand();
      history.execute(cmd);
      expect(cmd.execute).toHaveBeenCalledOnce();
    });

    test("should allow undo after execution", () => {
      expect(history.canUndo).toBe(false);
      history.execute(makeCommand());
      expect(history.canUndo).toBe(true);
    });
  });

  describe("undo reverses the last operation", () => {
    test("should call undo on the last executed command", () => {
      const cmd = makeCommand();
      history.execute(cmd);
      history.undo();
      expect(cmd.undo).toHaveBeenCalledOnce();
    });

    test("should undo commands in reverse order", () => {
      const order: string[] = [];
      const cmd1: Command = { type: "move", execute() {}, undo() { order.push("a"); } };
      const cmd2: Command = { type: "resize", execute() {}, undo() { order.push("b"); } };
      history.execute(cmd1);
      history.execute(cmd2);
      history.undo();
      history.undo();
      expect(order).toEqual(["b", "a"]);
    });

    test("should do nothing when there is nothing to undo", () => {
      expect(() => history.undo()).not.toThrow();
    });
  });

  describe("redo re-applies undone operations", () => {
    test("should re-execute an undone command", () => {
      const cmd = makeCommand();
      history.execute(cmd);
      history.undo();
      history.redo();
      expect(cmd.execute).toHaveBeenCalledTimes(2);
    });

    test("should discard redo stack when a new command is executed after undo", () => {
      const cmd1 = makeCommand();
      const cmd2 = makeCommand();
      history.execute(cmd1);
      history.undo();
      history.execute(cmd2);
      expect(history.canRedo).toBe(false);
    });

    test("should do nothing when there is nothing to redo", () => {
      expect(() => history.redo()).not.toThrow();
    });
  });

  describe("merge collapses continuous drags into one undo step", () => {
    test("should merge commands with the same session", () => {
      const cmd1 = makeMergeableCommand("drag-1");
      const cmd2 = makeMergeableCommand("drag-1");
      history.execute(cmd1);
      history.execute(cmd2);

      // Only one undo step should exist
      history.undo();
      expect(history.canUndo).toBe(false);
    });

    test("should not merge commands with different sessions", () => {
      const cmd1 = makeMergeableCommand("drag-1");
      const cmd2 = makeMergeableCommand("drag-2");
      history.execute(cmd1);
      history.execute(cmd2);

      history.undo();
      expect(history.canUndo).toBe(true);
    });
  });

  describe("batch groups multiple commands as one undo unit", () => {
    test("should undo all batched commands together", () => {
      let value = 0;
      const inc: Command = { type: "move", execute() { value++; }, undo() { value--; } };
      const dbl: Command = { type: "resize", execute() { value *= 2; }, undo() { value /= 2; } };

      history.batch([inc, inc, dbl]);
      expect(value).toBe(4); // 0+1+1 = 2, *2 = 4

      history.undo();
      expect(value).toBe(0);
      expect(history.canUndo).toBe(false);
    });
  });

  describe("clear resets all history", () => {
    test("should remove all undo and redo entries", () => {
      history.execute(makeCommand());
      history.execute(makeCommand());
      history.undo();
      history.clear();
      expect(history.canUndo).toBe(false);
      expect(history.canRedo).toBe(false);
    });
  });

  describe("error safety", () => {
    test("should not push to undo stack when execute throws", () => {
      const failing: Command = {
        type: "move",
        execute() { throw new Error("execute failed"); },
        undo: vi.fn(),
      };
      expect(() => history.execute(failing)).toThrow("execute failed");
      expect(history.canUndo).toBe(false);
    });

    test("should not clear redo stack when execute throws", () => {
      const cmd = makeCommand();
      history.execute(cmd);
      history.undo();
      expect(history.canRedo).toBe(true);

      const failing: Command = {
        type: "move",
        execute() { throw new Error("boom"); },
        undo: vi.fn(),
      };
      expect(() => history.execute(failing)).toThrow();
      expect(history.canRedo).toBe(true);
    });

    test("should wrap thrown error in CommandExecutionError", () => {
      const cause = new Error("root");
      const failing: Command = {
        type: "move",
        execute() { throw cause; },
        undo: vi.fn(),
      };
      try {
        history.execute(failing);
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(CommandExecutionError);
        expect((err as CommandExecutionError).cause).toBe(cause);
      }
    });

    test("should roll back partial batch when a sub-command fails", () => {
      let value = 0;
      const inc: Command = { type: "move", execute() { value++; }, undo() { value--; } };
      const fail: Command = { type: "move", execute() { throw new Error("fail"); }, undo: vi.fn() };

      expect(() => history.batch([inc, inc, fail])).toThrow(CommandExecutionError);
      expect(value).toBe(0); // rolled back
      expect(history.canUndo).toBe(false);
    });
  });
});
