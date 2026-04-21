import type { Side } from "../types";

export interface SerializedNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly color: number;
  readonly edgeSidesLocked?: boolean;
  // icon (Texture) is not serializable — consumers must re-attach after deserialize
}

export interface SerializedGroup {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly color: number;
  readonly collapsed: boolean;
  readonly expandedHeight: number;
  readonly edgeSidesLocked?: boolean;
}

export interface SerializedEdge {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceSide: Side;
  readonly targetId: string;
  readonly targetSide: Side;
  readonly label?: string;
  readonly labelColor?: number;
}

export interface GroupMembership {
  readonly childId: string;
  readonly groupId: string;
}

export interface SceneData {
  readonly version: number;
  readonly nodes: readonly SerializedNode[];
  readonly groups: readonly SerializedGroup[];
  readonly edges: readonly SerializedEdge[];
  readonly groupMemberships: readonly GroupMembership[];
  readonly viewport?: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
}
