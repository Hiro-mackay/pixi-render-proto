import { Assets, type Texture } from "pixi.js";
import computeIcon from "../src/assets/icons/compute.svg";
import databaseIcon from "../src/assets/icons/database.svg";
import loadbalancerIcon from "../src/assets/icons/loadbalancer.svg";
import storageIcon from "../src/assets/icons/storage.svg";
import type { CanvasEngine, Side } from "../src/core";

const NODE_W = 140;
const NODE_H = 68;

type IconKind = "compute" | "database" | "storage" | "loadbalancer";

interface NodeDef {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly icon: IconKind;
  readonly color?: number;
  readonly group?: string;
}

interface GroupDef {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: number;
}

interface EdgeDef {
  readonly sourceId: string;
  readonly sourceSide: Side;
  readonly targetId: string;
  readonly targetSide: Side;
  readonly label?: string;
}

const NODE_COLOR_SERVICE = 0x2d3748;
const NODE_COLOR_DATA = 0x1a365d;
const NODE_COLOR_EDGE = 0x2c3e50;

const PROTOCOL_COLORS: Record<string, number> = {
  "HTTPS :443": 0x3b82f6,
  "gRPC :50051": 0x06b6d4,
  "TCP :5432": 0x10b981,
  "Redis :6379": 0xef4444,
  "AMQP :5672": 0xf59e0b,
  OTLP: 0x8b5cf6,
};

// --- Scene topology ---
// A layered SaaS microservices architecture: clients hit the edge, which routes through a
// gateway to a row of domain services, which write to a shared data layer and fan out to
// async workers via messaging. Observability sits on the side collecting telemetry.

const GROUPS: readonly GroupDef[] = [
  { id: "g-client", label: "Client", x: 40, y: 40, width: 330, height: 120, color: 0x3182ce },
  { id: "g-edge", label: "Edge", x: 40, y: 220, width: 500, height: 120, color: 0x38b2ac },
  { id: "g-gateway", label: "Gateway", x: 40, y: 400, width: 330, height: 120, color: 0x4299e1 },
  { id: "g-services", label: "Services", x: 40, y: 580, width: 840, height: 120, color: 0x38a169 },
  { id: "g-messaging", label: "Messaging", x: 40, y: 760, width: 330, height: 120, color: 0xd69e2e },
  { id: "g-data", label: "Data", x: 40, y: 940, width: 330, height: 210, color: 0xdd6b20 },
  { id: "g-workers", label: "Workers", x: 390, y: 940, width: 330, height: 210, color: 0x805ad5 },
  {
    id: "g-observability",
    label: "Observability",
    x: 960,
    y: 40,
    width: 170,
    height: 480,
    color: 0xe53e3e,
  },
];

