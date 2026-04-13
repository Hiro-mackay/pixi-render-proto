# 再設計計画: Canvas Engine

## 背景

プロトタイプ（200ノード、80エッジ、8グループ）は動作するが、プロダクション品質には達していない。

**再設計の理由:**
- **結合度**: 5つのグローバルWeakMapがモジュール間に暗黙的な依存関係を生んでいる。どのモジュールからも任意のmapを読み書きでき、整合性の保証がない
- **コード品質**: `selection.ts`（632行）が4つの無関係な責務を持つ。`demo-scene.ts`（366行）がシーンデータとエンジンの組み立てを混在させている
- **内部結合**: 現在の利用面（`App.tsx`）は`initCanvas()` + `buildDemoScene()`を呼ぶだけで表面上シンプルだが、エンジン内部は5つのWeakMapで暗黙結合しており、`buildDemoScene()`を別のシーンに差し替えるだけでもWeakMap・SelectionManager・EdgeCreator・enableItemDragの全体を理解する必要がある。問題はユーザーAPIではなく、内部モジュールの結合度
- **パフォーマンス**: 開発中にFPSが約120から約60に劣化。原因を特定するプロファイリングデータは存在しない
- **機能不足**: Undo/Redo、複数選択、シリアライズ、クリップボードが未実装。キーボードショートカットはDelete/Backspace（`selection.ts:177`）とEscape（`edge-creator.ts:153`）が分散実装されているが、一元管理基盤がなく拡張困難

**目標**: 単一パッケージ内で `src/core/`（vanilla TSエンジン）と `src/react/`（薄いReactラッパー）を分離し、シンプルなimportでプロダクション品質のコードベースを構築する。

---

## プロトタイプ振り返り

### うまくいったこと
- PixiJS 8 + pixi-viewport: 高速で安定、良好なWebGLパフォーマンス
- 方向適応型ベジェ制御点（`types.ts:54-84`）: 順方向・逆方向エッジの両方で滑らかな曲線
- 固定ポートアンカーモデル（`sourceSide`/`targetSide`）: 直感的で明示的な制御
- 2つのzoom-invariantパターン: 線には `strokeWidth / scale`、UIクロームには `container.scale.set(1/scale)`
- WeakMapベースのGC設計: メモリ管理の方向性は正しい
- エッジヒットエリア戦略: 表示線とは別の透明な太いストロークで当たり判定
- ドラッグ時のキャッシュ戦略（`interaction.ts:41-43`）: pointerdown時にキャッシュし毎フレームのフィルタリングを回避
- グループヘッダー除外ゾーンによる空間的所属判定

### 変更が必要なこと
- **5つのグローバルWeakMap**（`elementSizeMap`, `nodePortsMap`, `groupMetaMap`, `groupParentMap`, `groupChildrenMap`）が `types.ts` に散在: モジュール間で調整なく共有されている。統一レジストリが必要
- **selection.ts（632行）**: 選択アウトライン、4コーナーハンドル + 4辺境界線、2つのエンドポイントハンドル、リコネクションのステートマシンが1ファイルに混在
- **demo-scene.ts（366行）**: レイヤー作成、ハンドラー接続、イベント設定がシーンデータと混在。エンジンをライブラリとして切り出せない
- **walkRedraw O(n)**: ズームのたびに表示ツリー全体を走査。FPS劣化への寄与が推測されるが、プロファイリングなしでは未証明
- **viewStateグローバルシングルトン**（`view-state.ts`）: 複数キャンバスインスタンスの併存を妨げる
- **リスナーリーク**: `SelectionManager`は`destroy()`メソッドを持つが（`selection.ts:253`）、`demo-scene.ts:100`で生成後にcleanup登録されていない。windowのkeydownリスナーがリークし、再マウント時に入力が競合する。`EdgeCreator`は`ctx.addCleanup()`で正しくクリーンアップされている（`demo-scene.ts:244`）
- **階層の循環防止なし**: `assignToGroup()`（`group-hierarchy.ts:13`）に循環チェックがない。`reconcileMembership()`（`demo-scene.ts:145-148`）はコメントで「self and descendantsを除外」と記述しているが、実装はselfのみ除外。`enableItemDrag`（`interaction.ts:61`）では`isDescendantOf`で正しく除外されるが、リサイズ後の`reconcileMembership`パスで循環が発生しうる。循環が発生すると`getDescendants()`が無限再帰する
- **可視性の破壊的代入**: グループ折りたたみ時に`desc.visible = !meta.collapsed`で全子孫に一括代入（`group.ts:172-174`）。ネストされたグループで、親が展開されると子グループ自身の折りたたみ状態が無視され、本来非表示であるべき孫要素が表示される
- **プロダクション機能の欠如**: Undo/Redo、複数選択、シリアライズ、クリップボードが未実装。キーボードショートカットはDelete（`selection.ts:177`）とEscape（`edge-creator.ts:153`）が個別に`window.addEventListener`で登録されており、一元管理・カスタマイズ不可

---

## ディレクトリ構造

単一パッケージ。モノレポなし。シンプルなimportパス。

