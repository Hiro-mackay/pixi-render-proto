import { Container, Graphics } from "pixi.js";
import { viewState } from "./view-state";
import type { Redrawable } from "./types";

/**
 * Manages the selection overlay for a single node.
 *
 * Demonstrates two zoom-invariant patterns:
 *
 * Method 1 (selection outline)
 *   - Outline is positioned at the node's bounds (world-space)
 *   - Stroke width is redrawn as `2 / viewState.scale` on zoom change
 *   - Visible thickness stays constant regardless of zoom
 *
 * Method 2 (corner handles)
 *   - Handles are small squares positioned at the node's corners
 *   - Each handle's `scale` is set to `1 / viewState.scale`
 *   - Whole handle shrinks/grows to maintain a constant screen size
 */
export class SelectionManager {
  private layer: Container;
  private outline: Redrawable;
  private handles: Container[];
  private selected: {
    node: Container;
    width: number;
    height: number;
  } | null = null;

  // Base sizes (in screen pixels — will be counter-scaled)
  private static readonly HANDLE_SIZE = 10;
  private static readonly OUTLINE_PADDING = 2;

  constructor(layer: Container) {
    this.layer = layer;

    this.outline = new Graphics();
    this.outline.visible = false;
    this.layer.addChild(this.outline);

    this.handles = [];
    for (let i = 0; i < 4; i++) {
      const handle = new Container();
      handle.visible = false;

      const shape = new Graphics();
      const size = SelectionManager.HANDLE_SIZE;
      shape.rect(-size / 2, -size / 2, size, size);
      shape.fill(0xffffff);
      shape.stroke({ width: 1.5, color: 0x3b82f6 });
      handle.addChild(shape);

      this.handles.push(handle);
      this.layer.addChild(handle);
    }
  }

  select(node: Container, width: number, height: number): void {
    this.selected = { node, width, height };
    this.outline.__redraw = () => this.redraw();
    this.update();
  }

  clear(): void {
    this.selected = null;
    this.outline.visible = false;
    this.outline.__redraw = undefined;
    for (const h of this.handles) h.visible = false;
  }

  /**
   * Recompute outline geometry and handle positions.
   * Call on: initial select, node drag, viewport zoom.
   */
  update(): void {
    if (!this.selected) return;
    this.redraw();
    this.outline.visible = true;
  }

  private redraw(): void {
    if (!this.selected) return;

    const { node, width, height } = this.selected;
    const scale = viewState.scale;
    const inv = 1 / scale;
    const pad = SelectionManager.OUTLINE_PADDING / scale;
    const x = node.x;
    const y = node.y;

    this.outline.clear();
    this.outline.rect(x - pad, y - pad, width + pad * 2, height + pad * 2);
    this.outline.stroke({
      width: 2 / scale,
      color: 0x3b82f6,
    });

    const corners = [
      { x: x - pad, y: y - pad },
      { x: x + width + pad, y: y - pad },
      { x: x - pad, y: y + height + pad },
      { x: x + width + pad, y: y + height + pad },
    ];
    for (let i = 0; i < 4; i++) {
      const handle = this.handles[i]!;
      const corner = corners[i]!;
      handle.position.set(corner.x, corner.y);
      handle.scale.set(inv);
      handle.visible = true;
    }
  }
}
