import type { CanvasEdge } from "../types";

export class EdgeIndex {
  private edgesByNode = new Map<string, Set<string>>();

  add(edge: CanvasEdge): void {
    this.addEntry(edge.sourceId, edge.id);
    this.addEntry(edge.targetId, edge.id);
  }

  remove(edge: CanvasEdge): void {
    this.edgesByNode.get(edge.sourceId)?.delete(edge.id);
    this.edgesByNode.get(edge.targetId)?.delete(edge.id);
  }

  getEdgeIdsForNode(nodeId: string): ReadonlySet<string> | undefined {
    return this.edgesByNode.get(nodeId);
  }

  deleteNode(nodeId: string): void {
    this.edgesByNode.delete(nodeId);
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