```
/
├── prototype/                          # 現行の src/canvas/ を参照用に保持
│
├── src/
│   ├── core/                           # Vanilla TSエンジン（React依存ゼロ）
│   │   ├── index.ts                    # パブリックAPIバレル
│   │   ├── engine.ts                   # createCanvasEngine factory + CanvasEngine class
│   │   ├── types.ts                    # 全パブリック型定義
│   │   │
│   │   ├── registry/
│   │   │   ├── element-registry.ts     # WeakMap + Map ハイブリッド
│   │   │   └── edge-index.ts           # エッジのノード別派生インデックス
│   │   │
│   │   ├── viewport/
│   │   │   ├── viewport-setup.ts       # PixiJS Application + pixi-viewport 初期化
│   │   │   ├── zoom-handler.ts         # ホイールイベント、ズーム追跡
│   │   │   └── redraw-manager.ts       # Dirty-set再描画（プロファイリング検証済み）
│   │   │
│   │   ├── elements/
│   │   │   ├── node-renderer.ts        # ノードGraphics生成 + リサイズ
│   │   │   ├── group-renderer.ts       # グループGraphics、折りたたみ/展開
│   │   │   ├── edge-renderer.ts        # エッジのベジェ曲線、矢印、ラベル、ヒットエリア
│   │   │   └── port-renderer.ts        # 接続ポート（ノードごとに4つ）
│   │   │
│   │   ├── interaction/
│   │   │   ├── drag-handler.ts         # ノード+グループ統合ドラッグ
│   │   │   ├── selection-state.ts      # 選択モデル + アウトライン
│   │   │   ├── resize-handles.ts       # 4コーナーハンドル + 4辺境界線リサイズ
│   │   │   ├── edge-creator.ts         # ポート間エッジ作成
│   │   │   ├── edge-reconnect.ts       # エンドポイントドラッグによる再接続
│   │   │   ├── multi-select.ts         # Shift+クリック + マーキー選択
│   │   │   └── keyboard-manager.ts     # キーボードショートカット一元管理
│   │   │
│   │   ├── hierarchy/
│   │   │   ├── group-ops.ts            # assign, remove, descendants, 循環防止ガード
│   │   │   └── membership.ts           # 空間的所属判定の再計算（descendantsも除外）
│   │   │
│   │   ├── commands/
│   │   │   ├── command.ts              # Commandインターフェース + 履歴管理
│   │   │   ├── move-command.ts         # 要素移動
│   │   │   ├── resize-command.ts       # 要素リサイズ
│   │   │   ├── add-remove-command.ts   # 要素の追加/削除
│   │   │   ├── edge-command.ts         # エッジの作成/削除/再接続
│   │   │   └── group-command.ts        # グループ所属 + 折りたたみ
│   │   │
│   │   ├── serialization/
│   │   │   ├── schema.ts              # シーンJSONスキーマ型
│   │   │   ├── serialize.ts           # Registry -> JSON
│   │   │   └── deserialize.ts         # JSON -> engineメソッド呼び出し
│   │   │
│   │   ├── clipboard/
│   │   │   └── clipboard.ts           # コピー/ペースト（IDリマッピング付き）
│   │   │
│   │   └── geometry/
│   │       ├── bezier.ts              # 制御点計算
│   │       ├── anchor.ts             # サイドアンカー、最近接サイド判定
│   │       └── hit-test.ts           # findElementAt、矩形内判定
│   │
│   ├── react/                          # 薄いReactラッパー
│   │   ├── index.ts                    # 再エクスポート
│   │   ├── CanvasProvider.tsx          # Context + エンジンライフサイクル管理
│   │   ├── useCanvas.ts               # Hook: エンジンインスタンスへのアクセス
│   │   └── useCanvasEvent.ts          # Hook: エンジンイベントの購読
│   │
│   ├── App.tsx                         # サンプルアプリ
│   └── main.tsx                        # エントリーポイント
│
├── examples/
│   └── demo-scene.ts                   # シーンデータ + engine APIコール（動作確認用）
│
├── tests/                              # Playwright E2E
└── assets/                             # SVGアイコン
```

**importの使用例:**

```typescript
// 利用側コード
import { createCanvasEngine } from './core';
import type { CanvasEngine, NodeOptions, SceneData } from './core';

const engine = await createCanvasEngine(container, { debug: true });
engine.addNode('n1', { label: 'API Gateway', x: 0, y: 0, width: 140, height: 68 });

// Reactバインディング（内部でcreateCanvasEngine + destroyを管理）
import { CanvasProvider, useCanvas, useCanvasEvent } from './react';
```

---

## コアアーキテクチャ

### 1. ElementRegistry（WeakMap + Map ハイブリッド）

