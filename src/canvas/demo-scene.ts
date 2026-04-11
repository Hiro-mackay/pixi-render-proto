import { Assets, Container, Texture } from "pixi.js";
import type { CanvasContext } from "./setup";
import { createNode, resizeNode } from "./node";
import { createEdge, updateEdge, type EdgeDisplay } from "./edge";
import { createGroup, type GroupData } from "./group";
import {
  enableDrag,
  enableEdgeClick,
  enableGroupDrag,
  enableDeselectOnEmptyClick,
} from "./interaction";
import { SelectionManager } from "./selection";
import { EdgeCreator } from "./edge-creator";
import { attachConnectionPorts } from "./node-ports";
import { PROTOCOL_LABELS } from "./types";

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

// Deterministic PRNG (mulberry32) so the demo scene is reproducible across reloads
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
  const groupChildMap: Map<Container, Container[]> = new Map();

  const edgeLineLayer = new Container();
  edgeLineLayer.label = "edge-line-layer";
  viewport.addChild(edgeLineLayer);

  const edgeLabelLayer = new Container();
  edgeLabelLayer.label = "edge-label-layer";

  const ghostLayer = new Container();
  ghostLayer.label = "ghost-edge-layer";

  const selectionLayer = new Container();
  selectionLayer.label = "selection-layer";
  const selection = new SelectionManager(selectionLayer, viewport);

  selection.setResizeHandler((node, x, y, width, height) => {
    node.x = x;
    node.y = y;
    resizeNode(node, width, height);

    const related = allEdges.filter(
      (e) => e.sourceNode === node || e.targetNode === node,
    );
    for (const edge of related) {
      updateEdge(edge);
    }
  });

  const nodeContainers: Container[] = [];
  const edgeCreator = new EdgeCreator(
    ghostLayer,
    viewport,
    () => nodeContainers,
    ({ source, target, targetPos }) => {
      const edge = createEdge(
        {
          id: `edge-user-${allEdges.length}`,
          sourceNode: source,
          targetNode: target ?? undefined,
          targetPos: targetPos ?? undefined,
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

  for (const gDef of GROUP_DEFS) {
    const group = createGroup(gDef);
    viewport.addChild(group);
    groupContainers.push(group);
    groupChildMap.set(group, []);
  }

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

    const groupIndex = Math.floor(i / (NODE_COUNT / GROUP_DEFS.length));
    const assignedGroup = groupContainers[Math.min(groupIndex, groupContainers.length - 1)];
    if (assignedGroup) {
      groupChildMap.get(assignedGroup)?.push(node);
    }
  }

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

    const edge = createEdge(
      { id: `edge-${i}`, sourceNode: src, targetNode: tgt, label: label || undefined },
      edgeLineLayer,
      edgeLabelLayer,
    );
    allEdges.push(edge);
    enableEdgeClick(edge, selection);
  }

  for (const node of nodeContainers) {
    enableDrag(node, viewport, allEdges, selection);
    attachConnectionPorts(node, edgeCreator);
  }

  for (const group of groupContainers) {
    const children = groupChildMap.get(group) ?? [];
    enableGroupDrag(group, children, viewport, allEdges, selection);
  }

  enableDeselectOnEmptyClick(viewport, selection);

  // Z-order: edge lines → groups → nodes → edge labels → ghost → selection
  viewport.addChild(edgeLabelLayer);
  viewport.addChild(ghostLayer);
  viewport.addChild(selectionLayer);

  // Order matters: setZoom first, then moveCenter (so moveCenter uses the
  // new scale to compute viewport translation correctly).
  viewport.setZoom(0.6);
  viewport.moveCenter(
    (COLS * GAP_X) / 2,
    (Math.ceil(NODE_COUNT / COLS) * GAP_Y) / 2,
  );
}
