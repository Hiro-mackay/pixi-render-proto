import { Container } from "pixi.js";
import type { CanvasEdge, CanvasElement, Side } from "../types";
import { EdgeIndex } from "./edge-index";
import { ElementNotFoundError, ElementExistsError, CycleDetectedError, InvalidArgumentError } from "../errors";

/** Internal mutable view of CanvasEdge for reconnection within the registry. */
interface MutableCanvasEdge extends Omit<CanvasEdge, "sourceId" | "sourceSide" | "targetId" | "targetSide"> {
  sourceId: string;
  sourceSide: Side;
  targetId: string;
  targetSide: Side;
}

export interface ReadonlyElementRegistry {
  getElement(id: string): CanvasElement | undefined;
  getElementOrThrow(id: string): CanvasElement;
  getIdByContainer(container: Container): string | undefined;
  getEdge(id: string): CanvasEdge | undefined;
  getEdgeOrThrow(id: string): CanvasEdge;
  getEdgesForNode(nodeId: string): readonly CanvasEdge[];
  getChildrenOf(groupId: string): readonly CanvasElement[];
  getAllNodes(): readonly CanvasElement[];
  getAllGroups(): readonly CanvasElement[];
  getAllElements(): ReadonlyMap<string, CanvasElement>;
  getAllEdges(): ReadonlyMap<string, CanvasEdge>;
}

export class ElementRegistry implements ReadonlyElementRegistry {
  private elements = new Map<string, CanvasElement>();
  private edges = new Map<string, MutableCanvasEdge>();
  private containerToId = new WeakMap<Container, string>();
  private edgeIndex = new EdgeIndex();
  private childrenByGroup = new Map<string, Set<string>>();

  addElement(id: string, element: CanvasElement): void {
    if (this.elements.has(id)) {
      throw new ElementExistsError(`Element "${id}" already exists`);
    }
    if (this.edges.has(id)) {
      throw new ElementExistsError(`ID "${id}" is already used by an edge`);
    }
    this.elements.set(id, element);
    this.containerToId.set(element.container, id);
  }

  removeElement(id: string): void {
    const element = this.getElementOrThrow(id);

    // Fail fast if caller forgot to remove connected edges first
    const connectedEdgeIds = this.edgeIndex.getEdgeIdsForNode(id);
    if (connectedEdgeIds && connectedEdgeIds.size > 0) {
      throw new InvalidArgumentError(
        `Cannot remove element "${id}": ${connectedEdgeIds.size} connected edge(s) remain. Remove edges first.`,
      );
    }

    // Detach from parent group
    if (element.parentGroupId) {
      this.childrenByGroup.get(element.parentGroupId)?.delete(id);
    }

    // Reset children's parentGroupId so they don't hold stale refs
    const children = this.childrenByGroup.get(id);
    if (children) {
      for (const childId of children) {
        const child = this.elements.get(childId);
        if (child) child.parentGroupId = null;
      }
    }

    this.edgeIndex.deleteNode(id);
    this.childrenByGroup.delete(id);
    this.containerToId.delete(element.container);
    this.elements.delete(id);
  }

  getElement(id: string): CanvasElement | undefined {
    return this.elements.get(id);
  }

  getElementOrThrow(id: string): CanvasElement {
    const element = this.elements.get(id);
    if (!element) throw new ElementNotFoundError(`Element "${id}" not found`);
    return element;
  }

  getIdByContainer(container: Container): string | undefined {
    return this.containerToId.get(container);
  }

  getAllNodes(): readonly CanvasElement[] {
    const nodes: CanvasElement[] = [];
    for (const el of this.elements.values()) {
      if (el.type === "node") nodes.push(el);
    }
    return nodes;
  }

  getAllGroups(): readonly CanvasElement[] {
    const groups: CanvasElement[] = [];
    for (const el of this.elements.values()) {
      if (el.type === "group") groups.push(el);
    }
    return groups;
  }

  getAllElements(): ReadonlyMap<string, CanvasElement> {
    return this.elements;
  }