```typescript
class ElementRegistry {
  // 主ストレージ: ID -> レコード（イテレーション、シリアライズ、クエリ用）
  private elements = new Map<string, CanvasElement>();
  private edges = new Map<string, CanvasEdge>();

  // 逆引き: Container -> ID（GC安全、破棄時に自動クリーンアップ）
  private containerToId = new WeakMap<Container, string>();

  // 派生インデックス（mutation時に更新、クエリはO(1)）
  private edgesByNode = new Map<string, Set<string>>();
  private childrenByGroup = new Map<string, Set<string>>();

  addElement(id: string, element: CanvasElement): void;
  removeElement(id: string): void;
  getElement(id: string): CanvasElement | undefined;
  getIdByContainer(container: Container): string | undefined;

  addEdge(id: string, edge: CanvasEdge): void;
  removeEdge(id: string): void;
  reconnectEdge(id: string, endpoint: 'source' | 'target', newNodeId: string, newSide: Side): void;
  getEdge(id: string): CanvasEdge | undefined;

  // O(1)インデックスクエリ
  getEdgesForNode(nodeId: string): readonly CanvasEdge[];
  getChildrenOf(groupId: string): readonly CanvasElement[];
  getAllNodes(): readonly CanvasElement[];
  getAllGroups(): readonly CanvasElement[];

  setParentGroup(childId: string, groupId: string | null): void;
}
```

**ハイブリッドの理由**: `Map`はコマンド、シリアライズ、イベントに必要なID引きを提供する。`WeakMap`はPixiJSのポインターイベント（Containerが渡される）からIDを逆引きするために使用。WeakMapのエントリはContainer破棄時に自動GCされるため、参照が残ってもメモリリークしない。

**二層設計: パブリックAPI vs 内部ホットパス**

現行のホットパス（ドラッグ中のエッジ更新、階層走査、折りたたみ時の可視ancestor検索）はContainer同一性（`===`比較）に強く依存している。`EdgeDisplay`は両端点をContainer参照で保持し（`edge.ts:67`）、`interaction.ts:52`ではContainer集合でエッジをフィルタリングし、`group-hierarchy.ts`はWeakMap<Container, ...>で階層を管理している。

この依存をすべてID引きに置き換えると、ドラッグ中の毎フレームで`Map.get()`が多数発生し、パフォーマンスリスクが生じる。

**方針**: パブリックAPIはIDベース（`engine.moveElement(id, x, y)`）とし、内部のCanvasElement/CanvasEdgeレコードはContainer参照を保持し続ける。PointerイベントのContainer→ID変換は`containerToId` WeakMapで行い、以降はCanvasElementレコードのContainer参照で直接操作する。

```typescript
// パブリックAPI層: IDで受け取る
moveElement(id: string, x: number, y: number): void {
  const element = this.registry.getElement(id);  // Map.get(): O(1)
  // 内部処理: element.containerを直接操作
  element.container.x = x;
  element.container.y = y;
}

// PointerイベントからのブリッジはWeakMapで1回だけ
onPointerDown(container: Container) {
  const id = this.registry.getIdByContainer(container);  // WeakMap.get(): O(1)
  const element = this.registry.getElement(id);
  // 以降はelementレコード経由でContainer参照を使用
}

// ドラッグ中のエッジ更新: Containerを直接使い続ける（ID変換なし）
for (const edge of cachedEdges) {
  updateEdgeGraphics(edge.display, edge.sourceElement.container, edge.targetElement.container);
}
```

この設計により、パブリックAPIのIDベース利点（コマンド、シリアライズ、イベント）と、内部ホットパスのContainer直接参照による低オーバーヘッドを両立する。

**データフロー方向: CanvasElement = モデル、Container = 描画投影**

プロトタイプでは`container.x/y`が位置の真実、`elementSizeMap`がサイズの真実、`container.visible`が可視性の真実であり、モデルと表示が未分離。ドラッグやリコネクションがContainerプロパティを直接書き換え、それが唯一のデータソースになっている。

再設計では`CanvasElement`レコードが唯一の真実（single source of truth）となる:

```
書き込み方向:   API/Command → CanvasElement → Container（projection sync）
読み取り方向:   シリアライズ/イベント ← CanvasElement
              エッジ描画/ヒットテスト ← CanvasElement.container（直接参照）
```

CanvasElementの`x`, `y`, `width`, `height`, `parentGroupId`が正。ContainerのプロパティはCanvasElementから同期される投影であり、直接mutateしない。これによりundo/redo（変更前/後の値をCanvasElementから取得）とserialize（CanvasElementのイテレーション）が自然に成立する。

**同期ルール**: CanvasElement→Container同期は`syncToContainer(element)`ヘルパー1箇所に集約する。各モジュールはCanvasElementのフィールドを更新し、`syncToContainer()`を呼ぶ。Containerのx/y/visible等を直接書き換えない。これにより同期漏れを構造的に防止する。

別途「SceneModel」レイヤーを設ける必要はない — CanvasElementレコード自体がモデルであり、Containerが描画キャッシュの役割を果たす。

**プロトタイプの問題**: `types.ts`で5つのWeakMapがグローバルにexportされている。どのモジュールからも直接mutate可能で、`elementSizeMap`、`groupMetaMap`、`groupParentMap`、`groupChildrenMap`、`nodePortsMap`間の整合性が保証されない。

### 2. RedrawManager（dirty-set、プロファイリング検証付き）

