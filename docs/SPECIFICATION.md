# PixiJS Canvas Prototype - Specification

## Overview

PixiJS + pixi-viewport based interactive canvas for architecture diagram drawing. Nodes, edges, and groups form a hierarchical graph with FigJam-inspired interaction patterns.

**Tech Stack:** PixiJS 8.17 / pixi-viewport 6.0 / TypeScript 5.7 / Vite 6.0 / React 19

---

## Architecture

### Module Structure

```
src/canvas/
  types.ts            # Shared types, registries (elementSizeMap, groupMaps), utilities
  types.ts            # Shared constants (ACCENT_COLOR, ANCHOR_HIDE_THRESHOLD, ...)
  setup.ts            # Canvas/viewport initialization, zoom handling, walkRedraw
  node.ts             # Node creation and resize
  node-ports.ts       # Connection ports (4 per node, zoom-invariant)
  group.ts            # Group creation, resize, collapse/expand toggle
  group-hierarchy.ts  # Tree operations (assign, remove, descendants, spatial queries)
  edge.ts             # Edge creation, rendering, selection, visibility
  edge-creator.ts     # Interactive edge creation state machine
  selection.ts        # SelectionManager (outline, resize handles, edge endpoints, reconnection)
  interaction.ts      # Drag handler (unified for nodes and groups), edge click, deselect
  demo-scene.ts       # Scene builder (200 nodes, 8 groups, 80 edges)
```

### Data Model

All elements share a unified size registry:

```
elementSizeMap: WeakMap<Container, { width, height }>   -- Node and Group sizes
groupMetaMap:   WeakMap<Container, GroupMeta>            -- Group-specific data (color, collapsed)
groupParentMap: WeakMap<Container, Container>            -- Child -> Parent hierarchy
groupChildrenMap: WeakMap<Container, Set<Container>>     -- Parent -> Children
nodePortsMap:   WeakMap<Container, Container>            -- Node -> Ports container
```

---

## Node

### Creation
- Rounded rectangle background with zoom-invariant stroke
- Optional icon (28x28 Sprite) + text label, vertically centered
- Registered in `elementSizeMap` for size tracking

### Resize
- 4 corner handles (squares) + 4 edge handles (invisible full-edge hit areas)
- Corner handles have priority (z-order above edge handles)
- Icon and label auto-center on resize
- Minimum size: 60x40

### Selection
- Click to select -> blue outline + resize handles + connection ports
- Ports hidden when deselected

---

## Connection Ports

### Positioning
- 4 ports per node: top, right, bottom, left
- Positioned outside node boundary at zoom-invariant screen distance (14px)
- `getPortPositions(width, height)` recalculates based on `viewState.scale`

### Visual States
- **Default:** White fill + blue stroke (visible when node selected)
- **Hover:** Blue fill + white stroke
- **Dragging edge:** Stays blue until edge creation ends
- **Below 0.5x zoom:** Hidden (visible = false)

### Edge Creation
- Drag from port to start edge creation
- Ghost bezier follows cursor
- Target node ports highlight on hover (snap to nearest port)
- Drop on node: create edge. Drop on empty: cancel
- `onEnd` callback resets port visual state

---

## Edge

### Data
- `sourceSide` / `targetSide`: fixed port positions (top/right/bottom/left)
- Both sides are user-specified at creation time, no auto-switching

### Rendering
- Cubic bezier with smart control points:
  - Forward direction: moderate curve (projection * 0.4)
  - Reverse direction: smooth loop (|projection| * 0.6 + 60)
- Arrow head at target end
- Optional protocol label pill (color-coded: HTTPS=blue, gRPC=cyan, TCP=green, Redis=red, AMQP=orange)
- Hit line: invisible 10px-wide stroke for click detection

### Selection
- Click edge to select (blue highlight, thicker stroke)
- Endpoint handles appear at source/target anchors
- Handles hidden if node is inside collapsed group
- Delete/Backspace removes selected edge

### Reconnection
- Drag endpoint handle to reconnect to different node/port
- Ghost bezier + candidate node highlight during drag
- Drop on node: reconnect (nearest port). Drop on empty: revert to original
- Handle snaps to target port position

### Collapsed Group Routing
- `getVisibleContainer()` walks parent chain to find visible ancestor
- Edge routes to collapsed group boundary instead of hidden node
- Both endpoints hidden in same collapsed group: edge hidden entirely

---

## Group

