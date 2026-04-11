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

export const TEXT_RESOLUTION = Math.ceil(window.devicePixelRatio || 1) * 2;

// --- Canvas element model (single source of truth) ---

export interface NodeMeta {
  readonly label: string;
  readonly color: number;
  readonly icon?: Texture;
}

export interface GroupMeta {
  readonly label: string;
  readonly color: number;
  collapsed: boolean;
}

export interface CanvasElement {
  readonly id: string;
  readonly type: "node" | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  parentGroupId: string | null;
  container: Container;
  readonly meta: NodeMeta | GroupMeta;
}

export interface CanvasEdge {
  readonly id: string;
  sourceId: string;
  sourceSide: Side;
  targetId: string;
  targetSide: Side;
  label: string | null;
  line: Redrawable;
  hitLine: Graphics;
  labelPill: Redrawable | null;
  labelText: Text | null;
  selected: boolean;
}

// --- Engine options ---

export interface EngineOptions {
  readonly debug?: boolean;
  readonly signal?: AbortSignal;
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
}
