import type { Container } from "pixi.js";
import type { CanvasEdge, CanvasElement } from "../types";
import { EdgeIndex } from "./edge-index";

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
  private edges = new Map<string, CanvasEdge>();
  private containerToId = new WeakMap<Container, string>();
  private edgeIndex = new EdgeIndex();
  private childrenByGroup = new Map<string, Set<string>>();

  addElement(id: string, element: CanvasElement): void {
    if (this.elements.has(id)) {
      throw new Error(`Element "${id}" already exists`);
    }
    this.elements.set(id, element);
    this.containerToId.set(element.container, id);
  }

  removeElement(id: string): void {
    const element = this.getElementOrThrow(id);

    if (element.parentGroupId) {
      this.childrenByGroup.get(element.parentGroupId)?.delete(id);
    }

    const connectedEdgeIds = this.edgeIndex.getEdgeIdsForNode(id);
    if (connectedEdgeIds) {
      for (const edgeId of [...connectedEdgeIds]) {
        this.removeEdge(edgeId);
      }
    }
    this.edgeIndex.deleteNode(id);
    this.childrenByGroup.delete(id);
    this.elements.delete(id);
  }

  getElement(id: string): CanvasElement | undefined {
    return this.elements.get(id);
  }

  getElementOrThrow(id: string): CanvasElement {
    const element = this.elements.get(id);
    if (!element) throw new Error(`Element "${id}" not found`);
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
      throw new Error(`Edge "${id}" already exists`);
    }
    this.edges.set(id, edge);
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
    if (!edge) throw new Error(`Edge "${id}" not found`);
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

  getAllEdges(): ReadonlyMap<string, CanvasEdge> {
    return this.edges;
  }

  setParentGroup(childId: string, groupId: string | null): void {
    const child = this.getElementOrThrow(childId);
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

export function syncToContainer(element: CanvasElement): void {
  element.container.x = element.x;
  element.container.y = element.y;
  element.container.visible = element.visible;
}