```typescript
class RedrawManager {
  private dirty = new Set<Redrawable>();
  private scheduled = false;

  register(item: Redrawable): void;
  unregister(item: Redrawable): void;
  markDirty(item: Redrawable): void;
  markAllDirty(): void;               // ズーム変更時
  flush(): void;                       // ticker: dirtyセットのみ再描画
}
```

**プロトタイプの問題**: ズーム変更時に2つのO(n)ツリー走査が発生する:
1. `walkRedraw()`（`setup.ts:43-54`）: 全Graphicsの`__redraw`コールバックを呼び出し
2. `updateTextResolutions()`（`setup.ts:19-36`）: 全Textノードのresolutionを更新

200ノード + 80エッジ + 8グループで合計約500以上のオブジェクトを2パスで走査している。dirty-setで`walkRedraw`を最適化しても、`updateTextResolutions`のO(n)走査は残る。

**仮説**: Dirty-setにより実際に変更された要素のみを再描画し、不要な処理を削減する。ズーム時は`markAllDirty()`でwalkRedrawと同等。ドラッグ時は移動した要素とその接続エッジのみmarkDirtyされる。ただし、Text resolution更新は別の最適化が必要（quantizedスケールが変わった場合のみ走査、もしくはRedrawManagerにText更新も統合）。

**検証要件**: Phase 1にプロファイリングチェックポイントを含める。200、500、1000ノードで`performance.measure()`を使い、以下を個別に計測:
- `walkRedraw()` のコスト
- `updateTextResolutions()` のコスト
- 両者を dirty-set / 統合管理に置き換えた場合との比較

dirty-setに測定可能な改善が見られない場合、walkRedraw + frustum culling（ビューポート外の要素をスキップ）にフォールバックする。

### 3. CanvasEngine（単一エントリーポイント）

```typescript
// async factory: 未初期化のエンジンが外に漏れない
async function createCanvasEngine(
  container: HTMLElement,
  options?: EngineOptions,
): Promise<CanvasEngine>;

class CanvasEngine {
  readonly registry: ReadonlyElementRegistry;  // 読み取り専用インターフェース（get系メソッドのみ公開）

  // constructorは非公開。createCanvasEngine()経由で生成
  private constructor();
  destroy(): void;  // idempotent: 複数回呼び出し可

  // 要素CRUD
  addNode(id: string, opts: NodeOptions): void;
  addGroup(id: string, opts: GroupOptions): void;
  addEdge(id: string, opts: EdgeOptions): void;
  removeElement(id: string): void;
  removeEdge(id: string): void;

  // 変更操作（すべてUndo/Redo用のCommandを生成）
  moveElement(id: string, x: number, y: number): void;
  resizeElement(id: string, width: number, height: number): void;
  assignToGroup(childId: string, groupId: string): void;
  removeFromGroup(childId: string): void;
  toggleCollapse(groupId: string): void;

  // 選択
  select(ids: readonly string[]): void;
  selectAll(): void;
  clearSelection(): void;
  getSelection(): readonly string[];

  // Undo/Redo
  undo(): void;
  redo(): void;

  // クリップボード
  copy(): void;
  paste(): void;
  duplicate(): void;

  // シリアライズ
  serialize(): SceneData;
  deserialize(data: SceneData): void;

  // ビュー制御
  setZoom(scale: number): void;
  centerOn(x: number, y: number): void;
  fitToContent(padding?: number): void;

  // エクスポート
  toDataURL(type?: 'image/png' | 'image/jpeg'): string;

  // イベント
  on<E extends CanvasEventName>(
    event: E,
    handler: (data: CanvasEventMap[E]) => void,
  ): () => void;  // unsubscribe関数を返す
}

type CanvasEventMap = {
  'element:select': { ids: readonly string[] };
  'element:deselect': { ids: readonly string[] };
  'element:move': { id: string; x: number; y: number };
  'element:resize': { id: string; width: number; height: number };
  'edge:create': { id: string };
  'edge:delete': { id: string };
  'edge:reconnect': { id: string; endpoint: 'source' | 'target'; newNodeId: string; newSide: Side };
  'group:collapse': { id: string };
  'group:expand': { id: string };
  'group:membership': { childId: string; oldGroupId: string | null; newGroupId: string | null };
  'history:change': { canUndo: boolean; canRedo: boolean };
  'selection:change': { selectedIds: readonly string[] };
};
```

### 4. Command Pattern（Undo/Redo）

```typescript
interface Command {
  readonly type: string;
  execute(): void;
  undo(): void;
  merge?(other: Command): Command | null;  // 連続ドラッグを1ステップに統合
}

class CommandHistory {
  execute(command: Command): void;
  undo(): void;
  redo(): void;
  batch(commands: readonly Command[]): void;  // 複数コマンドを1つのundo単位にグループ化
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  clear(): void;
}
```

**Command経由する操作（undoable）:**

| 操作 | Command type |
|------|-------------|
| ノード/グループ/エッジの追加・削除 | AddRemoveCommand |
| 要素の移動 | MoveCommand |
| 要素のリサイズ | ResizeCommand |
| エッジの作成・削除・再接続 | EdgeCommand |
| グループ所属変更・折りたたみ | GroupCommand |
| ペースト・複製 | BatchCommand (AddRemove × N) |

