import type { Graphics } from "pixi.js";

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

/** @internal Used by viewport walkRedraw. Not part of public API. */
export type Redrawable = Graphics & { __redraw?: () => void };

// --- Engine options ---

export interface EngineOptions {
  readonly debug?: boolean;
  readonly signal?: AbortSignal;
}