const NODES: readonly NodeDef[] = [
  // Client
  { id: "n-web", label: "Web App", x: 60, y: 80, icon: "compute", group: "g-client" },
  { id: "n-ios", label: "iOS App", x: 220, y: 80, icon: "compute", group: "g-client" },
  // Edge
  {
    id: "n-dns",
    label: "Route 53",
    x: 60,
    y: 260,
    icon: "loadbalancer",
    color: NODE_COLOR_EDGE,
    group: "g-edge",
  },
  {
    id: "n-cdn",
    label: "CDN",
    x: 220,
    y: 260,
    icon: "loadbalancer",
    color: NODE_COLOR_EDGE,
    group: "g-edge",
  },
  {
    id: "n-waf",
    label: "WAF",
    x: 380,
    y: 260,
    icon: "loadbalancer",
    color: NODE_COLOR_EDGE,
    group: "g-edge",
  },
  // Gateway
  {
    id: "n-lb",
    label: "Load Balancer",
    x: 60,
    y: 440,
    icon: "loadbalancer",
    color: NODE_COLOR_EDGE,
    group: "g-gateway",
  },
  {
    id: "n-apigw",
    label: "API Gateway",
    x: 220,
    y: 440,
    icon: "loadbalancer",
    color: NODE_COLOR_EDGE,
    group: "g-gateway",
  },
  // Services
  {
    id: "n-auth",
    label: "Auth",
    x: 60,
    y: 620,
    icon: "compute",
    color: NODE_COLOR_SERVICE,
    group: "g-services",
  },
  {
    id: "n-users",
    label: "Users",
    x: 220,
    y: 620,
    icon: "compute",
    color: NODE_COLOR_SERVICE,
    group: "g-services",
  },
  {
    id: "n-orders",
    label: "Orders",
    x: 380,
    y: 620,
    icon: "compute",
    color: NODE_COLOR_SERVICE,
    group: "g-services",
  },
  {
    id: "n-payments",
    label: "Payments",
    x: 540,
    y: 620,
    icon: "compute",
    color: NODE_COLOR_SERVICE,
    group: "g-services",
  },
  {
    id: "n-notifications",
    label: "Notifications",
    x: 700,
    y: 620,
    icon: "compute",
    color: NODE_COLOR_SERVICE,
    group: "g-services",
  },
  // Messaging
  { id: "n-eventbus", label: "Event Bus", x: 60, y: 800, icon: "compute", group: "g-messaging" },
  { id: "n-queue", label: "Task Queue", x: 220, y: 800, icon: "compute", group: "g-messaging" },
  // Data (2x2 layout)
  {
    id: "n-db-primary",
    label: "Primary DB",
    x: 60,
    y: 980,
    icon: "database",
    color: NODE_COLOR_DATA,
    group: "g-data",
  },
  {
    id: "n-db-replica",
    label: "Read Replica",
    x: 220,
    y: 980,
    icon: "database",
    color: NODE_COLOR_DATA,
    group: "g-data",
  },
  {
    id: "n-cache",
    label: "Redis Cache",
    x: 60,
    y: 1065,
    icon: "database",
    color: NODE_COLOR_DATA,
    group: "g-data",
  },
  {
    id: "n-s3",
    label: "Object Storage",
    x: 220,
    y: 1065,
    icon: "storage",
    color: NODE_COLOR_DATA,
    group: "g-data",
  },
  // Workers
  { id: "n-order-worker", label: "Order Worker", x: 410, y: 980, icon: "compute", group: "g-workers" },
  { id: "n-email-worker", label: "Email Worker", x: 570, y: 980, icon: "compute", group: "g-workers" },
  { id: "n-analytics", label: "Analytics", x: 410, y: 1065, icon: "compute", group: "g-workers" },
  // Observability (vertical stack)
  { id: "n-metrics", label: "Metrics", x: 975, y: 80, icon: "compute", group: "g-observability" },
  { id: "n-logs", label: "Logs", x: 975, y: 188, icon: "compute", group: "g-observability" },
  { id: "n-traces", label: "Tracing", x: 975, y: 296, icon: "compute", group: "g-observability" },
  { id: "n-alerts", label: "Alerts", x: 975, y: 404, icon: "compute", group: "g-observability" },
];