**Command不要な操作（undoしない）:**

| 操作 | 理由 |
|------|------|
| setZoom, centerOn, fitToContent | ビュー変更はデータ変更ではない |
| select, clearSelection, selectAll | 選択状態はundo対象外 |
| serialize, deserialize | データI/O |

**merge()の条件**: 同一Command type + 同一要素ID + 同一pointerdown〜pointerupセッション内。ドラッグ開始時にsessionIdを発行し、merge()は`other.sessionId === this.sessionId`のときのみ統合する。pointerupでsessionを終了し、以降のCommandはmergeされない。

**deserializeとCommand履歴**: `deserialize()`はengine内部でCommand生成をバイパスし、Registryに直接書き込む。undo履歴はdeserialize後に`history.clear()`でリセットされる。`addNode()`等のパブリックAPIを内部的に呼ぶが、内部フラグ（`suppressCommands`）でCommand生成をスキップする。

### 5. シリアライズスキーマ

```typescript
interface SceneData {
  readonly version: 1;
  readonly nodes: readonly SerializedNode[];
  readonly groups: readonly SerializedGroup[];
  readonly edges: readonly SerializedEdge[];
  readonly groupMemberships: readonly { childId: string; groupId: string }[];
  readonly viewport?: { x: number; y: number; zoom: number };
}
```

`serialize()`はElementRegistryからJSONを生成する。`deserialize()`はJSONからengine内部APIを呼び出してシーンを復元する��Command生成をバイパスし、完了後にhistory.clear()）。

**バージョンマイグレーション**: `version`フィールドでスキーマ世代を管理。`deserialize()`はversionを確認し、古いスキーマには対応するマイグレーション関数（`migrateV1toV2`等）を適用してから読み込む。マイグレーション関数は`serialization/`ディレクトリに配置。

### 6. 階層不変条件

プロトタイプには2つの正確性バグがある。再設計で`group-ops.ts`に不変条件を組み込む。

**循環防止ガード**

```typescript
// group-ops.ts
function canAssign(childId: string, groupId: string, registry: ElementRegistry): boolean {
  // 自分自身への代入を禁止
  if (childId === groupId) return false;
  // groupIdがchildIdの子孫であれば循環になる
  return !isDescendantOf(groupId, childId, registry);
}

function assignToGroup(childId: string, groupId: string, registry: ElementRegistry): void {
  if (!canAssign(childId, groupId, registry)) return;  // 静かに拒否
  // ... 代入処理
}
```

`membership.ts`のreconciliationでも、グループ要素の候補リストから自身 **および** 全子孫を除外する（プロトタイプでは自身のみ除外されていたバグを修正）。

**可視性の派生計算**

プロトタイプでは`desc.visible = !meta.collapsed`で全子孫に一括代入しており（`group.ts:172-174`）、ネスト時に子グループの折りたたみ状態が破壊される。再設計では可視性をContainerに直接代入せず、祖先チェーンから派生計算する。

```typescript
// group-ops.ts
function isVisible(elementId: string, registry: ElementRegistry): boolean {
  let currentId: string | null = registry.getElement(elementId)?.parentGroupId ?? null;
  while (currentId) {
    const group = registry.getElement(currentId);
    if (!group?.groupMeta || group.groupMeta.collapsed) return false;
    currentId = group.parentGroupId;
  }
  return true;
}
```

`toggleCollapse()`実行時に、対象グループの子孫ツリーをtop-downで1パス走査し、親の可視性結果を子に伝播させる（O(n)、nは子孫数）。各要素について祖先チェーンを個別にルートまで走査する方式（O(d×n)）は避ける。ネスト深度は現行で2-3層だが、top-downなら深度に依存しない。

- 親Aが折りたたまれると、A配下は全て非表示
- 親Aが展開されると、子グループBが自身折りたたみ中なら、Bは表示されるがBの子は非表示のまま

### 7. ライフサイクル契約

**入力リスナーの一元管理**

プロトタイプでは`SelectionManager`のwindow keydownリスナーがcleanup登録されていない（`demo-scene.ts:100`で生成後に`selection.destroy()`が呼ばれない）。再設計では:

- `keyboard-manager.ts`が全キーボードイベントを一元管理。個別モジュールが`window.addEventListener`を直接呼ばない
- `CanvasEngine.destroy()`が全リスナー（keyboard-manager、viewport、pointer events）を確実にクリーンアップ

**StrictMode対応とidempotentライフサイクル**

プロトタイプは`main.tsx:4`でStrictModeを明示的に無効化している。再設計では`createCanvasEngine()` async factoryパターンで二重mount/unmountに耐える契約を持つ:

- `createCanvasEngine()`がPromise<CanvasEngine>を返す。初期化完了まで未初期化のエンジンが外に漏れない
- `destroy()`はidempotent（複数回呼び出し可、二回目以降はno-op）
- 初期化中にAbortSignalで中断可能: `createCanvasEngine(container, { signal: ac.signal })`

