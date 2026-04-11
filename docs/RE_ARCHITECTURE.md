# Re-Architecture Plan: Canvas Engine

## Context

プロトタイプ（200 nodes, 80 edges, 8 groups）は動作するが、プロダクション品質には程遠い。
- パフォーマンス: 120fps → 60fps に劣化。walkRedraw O(n)、Graphics.clear()毎フレーム
- 結合度: 5つのWeakMapがグローバル状態。demo-scene.tsが11の責務を持つモノリス
- API: ライブラリとして使えない。外部消費者は5つのWeakMapを直接操作する必要がある
- コード品質: selection.ts 632行、buildDemoScene() 292行の巨大関数

目標: `/packages/core` (Vanilla TS engine) + `/packages/react` (React wrapper) + `/examples` に分離し、クリーンでパフォーマントなコードベースをゼロから構築する。

---

## Prototype Retrospective

### What Worked
- PixiJS 8 + pixi-viewport の組み合わせは高速で安定
- ベジェ曲線の制御点計算（方向適応型）は良い結果
- 固定ポートアンカー方式（sourceSide/targetSide）は直感的
- counter-scale + zoom-invariant stroke の2パターンは有効
- WeakMapのGCフレンドリーな設計思想は正しい

### What Failed
- **walkRedraw**: ツリー全走査がO(n)でスケールしない
- **グローバルWeakMap**: 5つのWeakMapがモジュール間の暗黙的結合を生む
- **selection.ts 632行**: リサイズ、エンドポイントドラッグ、リコネクション、アウトラインの4責務が1ファイル
- **demo-scene.ts**: シーン構築とエンジン設定が混在。ライブラリとして切り出せない
- **リアルタイム所属変更**: 毎フレームassign/removeでパフォーマンス崩壊
- **enableItemDrag 126行**: Node/Groupの分岐がisGroupフラグに依存

---

## Repository Structure

```
/
├── packages/
│   ├── core/                          # Vanilla TS canvas engine
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts             # Library build config
│   │   └── src/
│   │       ├── index.ts               # Public API exports
│   │       ├── engine.ts              # CanvasEngine class (single entry point)
│   │       ├── types.ts               # Public types only
│   │       ├── registry.ts            # ElementRegistry (replaces 5 WeakMaps)
│   │       ├── viewport.ts            # Viewport setup, zoom, pan
│   │       ├── renderer/
│   │       │   ├── node-renderer.ts   # Node drawing (Graphics creation + redraw)
│   │       │   ├── group-renderer.ts  # Group drawing (bg, header, toggle)
│   │       │   ├── edge-renderer.ts   # Edge drawing (bezier, arrow, label, hit area)
│   │       │   └── redraw-manager.ts  # Dirty-set based redraw (replaces walkRedraw)
│   │       ├── interaction/
│   │       │   ├── drag.ts            # Unified drag handler
│   │       │   ├── selection.ts       # Selection state (outline only)
│   │       │   ├── resize.ts          # Resize handles + logic
│   │       │   ├── edge-connect.ts    # Edge creation from ports
│   │       │   └── edge-reconnect.ts  # Edge endpoint drag
│   │       ├── hierarchy/
│   │       │   ├── group-ops.ts       # assign/remove/descendants
│   │       │   └── membership.ts      # Spatial membership reconciliation
│   │       └── geometry/
│   │           ├── bezier.ts          # Control point computation
│   │           ├── anchor.ts          # Side anchor + nearest side
│   │           └── hit-test.ts        # Point-in-rect, findElementAt
│   │
│   └── react/                         # React wrapper
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── CanvasProvider.tsx      # Context + CanvasEngine lifecycle
│           ├── useCanvas.ts           # Hook to access engine
│           └── Canvas.tsx             # Component with ref binding
│
├── examples/
│   └── architecture-diagram/          # Current demo moved here
│       ├── package.json
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   └── demo-scene.ts          # Scene builder (data only, no engine logic)
│       └── assets/
│
├── package.json                       # Workspace root (pnpm workspaces)
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Core Architecture

### 1. ElementRegistry (replaces 5 WeakMaps)

```typescript
class ElementRegistry {
  private elements = new Map<string, CanvasElement>();
  private edges = new Map<string, CanvasEdge>();
  // Derived indexes (maintained on mutation)
  private edgesByNode = new Map<string, Set<string>>();
  private childrenByGroup = new Map<string, Set<string>>();