const EDGES: readonly EdgeDef[] = [
  // Client → Edge
  { sourceId: "n-web", sourceSide: "bottom", targetId: "n-cdn", targetSide: "top", label: "HTTPS :443" },
  { sourceId: "n-ios", sourceSide: "bottom", targetId: "n-cdn", targetSide: "top", label: "HTTPS :443" },
  // Edge flow
  { sourceId: "n-cdn", sourceSide: "right", targetId: "n-waf", targetSide: "left" },
  { sourceId: "n-dns", sourceSide: "bottom", targetId: "n-lb", targetSide: "top" },
  { sourceId: "n-waf", sourceSide: "bottom", targetId: "n-lb", targetSide: "top" },
  // Gateway
  { sourceId: "n-lb", sourceSide: "right", targetId: "n-apigw", targetSide: "left" },
  // API Gateway → Services
  {
    sourceId: "n-apigw",
    sourceSide: "bottom",
    targetId: "n-auth",
    targetSide: "top",
    label: "gRPC :50051",
  },
  { sourceId: "n-apigw", sourceSide: "bottom", targetId: "n-users", targetSide: "top" },
  { sourceId: "n-apigw", sourceSide: "bottom", targetId: "n-orders", targetSide: "top" },
  { sourceId: "n-apigw", sourceSide: "bottom", targetId: "n-payments", targetSide: "top" },
  { sourceId: "n-apigw", sourceSide: "bottom", targetId: "n-notifications", targetSide: "top" },
  // Inter-service
  { sourceId: "n-orders", sourceSide: "right", targetId: "n-payments", targetSide: "left" },
  { sourceId: "n-orders", sourceSide: "left", targetId: "n-users", targetSide: "right" },
  // Services → Messaging
  {
    sourceId: "n-orders",
    sourceSide: "bottom",
    targetId: "n-eventbus",
    targetSide: "top",
    label: "AMQP :5672",
  },
  { sourceId: "n-payments", sourceSide: "bottom", targetId: "n-eventbus", targetSide: "top" },
  // Event Bus → Notifications (async fan-out)
  {
    sourceId: "n-eventbus",
    sourceSide: "top",
    targetId: "n-notifications",
    targetSide: "bottom",
    label: "AMQP :5672",
  },
  // Event Bus → Task Queue
  { sourceId: "n-eventbus", sourceSide: "right", targetId: "n-queue", targetSide: "left" },
  // Task Queue → Workers
  { sourceId: "n-queue", sourceSide: "right", targetId: "n-order-worker", targetSide: "left" },
  { sourceId: "n-queue", sourceSide: "right", targetId: "n-email-worker", targetSide: "left" },
  { sourceId: "n-queue", sourceSide: "right", targetId: "n-analytics", targetSide: "left" },
  // Services → Data
  {
    sourceId: "n-auth",
    sourceSide: "bottom",
    targetId: "n-db-primary",
    targetSide: "top",
    label: "TCP :5432",
  },
  { sourceId: "n-users", sourceSide: "bottom", targetId: "n-db-primary", targetSide: "top" },
  { sourceId: "n-orders", sourceSide: "bottom", targetId: "n-db-primary", targetSide: "top" },
  { sourceId: "n-payments", sourceSide: "bottom", targetId: "n-db-primary", targetSide: "top" },
  // Primary → Replica
  { sourceId: "n-db-primary", sourceSide: "right", targetId: "n-db-replica", targetSide: "left" },
  // Cache
  {
    sourceId: "n-auth",
    sourceSide: "bottom",
    targetId: "n-cache",
    targetSide: "top",
    label: "Redis :6379",
  },
  { sourceId: "n-users", sourceSide: "bottom", targetId: "n-cache", targetSide: "top" },
  // Workers → Storage
  { sourceId: "n-email-worker", sourceSide: "bottom", targetId: "n-s3", targetSide: "top" },
  { sourceId: "n-analytics", sourceSide: "left", targetId: "n-s3", targetSide: "right" },
  // Services → Observability
  {
    sourceId: "n-apigw",
    sourceSide: "right",
    targetId: "n-metrics",
    targetSide: "left",
    label: "OTLP",
  },
  { sourceId: "n-orders", sourceSide: "right", targetId: "n-logs", targetSide: "left" },
  { sourceId: "n-payments", sourceSide: "right", targetId: "n-traces", targetSide: "left" },
  // Alert fan-in
  { sourceId: "n-metrics", sourceSide: "bottom", targetId: "n-alerts", targetSide: "top" },
];

async function buildArchitectureScene(engine: CanvasEngine, signal?: AbortSignal): Promise<void> {
  const [compute, database, storage, loadbalancer] = await Promise.all([
    Assets.load<Texture>(computeIcon),
    Assets.load<Texture>(databaseIcon),
    Assets.load<Texture>(storageIcon),
    Assets.load<Texture>(loadbalancerIcon),
  ]);
  if (signal?.aborted) return;

  const iconMap: Record<IconKind, Texture> = { compute, database, storage, loadbalancer };

  engine.beginBulkLoad();

  for (const g of GROUPS) {
    engine.addGroup(g.id, {
      label: g.label,
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      color: g.color,
    });
  }

  for (const n of NODES) {
    engine.addNode(n.id, {
      label: n.label,
      x: n.x,
      y: n.y,
      width: NODE_W,
      height: NODE_H,
      color: n.color,
      icon: iconMap[n.icon],
    });
    if (n.group) engine.assignToGroup(n.id, n.group);
  }

  for (let i = 0; i < EDGES.length; i++) {
    const e = EDGES[i]!;
    engine.addEdge(`e-${i}`, {
      sourceId: e.sourceId,
      sourceSide: e.sourceSide,
      targetId: e.targetId,
      targetSide: e.targetSide,
      label: e.label,
      labelColor: e.label ? PROTOCOL_COLORS[e.label] : undefined,
    });
  }

  engine.endBulkLoad();
}

// --- Stress test fallback (triggered by ?nodes=N URL param) ---

const STRESS_COLS = 14;
const STRESS_GAP_X = 180;
const STRESS_GAP_Y = 120;

