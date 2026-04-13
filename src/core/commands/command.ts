export type CommandType =
  | "move" | "resize" | "drag"
  | "assign" | "delete"
  | "add-remove" | "edge"
  | "batch";

export interface Command {
  readonly type: CommandType;
  /** Must be idempotent — redo calls execute() again on the same instance. */
  execute(): void;
  undo(): void;
  merge?(other: Command): Command | null;
}

const DEFAULT_MAX_HISTORY = 200;

export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private readonly maxSize: number;

  constructor(maxSize = DEFAULT_MAX_HISTORY) {
    this.maxSize = maxSize;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  execute(command: Command): void {
    command.execute();

    const prev = this.undoStack[this.undoStack.length - 1];
    if (prev) {
      const merged = prev.merge?.(command) ?? null;
      if (merged) {
        this.undoStack[this.undoStack.length - 1] = merged;
        this.redoStack.length = 0;
        return;
      }
    }

    this.undoStack.push(command);
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.splice(0, this.undoStack.length - this.maxSize);
    }
    this.redoStack.length = 0;
  }

  undo(): void {
    const command = this.undoStack.pop();
    if (!command) return;
    command.undo();
    this.redoStack.push(command);
  }

  redo(): void {
    const command = this.redoStack.pop();
    if (!command) return;
    command.execute();
    this.undoStack.push(command);
  }

  batch(commands: readonly Command[]): void {
    if (commands.length === 0) return;
    const batchCmd: Command = {
      type: "batch",
      execute() { for (const c of commands) c.execute(); },
      undo() { for (let i = commands.length - 1; i >= 0; i--) commands[i]!.undo(); },
    };
    this.execute(batchCmd);
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
