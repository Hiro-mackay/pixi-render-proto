export type { CanvasEngine } from "./engine";
export { createCanvasEngine } from "./engine";
export {
  CanvasEngineError,
  CommandExecutionError,
  CycleDetectedError,
  DestroyedEngineError,
  ElementExistsError,
  ElementNotFoundError,
  InvalidArgumentError,
  SerializationError,
} from "./errors";
export type { CanvasEventMap, CanvasEventName, EventDescriptor } from "./events/event-emitter";
export type { ReadonlyElementRegistry } from "./registry/element-registry";
export type {
  GroupMembership,
  SceneData,
  SerializedEdge,
  SerializedGroup,
  SerializedNode,
} from "./serialization/schema";
export type {
  Anchor,
  BezierPoints,
  EdgeOptions,
  ElementSize,
  EngineOptions,
  GroupOptions,
  NodeOptions,
  Point,
  Rect,
  Side,
} from "./types";