const STRESS_GROUPS: readonly GroupDef[] = [
  { id: "g-frontend", label: "Frontend", x: 20, y: 20, width: 560, height: 380, color: 0x3182ce },
  { id: "g-backend", label: "Backend Services", x: 600, y: 20, width: 920, height: 380, color: 0x38a169 },
  { id: "g-data", label: "Data Layer", x: 20, y: 420, width: 560, height: 380, color: 0xd69e2e },
  { id: "g-infra", label: "Infrastructure", x: 600, y: 420, width: 920, height: 380, color: 0x805ad5 },
  { id: "g-monitoring", label: "Monitoring", x: 20, y: 820, width: 740, height: 380, color: 0xe53e3e },
  { id: "g-security", label: "Security", x: 780, y: 820, width: 740, height: 380, color: 0xdd6b20 },
  { id: "g-vpc", label: "VPC", x: 40, y: 50, width: 500, height: 320, color: 0x2b6cb0 },
  { id: "g-subnet", label: "Public Subnet", x: 60, y: 80, width: 220, height: 230, color: 0x4299e1 },
];

const STRESS_LABELS = [
  "API Gateway",
  "Auth Service",
  "User DB",
  "Cache",
  "Queue",
  "Worker",
  "CDN",
  "DNS",
  "Proxy",
  "Scheduler",
  "Logger",
  "Monitor",
  "Config",
  "Storage",
  "Backup",
  "Metrics",
];

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIDES: Side[] = ["top", "right", "bottom", "left"];
const PROTOCOL_LABELS = Object.keys(PROTOCOL_COLORS);

async function buildStressScene(
  engine: CanvasEngine,
  signal: AbortSignal | undefined,
  nodeCount: number,
): Promise<void> {
  const textures = await Promise.all([
    Assets.load<Texture>(computeIcon),
    Assets.load<Texture>(databaseIcon),
    Assets.load<Texture>(storageIcon),
    Assets.load<Texture>(loadbalancerIcon),
  ]);
  if (signal?.aborted) return;

  const rng = mulberry32(42);
  engine.beginBulkLoad();

  for (const g of STRESS_GROUPS) {
    engine.addGroup(g.id, {
      label: g.label,
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      color: g.color,
    });
  }

  const groupsByArea = [...STRESS_GROUPS].sort(
    (a, b) => a.width * a.height - b.width * b.height,
  );
  const nodeIds: string[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const id = `node-${i}`;
    const col = i % STRESS_COLS;
    const row = Math.floor(i / STRESS_COLS);
    const nx = col * STRESS_GAP_X + 80;
    const ny = row * STRESS_GAP_Y + 60;
    engine.addNode(id, {
      label: STRESS_LABELS[i % STRESS_LABELS.length]!,
      x: nx,
      y: ny,
      width: NODE_W,
      height: NODE_H,
      color: NODE_COLOR_SERVICE,
      icon: textures[i % textures.length],
    });
    // Assign to smallest enclosing group (by ascending area)
    for (const g of groupsByArea) {
      if (nx >= g.x && nx + NODE_W <= g.x + g.width && ny >= g.y && ny + NODE_H <= g.y + g.height) {
        engine.assignToGroup(id, g.id);
        break;
      }
    }
    nodeIds.push(id);
  }

  const edgeCount = Math.floor(nodeCount * 0.4);
  for (let i = 0; i < edgeCount; i++) {
    const srcIdx = Math.floor(rng() * nodeCount);
    let tgtIdx = Math.floor(rng() * nodeCount);
    if (tgtIdx === srcIdx) tgtIdx = (tgtIdx + 1) % nodeCount;
    const label =
      rng() > 0.4 ? PROTOCOL_LABELS[Math.floor(rng() * PROTOCOL_LABELS.length)] : undefined;
    engine.addEdge(`e-${i}`, {
      sourceId: nodeIds[srcIdx]!,
      sourceSide: SIDES[Math.floor(rng() * 4)]!,
      targetId: nodeIds[tgtIdx]!,
      targetSide: SIDES[Math.floor(rng() * 4)]!,
      label,
      labelColor: label ? PROTOCOL_COLORS[label] : undefined,
    });
  }

  engine.endBulkLoad();
}

export async function buildDemoScene(
  engine: CanvasEngine,
  signal?: AbortSignal,
  nodeCount?: number,
): Promise<void> {
  if (typeof nodeCount === "number" && nodeCount > 0) {
    return buildStressScene(engine, signal, nodeCount);
  }
  return buildArchitectureScene(engine, signal);
}