### Structure
- Header (28px): label (uppercase) + collapse toggle icon
- Body: contains child nodes and sub-groups
- Rounded rectangle background (semi-transparent fill + colored stroke)

### Collapse/Expand
- SVG chevron icon in header (chevron-down / chevron-right)
- World-space fixed size (scales with zoom naturally)
- Hover: alpha 0.6 -> 1.0
- Click toggle: hides all descendants, shrinks height to HEADER_HEIGHT
- Badge shows child count when collapsed ("N items")
- Connected edges reroute to group boundary

### Hierarchy
- Nested groups supported (VPC > Subnet > Node)
- `findGroupAt()`: spatial query, returns deepest (smallest area) group at point, excludes header region
- `assignToGroup()` / `removeFromGroup()`: manage parent-child maps
- `getDescendants()`: recursive collection with accumulator pattern (no per-call allocation)
- `isInsideGroup()`: center-point containment check against body area

### Membership Rules
- **Drag & drop:** Highlight candidate group during drag, assign on drop
- **Resize:** Reconcile membership on resize end (not every frame)
- **Header exclusion:** Items cannot be placed in header area (top 28px)
- **Auto-leave:** Items outside group boundary after resize are removed
- **Auto-join:** Items inside boundary after resize are added

---

## Selection System

### SelectionManager
- Manages outline, resize handles (8), endpoint handles (2), reconnection state
- Mutual exclusion: node selection deselects edge and vice versa
- Node selection shows ports; deselection hides ports

### Resize Handles
- 0-3: Corner handles (squares, visible)
- 4-7: Edge handles (invisible, full-edge hit area)
- Corner handles z-ordered above edge handles
- Both hidden below 0.5x zoom

### Keyboard
- Delete / Backspace: remove selected edge
- Escape: cancel edge creation / reconnection

---

## Drag System

### enableItemDrag (unified for Node and Group)
- `DragContext`: viewport, edges, selection, allGroups, groupHighlight
- Click (< 5px movement): select item
- Drag: move item (+ descendants if group)
- Group highlight during drag (visual feedback)
- Drop: assign/remove group membership

### Performance Caching
- `cachedDescendants`: computed once at pointerdown
- `cachedCandidates`: group filter list cached at pointerdown
- `cachedEdges`: related edges cached at pointerdown (Set-based for groups)
- `movedDistance`: Math.hypot skipped after threshold exceeded

---

## Zoom-Invariant Rendering

### Two Patterns
1. **Stroke width:** `width / viewState.scale` (constant visual thickness)
2. **Counter-scale:** `container.scale.set(1 / viewState.scale)` (constant screen size)

### walkRedraw
- Triggered on every viewport zoom change
- Recursively walks display tree, calls `__redraw()` on each Graphics
- Skips invisible subtrees for performance

### Visibility Thresholds
- `ANCHOR_HIDE_THRESHOLD = 0.5`: ports, edge reconnect handles, and resize handles hidden below
  this zoom (selection outlines remain visible)

---

## Z-Order (bottom to top)

1. Groups (rendered first, lowest z)
2. Edge lines + hit areas (`edgeLineLayer`)
3. Nodes
4. Edge labels (`edgeLabelLayer`)
5. Ghost layer (edge creation preview, group highlight, member highlight)
6. Selection layer (outline, handles, endpoint handles, reconnection ghost)

---

## Demo Scene

- 200 nodes in 14-column grid (140x68 each)
- 8 groups with 2 nesting relationships (Frontend > VPC > Subnet)
- 80 edges with protocol labels
- 4 node icon types (compute, database, storage, loadbalancer)
- 4 node colors (slate variations)
- Deterministic PRNG (seed=42) for reproducible layout
- Initial zoom: 0.6x, centered on grid

---

## Test Suite (29 tests, Playwright)

| Suite | Tests | Coverage |
|-------|-------|----------|
| Render Verification | 8 | Canvas, FPS (idle/zoom/pan), node count, drag |
| Zoom Invariant | 3 | Stroke width, selection, handle sizing |
| Quality Verification | 5 | Zoom levels, edge sharpness, text quality, icons, DPI |
| Edge Creation | 3 | Port selection, connected edge, empty drop cancel |
| Node Resize | 4 | Handle visibility, drag resize, edge update, outline |
| Group Layer | 5 | Rendering, selection, drag, membership, nesting |
| Edge Design | 1 | Multi-zoom edge screenshot capture |