```typescript
// Reactラッパーでの使用パターン
useEffect(() => {
  const ac = new AbortController();
  let engine: CanvasEngine | undefined;

  createCanvasEngine(container, { signal: ac.signal }).then((e) => {
    engine = e;
  });

  return () => {
    ac.abort();           // 初期化中なら中断
    engine?.destroy();    // 完了済みならクリーンアップ（idempotent）
  };
}, []);
```

これはReactラッパー（Phase 5）の前提条件であり、Phase 0で実装する。

### 8. 診断・テスタビリティ

プロトタイプでは`preserveDrawingBuffer: true`、FPSオーバーレイ、`window.__PIXI_APP__`が常時有効。再設計ではEngineOptionsで分離する:

```typescript
interface EngineOptions {
  // ... 既存オプション
  readonly debug?: boolean;   // FPSオーバーレイ、__PIXI_APP__公開、pixel readback有効化
  readonly signal?: AbortSignal;  // 初期化中断用（StrictMode二重mount対応）
}
```

`debug: true`の場合のみ:
- `preserveDrawingBuffer: true`を有効化（テストでのスクリーンショット取得用）
- FPSカウンターを表示
- `window.__PIXI_APP__`を公開
- テスト用のクエリAPI（`engine.getElementAt(x, y)`等）を有効化

本番環境ではこれらが無効になり、パフォーマンスへの不要な影響を排除する。

---

## プロダクション機能

### スコープ内

| 機能 | 配置場所 | 説明 |
|------|----------|------|
| Undo/Redo | `commands/` | Commandパターン。ドラッグにmerge()、複数削除にbatch() |
| 複数選択 | `interaction/multi-select.ts` | Shift+クリックで追加/削除、マーキー矩形選択 |
| シリアライズ | `serialization/` | バージョン付きスキーマでJSONの保存/読み込み |
| クリップボード | `clipboard/clipboard.ts` | IDリマッピング付きコピー/ペースト/複製、オフセット配置 |
| キーボードショートカット | `interaction/keyboard-manager.ts` | 一元管理レジストリ、発見可能、カスタマイズ可能 |
| グリッドスナップ | `engine.ts` + `drag-handler.ts` | EngineOptionsでオプションの`gridSize`指定 |
| PNG出力 | `engine.ts` | PixiJS `renderer.extract.canvas()`経由。`preserveDrawingBuffer`不要（extractはフレームバッファから直接読み取る） |
| イベントシステム | `engine.ts` | フレームワーク統合のための型付きイベント |

**デフォルトキーボードショートカット:**
- `Delete` / `Backspace`: 選択を削除
- `Escape`: 現在の操作をキャンセル、選択を解除
- `Ctrl+Z` / `Cmd+Z`: 元に戻す
- `Ctrl+Shift+Z` / `Cmd+Shift+Z`: やり直す
- `Ctrl+C` / `Cmd+C`: コピー
- `Ctrl+V` / `Cmd+V`: ペースト
- `Ctrl+D` / `Cmd+D`: 複製
- `Ctrl+A` / `Cmd+A`: 全選択

### スコープ外（明示的に除外）

| 機能 | 除外理由 |
|------|----------|
| SVGエクスポート | PixiJSはWebGLベースであり、SVGには別のレンダリングパイプラインが必要 |
| ミニマップ | 複雑度が大きい（セカンダリレンダラーが必要）。後続タスクとして実施 |
| 整列ガイド | リアルタイムの最近接エッジ計算に空間インデックスが必要 |
| 共同編集 | CRDT/OTインフラが必要。異なる問題領域 |

---

## パフォーマンス戦略

**現状**: 開発中にFPSが約120から約60に劣化。プロファイリングデータは存在しない。

**方針**: まず計測し、エビデンスに基づいて最適化する。

| 懸念事項 | 仮説 | 検証方法 |
|---------|------|---------|
| ズーム時のwalkRedraw O(n) | Dirty-setで処理量を削減 | Phase 1: 200/500/1000ノードで`performance.measure()`比較 |
| ズーム時のupdateTextResolutions O(n) | RedrawManagerにText更新を統合、またはquantized scale変化時のみ走査 | walkRedrawとは独立して計測し、ボトルネック寄与度を特定 |
| ドラッグ中のエッジ検索 | `edgesByNode`インデックスでfilterを除去 | O(1)インデックス vs O(n)フィルターを比較 |
| 非表示要素の再描画 | Dirty-setで非表示をスキップ | フレームあたりのスキップ数を計測 |
| Graphics.clear()の頻度 | Dirtyチェックで変更なしをスキップ | clear+再描画のコストを計測 |

**フォールバック計画**: dirty-setがwalkRedrawに対して測定可能な改善を示さない場合、既存のwalkRedrawパターンにfrustum culling（`viewport.getVisibleBounds()`外の要素をスキップ）を追加する。

**プロファイリング手法**:
1. 再描画パスの前後で`performance.mark()` / `performance.measure()`を使用
2. Chrome DevTools Performanceパネルでの記録
3. ズーム、パン、ドラッグ操作を200、500、1000ノードでテスト
4. 各ノード数でのアイドルFPS、ズームFPS、ドラッグFPSを報告

