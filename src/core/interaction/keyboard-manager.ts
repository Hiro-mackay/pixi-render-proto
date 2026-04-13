export class KeyboardManager {
  private readonly abort = new AbortController();
  private _enabled = true;

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

  get enabled(): boolean { return this._enabled; }
  set enabled(v: boolean) { this._enabled = v; }

  destroy(): void {
    this.abort.abort();
  }

  private handleKey(e: KeyboardEvent): void {
    if (!this._enabled) return;
    if (isEditableTarget(e.target)) return;
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

function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
