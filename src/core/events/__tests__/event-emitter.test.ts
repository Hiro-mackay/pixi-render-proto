import { describe, expect, test, vi } from "vitest";
import { CanvasEventEmitter } from "../event-emitter";

describe("CanvasEventEmitter", () => {
  test("should call handler when event is emitted", () => {
    const emitter = new CanvasEventEmitter();
    const handler = vi.fn();
    emitter.on("history:change", handler);
    emitter.emit("history:change", { canUndo: true, canRedo: false });
    expect(handler).toHaveBeenCalledWith({ canUndo: true, canRedo: false });
  });

  test("should support multiple listeners for the same event", () => {
    const emitter = new CanvasEventEmitter();
    const h1 = vi.fn();
    const h2 = vi.fn();
    emitter.on("selection:change", h1);
    emitter.on("selection:change", h2);
    emitter.emit("selection:change", { selectedIds: ["a"] });
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  test("should unsubscribe via returned function", () => {
    const emitter = new CanvasEventEmitter();
    const handler = vi.fn();
    const unsub = emitter.on("edge:create", handler);
    unsub();
    emitter.emit("edge:create", { id: "e1" });
    expect(handler).not.toHaveBeenCalled();
  });

  test("should suppress events inside suppress() callback", () => {
    const emitter = new CanvasEventEmitter();
    const handler = vi.fn();
    emitter.on("element:move", handler);
    emitter.suppress(() => {
      emitter.emit("element:move", { id: "n1", x: 10, y: 20 });
    });
    expect(handler).not.toHaveBeenCalled();
  });

  test("should resume delivery after suppress() completes", () => {
    const emitter = new CanvasEventEmitter();
    const handler = vi.fn();
    emitter.on("element:move", handler);
    emitter.suppress(() => {
      emitter.emit("element:move", { id: "n1", x: 0, y: 0 });
    });
    emitter.emit("element:move", { id: "n1", x: 10, y: 20 });
    expect(handler).toHaveBeenCalledOnce();
  });

  test("should restore suppression even if callback throws", () => {
    const emitter = new CanvasEventEmitter();
    const handler = vi.fn();
    emitter.on("element:move", handler);
    expect(() =>
      emitter.suppress(() => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    emitter.emit("element:move", { id: "n1", x: 10, y: 20 });
    expect(handler).toHaveBeenCalledOnce();
  });

  test("should clear all listeners on destroy", () => {
    const emitter = new CanvasEventEmitter();
    const handler = vi.fn();
    emitter.on("edge:delete", handler);
    emitter.destroy();
    emitter.emit("edge:delete", { id: "e1" });
    expect(handler).not.toHaveBeenCalled();
  });

  test("should not throw when emitting event with no listeners", () => {
    const emitter = new CanvasEventEmitter();
    expect(() => emitter.emit("group:collapse", { id: "g1" })).not.toThrow();
  });

  test("should continue calling remaining handlers when one throws", () => {
    const emitter = new CanvasEventEmitter();
    const h1 = vi.fn();
    const h2 = vi.fn(() => {
      throw new Error("bad handler");
    });
    const h3 = vi.fn();
    emitter.on("element:move", h1);
    emitter.on("element:move", h2);
    emitter.on("element:move", h3);

    vi.spyOn(console, "error").mockImplementation(() => {});
    emitter.emit("element:move", { id: "n1", x: 0, y: 0 });

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
    expect(h3).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });

  test("should console.error when a handler throws", () => {
    const emitter = new CanvasEventEmitter();
    const error = new Error("handler error");
    emitter.on("edge:create", () => {
      throw error;
    });

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    emitter.emit("edge:create", { id: "e1" });

    expect(spy).toHaveBeenCalledWith(expect.stringContaining("edge:create"), error);
    vi.restoreAllMocks();
  });
});
