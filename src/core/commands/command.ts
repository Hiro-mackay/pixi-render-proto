export interface Command {
  readonly type: string;
  execute(): void;
  undo(): void;
  merge?(other: Command): Command | null;
}

export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  execute(command: Command): void {
    command.execute();

    const prev = this.undoStack[this.undoStack.length - 1];
    if (prev?.merge) {
      const merged = prev.merge(command);
      if (merged) {
        this.undoStack[this.undoStack.length - 1] = merged;
        this.redoStack.length = 0;
        return;
      }
    }

    this.undoStack.push(command);
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
    const executed: Command[] = [];
    for (const cmd of commands) {
      cmd.execute();
      executed.push(cmd);
    }
    const batchCmd: Command = {
      type: "batch",
      execute() { for (const c of executed) c.execute(); },
      undo() { for (let i = executed.length - 1; i >= 0; i--) executed[i]!.undo(); },
    };
    this.undoStack.push(batchCmd);
    this.redoStack.length = 0;
  }

  record(command: Command): void {
    this.undoStack.push(command);
    this.redoStack.length = 0;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
