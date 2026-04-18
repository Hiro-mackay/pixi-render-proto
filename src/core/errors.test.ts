import { describe, it, expect } from "vitest";
import {
  CanvasEngineError,
  ElementNotFoundError,
  ElementExistsError,
  InvalidArgumentError,
  CycleDetectedError,
  DestroyedEngineError,
  SerializationError,
  CommandExecutionError,
} from "./errors";

describe("CanvasEngineError hierarchy", () => {
  const cases = [
    { Cls: ElementNotFoundError, code: "ELEMENT_NOT_FOUND" },
    { Cls: ElementExistsError, code: "ELEMENT_EXISTS" },
    { Cls: InvalidArgumentError, code: "INVALID_ARGUMENT" },
    { Cls: CycleDetectedError, code: "CYCLE_DETECTED" },
    { Cls: DestroyedEngineError, code: "ENGINE_DESTROYED" },
    { Cls: SerializationError, code: "SERIALIZATION_ERROR" },
    { Cls: CommandExecutionError, code: "COMMAND_EXECUTION_ERROR" },
  ] as const;

  for (const { Cls, code } of cases) {
    describe(Cls.name, () => {
      const err = new Cls("test message");

      it("is instanceof Error", () => {
        expect(err).toBeInstanceOf(Error);
      });

      it("is instanceof CanvasEngineError", () => {
        expect(err).toBeInstanceOf(CanvasEngineError);
      });

      it("is instanceof its own class", () => {
        expect(err).toBeInstanceOf(Cls);
      });

      it(`has code "${code}"`, () => {
        expect(err.code).toBe(code);
      });

      it("preserves the message", () => {
        expect(err.message).toBe("test message");
      });

      it("has correct name", () => {
        expect(err.name).toBe(Cls.name);
      });
    });
  }

  it("discriminates between error types", () => {
    const err = new ElementNotFoundError("x");
    expect(err).not.toBeInstanceOf(ElementExistsError);
    expect(err).not.toBeInstanceOf(InvalidArgumentError);
  });

  it("supports cause chaining", () => {
    const cause = new Error("root cause");
    const err = new CommandExecutionError("failed", cause);
    expect(err.cause).toBe(cause);
  });
});
