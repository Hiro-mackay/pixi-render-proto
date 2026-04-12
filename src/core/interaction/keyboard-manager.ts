export class KeyboardManager {
  private readonly abort = new AbortController();

  constructor(
    private readonly onDelete: () => void,
    private readonly onEscape: () => void,
    private readonly onUndo: () => void,
    private readonly onRedo: () => void,
  ) {
    window.addEventListener(
      "keydown",
      (e: KeyboardEvent) => this.handleKey(e),
      { signal: this.abort.signal },
    );
  }

  destroy(): void {
    this.abort.abort();
  }

  private handleKey(e: KeyboardEvent): void {
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.shiftKey && e.key === "z") {
      e.preventDefault();
      this.onRedo();
      return;
    }
    if (mod && e.key === "z") {
      e.preventDefault();
      this.onUndo();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      this.onDelete();
      return;
    }
    if (e.key === "Escape") {
      this.onEscape();
    }
  }
}
