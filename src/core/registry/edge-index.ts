import type { CanvasEdge } from "../types";

export class EdgeIndex {
  private edgesByNode = new Map<string, Set<string>>();

  add(edge: CanvasEdge): void {
    this.addEntry(edge.sourceId, edge.id);
    this.addEntry(edge.targetId, edge.id);
  }

  remove(edge: CanvasEdge): void {
    this.removeEntry(edge.sourceId, edge.id);
    this.removeEntry(edge.targetId, edge.id);
  }

  getEdgeIdsForNode(nodeId: string): ReadonlySet<string> | undefined {
    return this.edgesByNode.get(nodeId);
  }

  reconnect(edgeId: string, oldNodeId: string, newNodeId: string): void {
    this.removeEntry(oldNodeId, edgeId);
    this.addEntry(newNodeId, edgeId);
  }

  deleteNode(nodeId: string): void {
    this.edgesByNode.delete(nodeId);
  }

  private removeEntry(nodeId: string, edgeId: string): void {
    const set = this.edgesByNode.get(nodeId);
    if (!set) return;
    set.delete(edgeId);
    if (set.size === 0) this.edgesByNode.delete(nodeId);
  }

  private addEntry(nodeId: string, edgeId: string): void {
    let set = this.edgesByNode.get(nodeId);
    if (!set) {
      set = new Set();
      this.edgesByNode.set(nodeId, set);
    }
    set.add(edgeId);
  }
}
