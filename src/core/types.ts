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

/** @internal */
export function getTextResolution(): number {
  return Math.ceil((typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1) * 2;
}

/** @internal Runtime check for objects that implement the __redraw protocol. */
export function hasRedraw(c: object): c is { __redraw: () => void } {
  return "__redraw" in c && typeof (c as { __redraw?: unknown }).__redraw === "function";
}

// --- Canvas element model (single source of truth) ---

/** @internal Shared accent color used for selection, hover, ports, and interaction highlights. */
export const ACCENT_COLOR = 0x3b82f6;

/** @internal */
export const HEADER_HEIGHT = 28;
/** @internal */
export const COLLAPSED_HEIGHT = HEADER_HEIGHT;

/** @internal */
export interface NodeMeta {
  readonly label: string;
  readonly color: number;
  readonly icon?: Texture;
}

/** @internal */
export interface GroupMeta {
  readonly label: string;
  readonly color: number;
  collapsed: boolean;
  expandedHeight: number;
}

/** @internal */
interface ElementBase {
  readonly id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  parentGroupId: string | null;
  container: Container;
  /** Lazily initializes port graphics on first access (set by engine for nodes). */
  initPorts?: () => void;
}

/** @internal */
export interface NodeElement extends ElementBase {
  readonly type: "node";
  readonly meta: NodeMeta;
}

/** @internal */
export interface GroupElement extends ElementBase {
  readonly type: "group";
  readonly meta: GroupMeta;
}

/** @internal */
export type CanvasElement = NodeElement | GroupElement;

/** @internal */
export interface EdgePositionCache {
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  tgtX: number;
  tgtY: number;
  tgtW: number;
  tgtH: number;
  selected: boolean;
}

/** @internal */
export interface CanvasEdge {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceSide: Side;
  readonly sourceSidePinned: boolean;
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
  readonly sourceSidePinned?: boolean;
  readonly targetId: string;
  readonly targetSide: Side;
  readonly label?: string;
  readonly labelColor?: number;
}
