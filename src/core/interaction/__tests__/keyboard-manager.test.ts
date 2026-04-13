import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
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

function dispatch(key: string, opts: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}): { preventDefault: ReturnType<typeof vi.fn> } {
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

describe("KeyboardManager", () => {
  let onDelete: ReturnType<typeof vi.fn<() => void>>;
  let onEscape: ReturnType<typeof vi.fn<() => void>>;
  let onUndo: ReturnType<typeof vi.fn<() => void>>;
  let onRedo: ReturnType<typeof vi.fn<() => void>>;
  let manager: KeyboardManager;

  beforeEach(() => {
    activeListeners = [];
    onDelete = vi.fn<() => void>();
    onEscape = vi.fn<() => void>();
    onUndo = vi.fn<() => void>();
    onRedo = vi.fn<() => void>();
    manager = new KeyboardManager(onDelete, onEscape, onUndo, onRedo);
  });

  afterEach(() => {
    manager.destroy();
  });

  test("should call onDelete when Delete is pressed", () => {
    dispatch("Delete");
    expect(onDelete).toHaveBeenCalledOnce();
  });

  test("should call onDelete when Backspace is pressed", () => {
    dispatch("Backspace");
    expect(onDelete).toHaveBeenCalledOnce();
  });

  test("should call onEscape when Escape is pressed", () => {
    dispatch("Escape");
    expect(onEscape).toHaveBeenCalledOnce();
  });

  test("should call onUndo and preventDefault when Ctrl+Z is pressed", () => {
    const { preventDefault } = dispatch("z", { ctrlKey: true });
    expect(onUndo).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  test("should call onUndo and preventDefault when Meta+Z is pressed", () => {
    const { preventDefault } = dispatch("z", { metaKey: true });
    expect(onUndo).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  test("should call onRedo and preventDefault when Ctrl+Shift+Z is pressed", () => {
    const { preventDefault } = dispatch("z", { ctrlKey: true, shiftKey: true });
    expect(onRedo).toHaveBeenCalledOnce();
    expect(onUndo).not.toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  test("should call onRedo and preventDefault when Meta+Shift+Z is pressed", () => {
    const { preventDefault } = dispatch("z", { metaKey: true, shiftKey: true });
    expect(onRedo).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  test("should not respond when disabled", () => {
    manager.enabled = false;
    dispatch("Delete");
    dispatch("z", { ctrlKey: true });
    expect(onDelete).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
  });

  test("should respond again when re-enabled", () => {
    manager.enabled = false;
    manager.enabled = true;
    dispatch("Delete");
    expect(onDelete).toHaveBeenCalledOnce();
  });

  test("should not respond after destroy", () => {
    manager.destroy();
    dispatch("Delete");
    dispatch("Escape");
    dispatch("z", { ctrlKey: true });
    expect(onDelete).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
  });
});
