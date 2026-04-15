import type { Container, Graphics, Text, Texture } from "pixi.js";

// --- Geometry primitives ---

export type Point = { readonly x: number; readonly y: number };

export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type Side = "top" | "right" | "bottom" | "left";

export type Anchor = Point & { readonly side: Side };

export type BezierPoints = {
  readonly cp1x: number;
  readonly cp1y: number;
  readonly cp2x: number;
  readonly cp2y: number;
};

// --- Element data ---

export type ElementSize = { readonly width: number; readonly height: number };

/** @internal */
export type Redrawable = Graphics & { __redraw?: () => void };

export function getTextResolution(): number {
  return Math.ceil((typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1) * 2;
}

/** Runtime check for objects that implement the __redraw protocol. */
export function hasRedraw(c: object): c is { __redraw: () => void } {
  return "__redraw" in c && typeof (c as { __redraw?: unknown }).__redraw === "function";
}

// --- Canvas element model (single source of truth) ---

export const HEADER_HEIGHT = 28;
export const COLLAPSED_HEIGHT = HEADER_HEIGHT;

export interface NodeMeta {
  readonly label: string;
  readonly color: number;
  readonly icon?: Texture;
}

export interface GroupMeta {
  readonly label: string;
  readonly color: number;
  collapsed: boolean;
  expandedHeight: number;
}

interface ElementBase {
  readonly id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  parentGroupId: string | null;
  container: Container;
}

export interface NodeElement extends ElementBase {
  readonly type: "node";
  readonly meta: NodeMeta;
}

export interface GroupElement extends ElementBase {
  readonly type: "group";
  readonly meta: GroupMeta;
}

export type CanvasElement = NodeElement | GroupElement;

export interface EdgePositionCache {
  srcX: number; srcY: number; srcW: number; srcH: number;
  tgtX: number; tgtY: number; tgtW: number; tgtH: number;
  scale: number;
  selected: boolean;
}

export interface CanvasEdge {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceSide: Side;
  readonly targetId: string;
  readonly targetSide: Side;
  label: string | null;
  labelColor: number | null;
  readonly line: Redrawable;
  readonly hitLine: Graphics;
  readonly labelPill: Redrawable | null;
  readonly labelText: Text | null;
  selected: boolean;
  /** @internal position cache for skipping redundant redraws */
  _posCache?: EdgePositionCache;
}

// --- Engine options ---

export interface EngineOptions {
  readonly debug?: boolean;
  readonly signal?: AbortSignal;
  readonly gridSize?: number;
}

// --- CRUD option types ---

export interface NodeOptions {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color?: number;
  readonly icon?: Texture;
}

export interface GroupOptions {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: number;
}

export interface EdgeOptions {
  readonly sourceId: string;
  readonly sourceSide: Side;
  readonly targetId: string;
  readonly targetSide: Side;
  readonly label?: string;
  readonly labelColor?: number;
}
