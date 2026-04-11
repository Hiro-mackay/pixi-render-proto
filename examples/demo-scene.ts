import { Assets, Texture } from "pixi.js";
import type { CanvasEngine, Side } from "../src/core";

import computeIcon from "../src/assets/icons/compute.svg";
import databaseIcon from "../src/assets/icons/database.svg";
import storageIcon from "../src/assets/icons/storage.svg";
import loadbalancerIcon from "../src/assets/icons/loadbalancer.svg";

const NODE_W = 140;
const NODE_H = 68;
const COLS = 14;
const GAP_X = 180;
const GAP_Y = 120;
const NODE_COUNT = 200;

const ICON_PATHS = [computeIcon, databaseIcon, storageIcon, loadbalancerIcon];
const NODE_COLORS = [0x2d3748, 0x2c3e50, 0x1a365d, 0x2d2d3f];

const LABELS = [
  "API Gateway", "Auth Service", "User DB", "Cache", "Queue",
  "Worker", "CDN", "DNS", "Proxy", "Scheduler",
  "Logger", "Monitor", "Config", "Storage", "Backup",
  "Metrics", "Alerts", "Registry", "Secrets", "Mesh",
];

const PROTOCOL_LABELS = [
  "HTTPS :443", "gRPC :50051", "TCP :5432", "Redis :6379", "AMQP :5672",
] as const;

const SIDES: Side[] = ["top", "right", "bottom", "left"];

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GROUP_DEFS = [
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
  engine: CanvasEngine,
  signal?: AbortSignal,
): Promise<void> {
  const textures: Texture[] = await Promise.all(
    ICON_PATHS.map((path) => Assets.load<Texture>(path)),
  );
  if (signal?.aborted) return;

  const rng = mulberry32(42);

  for (const g of GROUP_DEFS) {
    engine.addGroup(g.id, g);
  }

  const nodeIds: string[] = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    const id = `node-${i}`;
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    engine.addNode(id, {
      label: LABELS[i % LABELS.length]!,
      x: col * GAP_X + 80,
      y: row * GAP_Y + 60,
      width: NODE_W,
      height: NODE_H,
      color: NODE_COLORS[i % NODE_COLORS.length],
      icon: textures[i % textures.length],
    });
    nodeIds.push(id);
  }

  const edgeCount = 80;
  for (let i = 0; i < edgeCount; i++) {
    const srcIdx = Math.floor(rng() * NODE_COUNT);
    let tgtIdx = Math.floor(rng() * NODE_COUNT);
    if (tgtIdx === srcIdx) tgtIdx = (tgtIdx + 1) % NODE_COUNT;

    engine.addEdge(`e-${i}`, {
      sourceId: nodeIds[srcIdx]!,
      sourceSide: SIDES[Math.floor(rng() * 4)]!,
      targetId: nodeIds[tgtIdx]!,
      targetSide: SIDES[Math.floor(rng() * 4)]!,
      label: rng() > 0.4 ? PROTOCOL_LABELS[Math.floor(rng() * PROTOCOL_LABELS.length)] : undefined,
    });
  }
}