  addNode(id: string, opts: NodeOptions): CanvasElement;
  addGroup(id: string, opts: GroupOptions): CanvasElement;
  addEdge(id: string, opts: EdgeOptions): CanvasEdge;
  remove(id: string): void;

  getElement(id: string): CanvasElement | undefined;
  getEdge(id: string): CanvasEdge | undefined;
  getEdgesByNode(nodeId: string): CanvasEdge[];   // O(1) index lookup
  getChildrenOf(groupId: string): CanvasElement[]; // O(1) index lookup
  getAllNodes(): CanvasElement[];
  getAllGroups(): CanvasElement[];
}

interface CanvasElement {
  readonly id: string;
  readonly type: "node" | "group";
  container: Container;           // PixiJS display object
  x: number;
  y: number;
  width: number;
  height: number;
  parentGroupId: string | null;
  groupMeta?: GroupMeta;          // Only present when type === "group"
}

interface CanvasEdge {
  readonly id: string;
  sourceId: string;
  sourceSide: Side;
  targetId: string;
  targetSide: Side;
  label?: string;
  display: EdgeDisplay;           // PixiJS display objects
}
```

**Prototype problem**: 5つのWeakMap (`elementSizeMap`, `nodePortsMap`, `groupMetaMap`, `groupParentMap`, `groupChildrenMap`) がグローバルに散在。任意のモジュールから書き込み可能で不整合が発生しやすい。

**Solution**: 1つの `ElementRegistry` に集約。derived indexes (`edgesByNode`, `childrenByGroup`) でO(1)クエリ。ID-based APIで外部消費者はContainer参照不要。

### 2. RedrawManager (replaces walkRedraw)

```typescript
class RedrawManager {
  private dirty = new Set<Redrawable>();
  private scheduled = false;

  register(item: Redrawable): void;    // 初回登録
  unregister(item: Redrawable): void;  // 削除時
  markDirty(item: Redrawable): void;   // 個別dirty
  markAllDirty(): void;                // zoom change時
  flush(): void;                       // ticker callback: dirty set のみ redraw
}
```

**Prototype problem**: `walkRedraw()` がビューポートツリー全体をO(n)で毎回走査。200ノード + 80エッジ + 8グループ = 500+コールバック/zoom。

**Solution**: Dirty-set方式。ズーム時は `markAllDirty()` → 次のticker tickで `flush()`。ドラッグ時は関連要素のみ `markDirty()`。非表示要素は自動スキップ。

### 3. CanvasEngine (single entry point)

```typescript
class CanvasEngine {
  readonly registry: ElementRegistry;  // Read-only access for consumers

  constructor(container: HTMLElement, options?: EngineOptions);
  destroy(): void;

  // Element CRUD
  addNode(id: string, opts: NodeOptions): void;
  addGroup(id: string, opts: GroupOptions): void;
  addEdge(id: string, opts: EdgeOptions): void;
  removeElement(id: string): void;
  removeEdge(id: string): void;

  // Mutations
  updateElement(id: string, updates: Partial<ElementUpdate>): void;
  moveElement(id: string, x: number, y: number): void;
  resizeElement(id: string, width: number, height: number): void;

  // Group operations
  assignToGroup(childId: string, groupId: string): void;
  removeFromGroup(childId: string): void;
  toggleCollapse(groupId: string): void;

  // View
  setZoom(scale: number): void;
  centerOn(x: number, y: number): void;
  fitToContent(): void;

  // Events
  on(event: CanvasEvent, handler: EventHandler): () => void;  // returns unsubscribe
}

type CanvasEvent =
  | "node:select" | "node:deselect" | "node:move" | "node:resize"
  | "edge:select" | "edge:create" | "edge:delete" | "edge:reconnect"
  | "group:collapse" | "group:expand" | "group:membershipChange";
