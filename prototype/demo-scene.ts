import { Assets, Container, Graphics, Texture } from "pixi.js";
import type { CanvasContext } from "./setup";
import { createNode, resizeNode } from "./node";
import { resizeGroup } from "./group";
import {
  createEdge,
  removeEdge,
  updateEdge,
  getNearestSide,
  type EdgeDisplay,
} from "./edge";
import { createGroup, type GroupData } from "./group";
import {
  enableItemDrag,
  enableEdgeClick,
  enableDeselectOnEmptyClick,
} from "./interaction";
import { SelectionManager } from "./selection";
import { EdgeCreator } from "./edge-creator";
import { attachConnectionPorts } from "./node-ports";
import { PROTOCOL_LABELS, getElementRect, groupMetaMap, elementSizeMap } from "./types";
import { assignToGroup, removeFromGroup, getParentGroup, findGroupAt, isInsideGroup } from "./group-hierarchy";
import { viewState } from "./view-state";

import computeIcon from "../assets/icons/compute.svg";
import databaseIcon from "../assets/icons/database.svg";
import storageIcon from "../assets/icons/storage.svg";
import loadbalancerIcon from "../assets/icons/loadbalancer.svg";

const NODE_W = 140;
const NODE_H = 68;
const COLS = 14;
const GAP_X = 180;
const GAP_Y = 120;
const NODE_COUNT = 200;

const ICON_PATHS = [computeIcon, databaseIcon, storageIcon, loadbalancerIcon];
const NODE_COLORS = [0x2d3748, 0x2c3e50, 0x1a365d, 0x2d2d3f];

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LABELS = [
  "API Gateway", "Auth Service", "User DB", "Cache", "Queue",
  "Worker", "CDN", "DNS", "Proxy", "Scheduler",
  "Logger", "Monitor", "Config", "Storage", "Backup",
  "Metrics", "Alerts", "Registry", "Secrets", "Mesh",
];

const GROUP_DEFS: GroupData[] = [
  { id: "g-frontend", label: "Frontend", x: 20, y: 20, width: 560, height: 380, color: 0x3182ce },
  { id: "g-backend", label: "Backend Services", x: 600, y: 20, width: 920, height: 380, color: 0x38a169 },
  { id: "g-data", label: "Data Layer", x: 20, y: 420, width: 560, height: 380, color: 0xd69e2e },
  { id: "g-infra", label: "Infrastructure", x: 600, y: 420, width: 920, height: 380, color: 0x805ad5 },
  { id: "g-monitoring", label: "Monitoring", x: 20, y: 820, width: 740, height: 380, color: 0xe53e3e },
  { id: "g-security", label: "Security", x: 780, y: 820, width: 740, height: 380, color: 0xdd6b20 },
  { id: "g-vpc", label: "VPC", x: 40, y: 50, width: 500, height: 320, color: 0x2b6cb0 },
  { id: "g-subnet", label: "Public Subnet", x: 60, y: 80, width: 220, height: 230, color: 0x4299e1 },
];

// Nested group relationships (parent → child)
const GROUP_NESTING: [string, string][] = [
  ["g-frontend", "g-vpc"],
  ["g-vpc", "g-subnet"],
];

