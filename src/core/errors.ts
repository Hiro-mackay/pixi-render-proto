export class CanvasEngineError extends Error {
  readonly code: string;
  constructor(message: string, code: string, cause?: unknown) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

export class ElementNotFoundError extends CanvasEngineError {
  constructor(message: string, cause?: unknown) {
    super(message, "ELEMENT_NOT_FOUND", cause);
  }
}

export class ElementExistsError extends CanvasEngineError {
  constructor(message: string, cause?: unknown) {
    super(message, "ELEMENT_EXISTS", cause);
  }
}

export class InvalidArgumentError extends CanvasEngineError {
  constructor(message: string, cause?: unknown) {
    super(message, "INVALID_ARGUMENT", cause);
  }
}

export class CycleDetectedError extends CanvasEngineError {
  constructor(message: string, cause?: unknown) {
    super(message, "CYCLE_DETECTED", cause);
  }
}

export class DestroyedEngineError extends CanvasEngineError {
  constructor(message: string, cause?: unknown) {
    super(message, "ENGINE_DESTROYED", cause);
  }
}

export class SerializationError extends CanvasEngineError {
  constructor(message: string, cause?: unknown) {
    super(message, "SERIALIZATION_ERROR", cause);
  }
}

export class CommandExecutionError extends CanvasEngineError {
  constructor(message: string, cause?: unknown) {
    super(message, "COMMAND_EXECUTION_ERROR", cause);
  }
}
