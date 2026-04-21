import { SerializationError } from "../errors";
import type { SceneData } from "./schema";

const VALID_SIDES = new Set(["top", "right", "bottom", "left"]);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isPositive(v: unknown): v is number {
  return isFiniteNumber(v) && v > 0;
}

function isSide(v: unknown): boolean {
  return isString(v) && VALID_SIDES.has(v);
}

function assertArray(val: unknown, name: string): asserts val is unknown[] {
  if (!Array.isArray(val)) throw new SerializationError(`"${name}" must be an array`);
}

export function validateSceneData(data: unknown): SceneData {
  if (data === null || typeof data !== "object") {
    throw new SerializationError("Scene data must be a non-null object");
  }
  const obj = data as Record<string, unknown>;

  if (!isFiniteNumber(obj.version) || !Number.isInteger(obj.version) || obj.version < 1) {
    throw new SerializationError("Scene data must have a valid version number");
  }

  assertArray(obj.nodes, "nodes");
  assertArray(obj.groups, "groups");
  assertArray(obj.edges, "edges");
  assertArray(obj.groupMemberships, "groupMemberships");

  for (const n of obj.nodes as unknown[]) {
    validateNode(n);
  }
  for (const g of obj.groups as unknown[]) {
    validateGroup(g);
  }
  for (const e of obj.edges as unknown[]) {
    validateEdge(e);
  }
  for (const m of obj.groupMemberships as unknown[]) {
    validateMembership(m);
  }

  if (obj.viewport !== undefined && obj.viewport !== null) {
    const vp = obj.viewport as Record<string, unknown>;
    if (!isFiniteNumber(vp.x) || !isFiniteNumber(vp.y) || !isPositive(vp.zoom)) {
      throw new SerializationError("viewport must have finite x, y and positive zoom");
    }
  }

  return data as SceneData;
}

function validateNode(n: unknown): void {
  if (n === null || typeof n !== "object") throw new SerializationError("Node must be an object");
  const o = n as Record<string, unknown>;
  if (!isString(o.id)) throw new SerializationError("Node must have a string id");
  if (!isFiniteNumber(o.x) || !isFiniteNumber(o.y))
    throw new SerializationError(`Node "${o.id}": x/y must be finite numbers`);
  if (!isPositive(o.width) || !isPositive(o.height))
    throw new SerializationError(`Node "${o.id}": width/height must be positive`);
  if (!isString(o.label)) throw new SerializationError(`Node "${o.id}": label must be a string`);
  if (!isFiniteNumber(o.color))
    throw new SerializationError(`Node "${o.id}": color must be a finite number`);
  if (o.edgeSidesLocked !== undefined && typeof o.edgeSidesLocked !== "boolean") {
    throw new SerializationError(`Node "${o.id}": edgeSidesLocked must be a boolean or undefined`);
  }
}

function validateGroup(g: unknown): void {
  if (g === null || typeof g !== "object") throw new SerializationError("Group must be an object");
  const o = g as Record<string, unknown>;
  if (!isString(o.id)) throw new SerializationError("Group must have a string id");
  if (!isFiniteNumber(o.x) || !isFiniteNumber(o.y))
    throw new SerializationError(`Group "${o.id}": x/y must be finite numbers`);
  if (!isPositive(o.width) || !isPositive(o.height))
    throw new SerializationError(`Group "${o.id}": width/height must be positive`);
  if (!isString(o.label)) throw new SerializationError(`Group "${o.id}": label must be a string`);
  if (!isFiniteNumber(o.color))
    throw new SerializationError(`Group "${o.id}": color must be a finite number`);
  if (typeof o.collapsed !== "boolean")
    throw new SerializationError(`Group "${o.id}": collapsed must be a boolean`);
  if (!isPositive(o.expandedHeight))
    throw new SerializationError(`Group "${o.id}": expandedHeight must be positive`);
  if (o.edgeSidesLocked !== undefined && typeof o.edgeSidesLocked !== "boolean") {
    throw new SerializationError(`Group "${o.id}": edgeSidesLocked must be a boolean or undefined`);
  }
}

function validateEdge(e: unknown): void {
  if (e === null || typeof e !== "object") throw new SerializationError("Edge must be an object");
  const o = e as Record<string, unknown>;
  if (!isString(o.id)) throw new SerializationError("Edge must have a string id");
  if (!isString(o.sourceId))
    throw new SerializationError(`Edge "${o.id}": sourceId must be a string`);
  if (!isString(o.targetId))
    throw new SerializationError(`Edge "${o.id}": targetId must be a string`);
  if (!isSide(o.sourceSide))
    throw new SerializationError(`Edge "${o.id}": sourceSide must be top/right/bottom/left`);
  if (!isSide(o.targetSide))
    throw new SerializationError(`Edge "${o.id}": targetSide must be top/right/bottom/left`);
  if (o.label !== undefined && !isString(o.label)) {
    throw new SerializationError(`Edge "${o.id}": label must be a string or undefined`);
  }
  if (o.labelColor !== undefined && !isFiniteNumber(o.labelColor)) {
    throw new SerializationError(`Edge "${o.id}": labelColor must be a finite number or undefined`);
  }
}

function validateMembership(m: unknown): void {
  if (m === null || typeof m !== "object")
    throw new SerializationError("GroupMembership must be an object");
  const o = m as Record<string, unknown>;
  if (!isString(o.childId))
    throw new SerializationError("GroupMembership must have a string childId");
  if (!isString(o.groupId))
    throw new SerializationError("GroupMembership must have a string groupId");
}