---

## 実装フェーズ

### Phase 0: スキャフォールディング
**目標**: 新構造がコンパイルされる。空のキャンバスがパン/ズームで動作する。idempotentライフサイクルが成立する。

- `src/canvas/`を`prototype/`にコピー
- ディレクトリ構造を作成
- `src/core/types.ts`: 全パブリック型定義
- `src/core/geometry/`: bezier, anchor, hit-testを移植（純粋関数）
- `src/core/viewport/viewport-setup.ts`: パラメータ化された初期化（グローバルviewStateなし）
- スタブの`engine.ts` + `index.ts`
- `CanvasEngine`のidempotentライフサイクル: async `init()`、idempotent `destroy()`、AbortControllerによる初期化中断
- `src/App.tsx`が新エンジン経由で空のキャンバスを描画

**検証**: `npm run build`がパスする。`npm run dev`でパン/ズーム可能な空のキャンバスが表示される。StrictMode有効でも二重mount/unmountで正常動作する。

### Phase 1: Registry + レンダリング
**目標**: 静的シーンが描画される。ノード、グループ、エッジが表示（インタラクションなし）。

- `registry/element-registry.ts` + `registry/edge-index.ts`
- `elements/node-renderer.ts`, `group-renderer.ts`, `edge-renderer.ts`, `port-renderer.ts`
- `viewport/redraw-manager.ts` + `viewport/zoom-handler.ts`
- エンジンCRUDメソッドの接続
- `examples/demo-scene.ts`: シーンデータ + engine APIコール（動作確認用、src/外）

**検証**: 200ノード、8グループ、80エッジが描画される。Zoom-invariantストロークが機能する。**プロファイリングチェックポイント**: walkRedraw vs dirty-setの比較。

### Phase 2: Command基盤 + コアインタラクション
**目標**: ドラッグ、選択、リサイズ、選択解除がプロトタイプの動作と一致する。**最初からCommand経由で実装**し、Phase 4での大規模改修を回避する。

- `commands/command.ts`: Commandインターフェース + CommandHistory
- `commands/move-command.ts`, `resize-command.ts`, `group-command.ts`
- `interaction/selection-state.ts`: Set<string>モデル + アウトライン（選択操作はCommand不要）
- `interaction/drag-handler.ts`: registryベースのドラッグ → MoveCommand生成
- `interaction/resize-handles.ts`: 4コーナーハンドル + 4辺境界線（透明ヒットエリア） → ResizeCommand生成。上下左右のリサイズは個別のアンカーポイントではなく、辺に沿った透明な境界線をドラッグして行う
- `interaction/keyboard-manager.ts`: キーボードショートカット一元管理
- `hierarchy/group-ops.ts`（循環防止ガード付き）+ `hierarchy/membership.ts`
- グループの折りたたみ/展開 → GroupCommand生成、空領域クリックでの選択解除

**検証**: クリック→選択、ドラッグ→移動、リサイズ、グループ折りたたみ。**Ctrl+Zで移動/リサイズがundoされる**。Playwright: `render-verification`, `node-resize`, `group-layer`テストがパス。

### Phase 3: エッジインタラクション
**目標**: エッジ作成、選択、再接続、削除。Command経由。

- `commands/edge-command.ts`, `add-remove-command.ts`
- `interaction/edge-creator.ts`: ポート間エッジ作成 → EdgeCommand生成
- `interaction/edge-reconnect.ts`: エンドポイントドラッグ → EdgeCommand生成

**検証**: ポートドラッグ→エッジ作成。エッジクリック→選択。エンドポイントドラッグ→再接続。Deleteキー→削除。**Ctrl+Zでエッジ操作がundoされる**。Playwright: `edge-creation`, `edge-design`テストがパス。

### Phase 4: 複数選択 + シリアライズ + クリップボード
**目標**: 複数選択、シリアライズ、クリップボード。（Command基盤はPhase 2で完了済み）

- `interaction/multi-select.ts`: Shift+クリック + マーキー選択
- `serialization/`: スキーマ、serialize、deserialize（Command生成をバイパス、完了後にhistory.clear()）
- `clipboard/clipboard.ts`: コピー/ペースト/複製（BatchCommand）

**検証**: Shift+クリックで複数選択。ドラッグで複数要素が一括移動。`serialize()`→JSON→`deserialize()`のラウンドトリップ（undo履歴が汚染されない）。Ctrl+C/Vがオフセット付きで動作。新規Playwrightテスト。

### Phase 5: Reactラッパー + 仕上げ
**目標**: Reactバインディング。完全なサンプルアプリ。パフォーマンス検証。

- `react/`: CanvasProvider, useCanvas, useCanvasEvent
- `App.tsx`をReactバインディングで書き直し
- `engine.toDataURL()`によるPNG出力
- グリッドスナップ実装
- 200/500/1000ノードでの最終プロファイリング
- 29以上のPlaywrightテスト全パス