```

**Prototype problem**: 外部消費者がWeakMap、SelectionManager、EdgeCreator、enableItemDragを全て知る必要がある。

**Solution**: `CanvasEngine` 1クラスのみをimport。内部のRegistry、Renderer、Interactionは全て隠蔽。

---

## Performance Strategy

| Problem | Prototype | Re-Architecture |
|---------|-----------|-----------------|
| Zoom redraw | walkRedraw O(n) tree walk every zoom | RedrawManager dirty-set, flush once/frame |
| Edge update during drag | edges.filter() + updateEdge() per frame | edgesByNode index O(1) + batch update |
| Port redraw | 800 port redraws on zoom (invisible) | Skip invisible elements in dirty-set |
| Membership reconciliation | O(n²) per resize frame → moved to end | O(changed children) only |
| Group highlight | allGroups.filter() per pointermove | cachedCandidates at pointerdown (kept) |
| Graphics.clear() | 21 clear+redraw sites | Dirty check: skip if unchanged |

### Additional: Frustum Culling
- ビューポート外の要素のredrawをスキップ
- `viewport.getVisibleBounds()` で可視範囲を取得
- markDirty時に可視範囲外ならスキップ

---

## Implementation Phases

### Phase 0: Monorepo Setup
- pnpm workspace設定 (`pnpm-workspace.yaml`)
- `packages/core`, `packages/react`, `examples/architecture-diagram` 作成
- `tsconfig.base.json` + 各パッケージの `tsconfig.json`
- `vite.config.ts` (library mode: ESM + CJS + types)
- 既存プロトタイプは `/prototype` に移動（参照用保持）

### Phase 1: Core Foundation
- `types.ts`: Side, ElementSize, GroupMeta, NodeOptions, GroupOptions, EdgeOptions, CanvasEvent
- `registry.ts`: ElementRegistry (Map-based, indexes)
- `viewport.ts`: PixiJS Application + pixi-viewport初期化
- `geometry/bezier.ts`: computeBezierControlPoints (方向適応型、プロトタイプから移植)
- `geometry/anchor.ts`: getFixedSideAnchor, getNearestSide
- `geometry/hit-test.ts`: findElementAt (visible-only, header-excluded for groups)

### Phase 2: Renderers
- `renderer/redraw-manager.ts`: dirty-set + flush
- `renderer/node-renderer.ts`: createNodeGraphics, updateNodeGraphics, resizeNodeGraphics
- `renderer/group-renderer.ts`: createGroupGraphics, updateGroupGraphics, toggleCollapse
- `renderer/edge-renderer.ts`: createEdgeGraphics, updateEdgeGraphics, setEdgeSelected/Visible

### Phase 3: Interactions
- `interaction/drag.ts`: enableDrag (registry-based, no isGroup branch)
- `interaction/selection.ts`: SelectionState (outline描画のみ、30行以内)
- `interaction/resize.ts`: ResizeHandles (8ハンドル、辺ドラッグ)
- `interaction/edge-connect.ts`: PortManager + EdgeCreator
- `interaction/edge-reconnect.ts`: EndpointDrag

### Phase 4: Hierarchy
- `hierarchy/group-ops.ts`: assign, remove, getDescendants, isDescendantOf
- `hierarchy/membership.ts`: reconcileMembership (空間ベース、header除外)

### Phase 5: Engine + API
- `engine.ts`: CanvasEngine (全モジュール組み立て)
- `index.ts`: public exports (CanvasEngine, types のみ)

### Phase 6: React Wrapper
- `CanvasProvider.tsx`: Context + useEffect lifecycle
- `useCanvas.ts`: hook to get engine instance
- `Canvas.tsx`: `<Canvas />` component

### Phase 7: Example Migration
- `demo-scene.ts`: CanvasEngine APIでシーン構築（データ定義のみ）
- Assets移動、Playwright テスト移行

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **ID-based API** | Container参照ではなくstring IDで全操作。外部DB/state managerとの連携が容易 |
| **イベント駆動** | 内部状態変更はイベントで通知。UIフレームワーク非依存 |
| **Batch rendering** | requestAnimationFrameでフレーム単位の一括更新。毎pointermoveの即時描画を回避 |
| **No global state** | viewState singleton廃止。CanvasEngineインスタンスに閉じ込め |
| **Renderer分離** | 描画ロジック(renderer/)とインタラクション(interaction/)を完全分離 |
| **Registry indexes** | edgesByNode, childrenByGroup でO(1)クエリ。mutation時に自動更新 |

---

## File Size Targets (per file)

- **< 100行**: geometry/, hierarchy/ の各ファイル
- **< 150行**: renderer/ の各ファイル
- **< 200行**: interaction/ の各ファイル
- **< 200行**: engine.ts, registry.ts
- **< 30行**: index.ts, types.ts (public types only)

---

## Verification

- `pnpm build` — 全パッケージビルド成功
- `pnpm --filter core test` — core単体テスト（vitest）
- `pnpm --filter example dev` — example起動、200ノード描画
- Performance: 120fps維持（idle + zoom + drag at 200 nodes）
- Bundle size: core < 50KB gzipped (PixiJS excluded as peer dependency)
