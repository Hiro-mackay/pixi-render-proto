export { createCanvasEngine } from "./engine";
export type { CanvasEngine } from "./engine";
export {
  CanvasEngineError,
  ElementNotFoundError,
  ElementExistsError,
  InvalidArgumentError,
  CycleDetectedError,
  DestroyedEngineError,
  SerializationError,
  CommandExecutionError,
} from "./errors";
export type { ReadonlyElementRegistry } from "./registry/element-registry";
export type { CanvasEventMap, CanvasEventName, EventDescriptor } from "./events/event-emitter";
export type {
  EngineOptions,
  NodeOptions,
  GroupOptions,
  EdgeOptions,
  Point,
  Rect,
  Side,
  Anchor,
  BezierPoints,
  ElementSize,
} from "./types";
export type {
  SceneData,
  SerializedNode,
  SerializedGroup,
  SerializedEdge,
  GroupMembership,
} from "./serialization/schema";