**検証**: ホットリロードでリソースリークなし。全テストグリーン。FPS数値を文書化。

---

## 主要な設計判断

| 判断 | 根拠 |
|------|------|
| **WeakMap + Map ハイブリッド** | Mapでコマンド・シリアライズ・イベントに必要なID引きを提供。WeakMapでContainer→IDの逆引き（GC安全）。プロトタイプのGC利点を維持しつつイテレーションとIDベースアクセスを追加 |
| **IDベースのパブリックAPI / 内部Container参照** | パブリックAPIはIDベース（コマンド、シリアライズ、イベント、外部state manager連携）。内部ホットパス（ドラッグ中のエッジ更新、階層走査）はCanvasElementレコード内のContainer参照を直接使用し、毎フレームのID→Container変換を回避 |
| **イベント駆動** | `on('element:move', handler)`でエンジンとUIフレームワークを分離。Reactラッパーもvanilla JSも同じ方法で購読 |
| **グローバル状態なし** | viewStateシングルトンをエンジンインスタンスごとの状態に置換。複数キャンバスの併存が可能に |
| **Renderer / Interaction 分離** | 描画ロジック（elements/）と入力処理（interaction/）を別ディレクトリに配置。変更頻度が異なり、テスト戦略も異なる |
| **フォールバック付きdirty-set** | walkRedrawよりアーキテクチャ的にクリーンだが、パフォーマンスは未証明。明示的なプロファイリングチェックポイントとwalkRedrawフォールバック計画を含む |
| **全変更操作にCommand適用** | Undo/Redoを後付けしない。Phase 2からすべてのデータ変更操作がCommandを経由する。merge()で連続ドラッグを処理。ビュー/選択操作はCommand不要 |

---

## パブリックAPIの契約

### エラーハンドリング方針

| ケース | 挙動 |
|--------|------|
| 存在しないID | throw（開発者のバグ。IDはエンジンが生成/管理するもので、typoは即座に検出すべき） |
| 不正な操作（循環代入、自己ループエッジ等） | 静かに拒否（no-op）。ユーザー操作の結果として自然に発生しうるため |
| 内部不整合（Registryインデックスの矛盾等） | `console.error` + 可能なら自動復旧。不可能なら throw |

### イベント配信ルール

- **タイミング**: Command.execute() **完了後**に同期配信。ハンドラー内でRegistryを読むと更新済みの状態が見える
- **batch内**: 個別Commandごとには配信しない。batch全体の完了後にまとめて配信
- **undo/redo**: 逆操作の完了後に同じイベントを配信（例: undoでMoveCommandが戻ると `element:move` が発火）
- **deserialize**: イベントを配信しない（大量のイベントが不要に発火するのを防止）

---

## ファイルサイズ目標

- **< 80行**: geometry/, hierarchy/, serialization/schema.ts
- **< 150行**: registry/, viewport/, commands/, clipboard/
- **< 200行**: elements/, interaction/
- **< 250行**: engine.ts
- **< 30行**: index.tsバレルファイル

合計: 約39ファイル、約4,250行（プロトタイプの1.5倍。Undo/Redo、複数選択、シリアライズ、クリップボード、Commandパターンを含む）。

---

## リスク評価

| リスクレベル | 領域 | 軽減策 |
|------------|------|--------|
| **低** | ジオメトリ（bezier, anchor, hit-test） | 純粋関数、プロトタイプからの直接移植 |
| **低** | ノード/グループ/エッジのレンダリング | 同じPixiJS API、パラメータ化 |
| **低** | グループ階層操作 | 同じアルゴリズム |
| **中** | WeakMap置換のElementRegistry | 異なる構造、同じセマンティクス。既存E2Eテストで検証 |
| **中** | selection.tsの分解 | エッジケースの保持が必要: 折りたたみグループ内のエンドポイント表示、ノード/エッジ選択の排他制御 |
| **中** | examples/demo-scene.tsの書き直し | Playwrightスクリーンショット比較で同一の表示結果が必要 |
| **中** | 可視性の派生計算 | 現行の`visible`直接代入から祖先チェーン派生に変更。ネストされたグループの折りたたみ/展開の全組み合わせテストが必要 |
| **高→中** | Commandパターンの適用 | Phase 2から組み込むことでPhase 4での大規模改修を回避。ただし全データ変更パスがCommand経由であることの監査は必要 |
| **高** | 複数選択 | ドラッグ、リサイズ、削除、コピーに影響。ノード+グループ+エッジの混合選択に注意が必要 |
| **高** | Dirty-set再描画 | パフォーマンス仮説が未証明。walkRedraw + frustum cullingへのフォールバックあり |

---

## 検証

- `npm run build` — 型エラーゼロ
- `npm run dev` — 200ノード、80エッジ、8グループが描画・操作可能
- 全Playwrightテストがパス（新構造に適応済み）
- パフォーマンス: 200/500/1000ノードでのFPSを文書化（アイドル、ズーム、ドラッグ）
- バンドルサイズ: core < 50KB gzipped（PixiJSはpeer dependency）
- `any`型なし、根拠のない`as`アサーションなし
