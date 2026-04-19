import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { KeyboardManager } from "../keyboard-manager";

type Listener = (e: KeyboardEvent) => void;
let activeListeners: Array<{ handler: Listener; signal?: AbortSignal }> = [];

vi.stubGlobal("window", {
  addEventListener: (_event: string, handler: Listener, opts?: { signal?: AbortSignal }) => {
    const entry = { handler, signal: opts?.signal };
    activeListeners.push(entry);
    if (opts?.signal) {
      opts.signal.addEventListener("abort", () => {
        activeListeners = activeListeners.filter((e) => e !== entry);
      });
    }
  },
  removeEventListener: () => {},
});

function dispatch(
  key: string,
  opts: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {},
): { preventDefault: ReturnType<typeof vi.fn> } {
  const preventDefault = vi.fn();
  const event = {
    key,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: opts.metaKey ?? false,
    shiftKey: opts.shiftKey ?? false,
    preventDefault,
  } as unknown as KeyboardEvent;
  for (const entry of [...activeListeners]) entry.handler(event);
  return { preventDefault };
}

function createCallbacks() {
  return {
    onDelete: vi.fn<() => void>(),
    onEscape: vi.fn<() => void>(),
    onUndo: vi.fn<() => void>(),
    onRedo: vi.fn<() => void>(),
    onCopy: vi.fn<() => void>(),
    onPaste: vi.fn<() => void>(),
    onDuplicate: vi.fn<() => void>(),
    onSelectAll: vi.fn<() => void>(),
  };
}

describe("KeyboardManager", () => {
  let cb: ReturnType<typeof createCallbacks>;
  let manager: KeyboardManager;

  beforeEach(() => {
    activeListeners = [];
    cb = createCallbacks();
    manager = new KeyboardManager(cb);
  });

  afterEach(() => {
    manager.destroy();
  });

  test("should call onDelete when Delete is pressed", () => {
    dispatch("Delete");
    expect(cb.onDelete).toHaveBeenCalledOnce();
  });

  test("should call onDelete when Backspace is pressed", () => {
    dispatch("Backspace");
    expect(cb.onDelete).toHaveBeenCalledOnce();
  });

  test("should call onEscape when Escape is pressed", () => {
    dispatch("Escape");
    expect(cb.onEscape).toHaveBeenCalledOnce();
  });

  test("should call onUndo when Ctrl+Z is pressed", () => {
    const { preventDefault } = dispatch("z", { ctrlKey: true });
    expect(cb.onUndo).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  test("should call onRedo when Ctrl+Shift+Z is pressed", () => {
    const { preventDefault } = dispatch("z", { ctrlKey: true, shiftKey: true });
    expect(cb.onRedo).toHaveBeenCalledOnce();
    expect(cb.onUndo).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  test("should call onCopy when Ctrl+C is pressed", () => {
    const { preventDefault } = dispatch("c", { ctrlKey: true });
    expect(cb.onCopy).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  test("should call onPaste when Ctrl+V is pressed", () => {
    const { preventDefault } = dispatch("v", { ctrlKey: true });
    expect(cb.onPaste).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  test("should call onDuplicate when Ctrl+D is pressed", () => {
    const { preventDefault } = dispatch("d", { ctrlKey: true });
    expect(cb.onDuplicate).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  test("should call onSelectAll when Ctrl+A is pressed", () => {
    const { preventDefault } = dispatch("a", { ctrlKey: true });
    expect(cb.onSelectAll).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  test("should work with Meta key (macOS)", () => {
    dispatch("c", { metaKey: true });
    expect(cb.onCopy).toHaveBeenCalledOnce();
    dispatch("v", { metaKey: true });
    expect(cb.onPaste).toHaveBeenCalledOnce();
  });

  test("should not respond when disabled", () => {
    manager.enabled = false;
    dispatch("Delete");
    dispatch("z", { ctrlKey: true });
    expect(cb.onDelete).not.toHaveBeenCalled();
    expect(cb.onUndo).not.toHaveBeenCalled();
  });

  test("should not respond after destroy", () => {
    manager.destroy();
    dispatch("Delete");
    dispatch("c", { ctrlKey: true });
    expect(cb.onDelete).not.toHaveBeenCalled();
    expect(cb.onCopy).not.toHaveBeenCalled();
  });
});
