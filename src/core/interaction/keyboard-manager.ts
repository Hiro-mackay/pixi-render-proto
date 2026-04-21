export interface KeyboardCallbacks {
  readonly onDelete: () => void;
  readonly onEscape: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onCopy: () => void;
  readonly onPaste: () => void;
  readonly onDuplicate: () => void;
  readonly onSelectAll: () => void;
  readonly onToggleEdgeLock: () => void;
}

export class KeyboardManager {
  private readonly abort = new AbortController();
  private _enabled = true;

  constructor(private readonly cb: KeyboardCallbacks) {
    window.addEventListener("keydown", (e: KeyboardEvent) => this.handleKey(e), {
      signal: this.abort.signal,
    });
  }

  get enabled(): boolean {
    return this._enabled;
  }
  set enabled(v: boolean) {
    this._enabled = v;
  }

  destroy(): void {
    this.abort.abort();
  }

  private handleKey(e: KeyboardEvent): void {
    if (!this._enabled) return;
    if (isEditableTarget(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;

    if (mod && e.shiftKey && e.key === "z") {
      e.preventDefault();
      this.cb.onRedo();
      return;
    }
    if (mod && e.key === "z") {
      e.preventDefault();
      this.cb.onUndo();
      return;
    }
    if (mod && e.key === "c") {
      e.preventDefault();
      this.cb.onCopy();
      return;
    }
    if (mod && e.key === "v") {
      e.preventDefault();
      this.cb.onPaste();
      return;
    }
    if (mod && e.key === "d") {
      e.preventDefault();
      this.cb.onDuplicate();
      return;
    }
    if (mod && e.key === "a") {
      e.preventDefault();
      this.cb.onSelectAll();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      this.cb.onDelete();
      return;
    }
    if (!mod && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      this.cb.onToggleEdgeLock();
      return;
    }
    if (e.key === "Escape") {
      this.cb.onEscape();
    }
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}