  addEdge(id: string, edge: CanvasEdge): void {
    if (this.edges.has(id)) {
      throw new ElementExistsError(`Edge "${id}" already exists`);
    }
    if (this.elements.has(id)) {
      throw new ElementExistsError(`ID "${id}" is already used by an element`);
    }
    if (!this.elements.has(edge.sourceId)) {
      throw new ElementNotFoundError(`Edge source "${edge.sourceId}" not found`);
    }
    if (!this.elements.has(edge.targetId)) {
      throw new ElementNotFoundError(`Edge target "${edge.targetId}" not found`);
    }
    this.edges.set(id, edge as MutableCanvasEdge);
    this.edgeIndex.add(edge);
  }

  removeEdge(id: string): void {
    const edge = this.edges.get(id);
    if (!edge) return;
    this.edgeIndex.remove(edge);
    this.edges.delete(id);
  }

  getEdge(id: string): CanvasEdge | undefined {
    return this.edges.get(id);
  }

  getEdgeOrThrow(id: string): CanvasEdge {
    const edge = this.edges.get(id);
    if (!edge) throw new ElementNotFoundError(`Edge "${id}" not found`);
    return edge;
  }

  getEdgesForNode(nodeId: string): readonly CanvasEdge[] {
    const edgeIds = this.edgeIndex.getEdgeIdsForNode(nodeId);
    if (!edgeIds) return [];
    const result: CanvasEdge[] = [];
    for (const eid of edgeIds) {
      const edge = this.edges.get(eid);
      if (edge) result.push(edge);
    }
    return result;
  }

  reconnectEdge(
    id: string,
    endpoint: "source" | "target",
    newNodeId: string,
    newSide: Side,
  ): void {
    const edge = this.edges.get(id);
    if (!edge) throw new ElementNotFoundError(`Edge "${id}" not found`);
    if (!this.elements.has(newNodeId)) {
      throw new ElementNotFoundError(`Target node "${newNodeId}" not found`);
    }
    if (endpoint === "source") {
      const oldNodeId = edge.sourceId;
      this.edgeIndex.reconnect(edge.id, oldNodeId, newNodeId, edge.targetId);
      edge.sourceId = newNodeId;
      edge.sourceSide = newSide;
    } else {
      const oldNodeId = edge.targetId;
      this.edgeIndex.reconnect(edge.id, oldNodeId, newNodeId, edge.sourceId);
      edge.targetId = newNodeId;
      edge.targetSide = newSide;
    }
    edge._posCache = undefined;
  }

  getAllEdges(): ReadonlyMap<string, CanvasEdge> {
    return this.edges;
  }

  setParentGroup(childId: string, groupId: string | null): void {
    const child = this.getElementOrThrow(childId);

    if (groupId) {
      const group = this.getElementOrThrow(groupId);
      if (group.type !== "group") {
        throw new InvalidArgumentError(`Element "${groupId}" is not a group (type: "${group.type}")`);
      }
      // Cycle detection: walk up from target group to ensure child is not an ancestor
      let cursor = group.parentGroupId;
      while (cursor) {
        if (cursor === childId) {
          throw new CycleDetectedError(`Cannot assign "${childId}" to "${groupId}": would create a cycle`);
        }
        const ancestor = this.elements.get(cursor);
        cursor = ancestor?.parentGroupId ?? null;
      }
      if (groupId === childId) {
        throw new CycleDetectedError(`Cannot assign "${childId}" to itself`);
      }
    }

    const oldGroupId = child.parentGroupId;

    if (oldGroupId) {
      this.childrenByGroup.get(oldGroupId)?.delete(childId);
    }

    child.parentGroupId = groupId;

    if (groupId) {
      let children = this.childrenByGroup.get(groupId);
      if (!children) {
        children = new Set();
        this.childrenByGroup.set(groupId, children);
      }
      children.add(childId);
    }
  }

  getChildrenOf(groupId: string): readonly CanvasElement[] {
    const childIds = this.childrenByGroup.get(groupId);
    if (!childIds) return [];
    const result: CanvasElement[] = [];
    for (const cid of childIds) {
      const el = this.elements.get(cid);
      if (el) result.push(el);
    }
    return result;
  }
}