export async function buildDemoScene(
  ctx: CanvasContext,
  signal?: AbortSignal,
): Promise<void> {
  const { app, viewport } = ctx;

  const textures: Texture[] = await Promise.all(
    ICON_PATHS.map((path) => Assets.load<Texture>(path)),
  );

  if (signal?.aborted) return;

  const allEdges: EdgeDisplay[] = [];
  const groupContainers: Container[] = [];

  const edgeLineLayer = new Container();
  edgeLineLayer.label = "edge-line-layer";

  const edgeLabelLayer = new Container();
  edgeLabelLayer.label = "edge-label-layer";

  const ghostLayer = new Container();
  ghostLayer.label = "ghost-edge-layer";

  const selectionLayer = new Container();
  selectionLayer.label = "selection-layer";
  const selection = new SelectionManager(selectionLayer, viewport);
  ctx.addCleanup(() => selection.destroy());

  const groupDropHighlight = new Graphics();
  groupDropHighlight.visible = false;
  ghostLayer.addChild(groupDropHighlight);
  let highlightedGroup: Container | null = null;
  const groupHighlight = {
    show: (group: Container) => {
      if (group === highlightedGroup) return;
      highlightedGroup = group;
      const meta = groupMetaMap.get(group);
      const size = elementSizeMap.get(group);
      if (!meta || !size) return;
      groupDropHighlight.clear();
      const pad = 2 / viewState.scale;
      groupDropHighlight.roundRect(
        group.x - pad, group.y - pad,
        size.width + pad * 2, size.height + pad * 2, 14,
      );
      groupDropHighlight.fill({ color: meta.color, alpha: 0.08 });
      groupDropHighlight.stroke({
        width: 3 / viewState.scale,
        color: meta.color,
        alpha: 0.9,
      });
      groupDropHighlight.visible = true;
    },
    hide: () => {
      if (!highlightedGroup) return;
      highlightedGroup = null;
      groupDropHighlight.clear();
      groupDropHighlight.visible = false;
    },
  };

  // All draggable items (nodes + groups) — used for unified membership reconciliation
  const allItems: Container[] = [];

  // Re-evaluate group membership for all items (nodes and sub-groups)
  const reconcileMembership = () => {
    for (const item of allItems) {
      const sz = elementSizeMap.get(item);
      if (!sz) continue;
      const cx = item.x + sz.width / 2;
      const cy = item.y + sz.height / 2;
      // For groups, exclude self and descendants from candidates
      const isGrp = groupMetaMap.has(item);
      const candidates = isGrp
        ? groupContainers.filter((g) => g !== item)
        : groupContainers;
      const target = findGroupAt(candidates, cx, cy);
      const current = getParentGroup(item);

      if (target && target !== current) {
        assignToGroup(item, target);
      } else if (!target && current) {
        removeFromGroup(item);
      }
    }
  };

  // Highlight items inside a resizing group's boundary
  const memberHighlight = new Graphics();
  memberHighlight.visible = false;
  ghostLayer.addChild(memberHighlight);

  const highlightMembers = (group: Container) => {
    const meta = groupMetaMap.get(group);
    memberHighlight.clear();
    let hasHighlights = false;
    for (const item of allItems) {
      if (item === group) continue;
      if (isInsideGroup(item, group)) {
        const sz = elementSizeMap.get(item);
        if (!sz) continue;
        hasHighlights = true;
        const p = 2 / viewState.scale;
        const r = groupMetaMap.has(item) ? 12 : 10;
        memberHighlight.roundRect(
          item.x - p, item.y - p,
          sz.width + p * 2, sz.height + p * 2, r,
        );
        memberHighlight.stroke({
          width: 1.5 / viewState.scale,
          color: meta?.color ?? 0x3b82f6,
          alpha: 0.6,
        });
      }
    }
    memberHighlight.visible = hasHighlights;
  };

  selection.setResizeHandler((container, x, y, width, height) => {
    container.x = x;
    container.y = y;

    if (groupMetaMap.has(container)) {
      resizeGroup(container, width, height);
      highlightMembers(container);
    } else {
      resizeNode(container, width, height);
      memberHighlight.visible = false;
    }

    const related = allEdges.filter(
      (e) => e.sourceNode === container || e.targetNode === container,
    );
    for (const edge of related) {
      updateEdge(edge);
    }
  }, () => {
    memberHighlight.clear();
    memberHighlight.visible = false;
    reconcileMembership();
  });

  selection.setDeleteEdgeHandler((edge) => {
    const idx = allEdges.indexOf(edge);
    if (idx >= 0) allEdges.splice(idx, 1);
    removeEdge(edge);
  });

  const nodeContainers: Container[] = [];
  const edgeCreator = new EdgeCreator(
    ghostLayer,
    viewport,
    () => nodeContainers,
    ({ source, sourceSide, target, targetSide }) => {
      const edge = createEdge(
        {
          id: `edge-user-${allEdges.length}`,
          sourceNode: source,
          sourceSide,
          targetNode: target,
          targetSide,
          label: undefined,
        },
        edgeLineLayer,
        edgeLabelLayer,
      );
      allEdges.push(edge);
      enableEdgeClick(edge, selection);
    },
  );
  const cleanupEdgeCreator = edgeCreator.bindCanvasEvents(app.canvas as HTMLCanvasElement);
  ctx.addCleanup(cleanupEdgeCreator);

  // Create groups
  const groupById = new Map<string, Container>();
  for (const gDef of GROUP_DEFS) {
    const group = createGroup(gDef, () => {
      for (const edge of allEdges) {
        updateEdge(edge);
      }
    });
    viewport.addChild(group);
    groupContainers.push(group);
    groupById.set(gDef.id, group);
  }

  // Edge lines above groups so edges are clickable over group backgrounds
  viewport.addChild(edgeLineLayer);

  // Set up nested group relationships
  for (const [parentId, childId] of GROUP_NESTING) {
    const parent = groupById.get(parentId);
    const child = groupById.get(childId);
    if (parent && child) {
      assignToGroup(child, parent);
    }
  }

  // Create nodes
  for (let i = 0; i < NODE_COUNT; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = 80 + col * GAP_X;
    const y = 60 + row * GAP_Y;

    const node = createNode({
      id: `node-${i}`,
      label: LABELS[i % LABELS.length]!,
      x,
      y,
      width: NODE_W,
      height: NODE_H,
      icon: textures[i % textures.length],
      color: NODE_COLORS[i % NODE_COLORS.length],
    });

    viewport.addChild(node);
    nodeContainers.push(node);

    // Assign node to deepest group that contains its center
    const cx = x + NODE_W / 2;
    const cy = y + NODE_H / 2;
    const targetGroup = findGroupAt(groupContainers, cx, cy);
    if (targetGroup) {
      assignToGroup(node, targetGroup);
    }
  }

  // Create edges
  const EDGE_COUNT = 80;
  const rand = mulberry32(42);
  for (let i = 0; i < EDGE_COUNT; i++) {
    const srcIdx = Math.floor(rand() * NODE_COUNT);
    let tgtIdx = Math.floor(rand() * NODE_COUNT);
    if (tgtIdx === srcIdx) tgtIdx = (srcIdx + 1) % NODE_COUNT;

    const src = nodeContainers[srcIdx]!;
    const tgt = nodeContainers[tgtIdx]!;

    const protocols = [...PROTOCOL_LABELS, ""] as const;
    const label = protocols[i % protocols.length];

    const srcRect = getElementRect(src);
    const tgtRect = getElementRect(tgt);
    const srcCenter = {
      x: srcRect.x + srcRect.width / 2,
      y: srcRect.y + srcRect.height / 2,
    };
    const tgtCenter = {
      x: tgtRect.x + tgtRect.width / 2,
      y: tgtRect.y + tgtRect.height / 2,
    };
    const sourceSide = getNearestSide(srcRect, tgtCenter);
    const targetSide = getNearestSide(tgtRect, srcCenter);

    const edge = createEdge(
      { id: `edge-${i}`, sourceNode: src, sourceSide, targetNode: tgt, targetSide, label: label || undefined },
      edgeLineLayer,
      edgeLabelLayer,
    );
    allEdges.push(edge);
    enableEdgeClick(edge, selection);
  }

  // Populate unified item list for membership reconciliation
  allItems.push(...groupContainers, ...nodeContainers);

  selection.setReconnectDeps(() => nodeContainers);

  const dragCtx = { viewport, edges: allEdges, selection, allGroups: groupContainers, groupHighlight };

  for (const node of nodeContainers) {
    enableItemDrag(node, dragCtx);
    attachConnectionPorts(node, edgeCreator);
  }

  for (const group of groupContainers) {
    enableItemDrag(group, dragCtx);
  }

  enableDeselectOnEmptyClick(viewport, selection);

  // Z-order: edge lines → groups → nodes → edge labels → ghost → selection
  viewport.addChild(edgeLabelLayer);
  viewport.addChild(ghostLayer);
  viewport.addChild(selectionLayer);

  viewport.setZoom(0.6);
  viewport.moveCenter(
    (COLS * GAP_X) / 2,
    (Math.ceil(NODE_COUNT / COLS) * GAP_Y) / 2,
  );
}
