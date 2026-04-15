import type { Command } from "./command";
import type { EventDescriptor } from "../events/event-emitter";
import type { ElementRegistry } from "../registry/element-registry";
import type { CanvasElement } from "../types";
import { COLLAPSED_HEIGHT } from "../types";
import { updateVisibility } from "../hierarchy/group-ops";

export class CollapseCommand implements Command {
  readonly type = "collapse" as const;
  private readonly prevCollapsed: boolean;
  private readonly prevHeight: number;
  private readonly prevExpandedHeight: number;

  constructor(
    private readonly groupId: string,
    private readonly registry: ElementRegistry,
    private readonly sync: (el: CanvasElement) => void,
  ) {
    const group = registry.getElementOrThrow(groupId);
    if (group.type !== "group") throw new Error(`Element "${groupId}" is not a group`);
    this.prevCollapsed = group.meta.collapsed;
    this.prevHeight = group.height;
    this.prevExpandedHeight = group.meta.expandedHeight;
  }

  execute(): void {
    const group = this.registry.getElementOrThrow(this.groupId);
    if (group.type !== "group") return;
    const { meta } = group;
    if (meta.collapsed) {
      meta.collapsed = false;
      group.height = meta.expandedHeight;
    } else {
      meta.expandedHeight = group.height;
      meta.collapsed = true;
      group.height = COLLAPSED_HEIGHT;
    }
    this.sync(group);
    updateVisibility(this.groupId, this.registry, this.sync);
  }

  undo(): void {
    const group = this.registry.getElementOrThrow(this.groupId);
    if (group.type !== "group") return;
    group.meta.collapsed = this.prevCollapsed;
    group.meta.expandedHeight = this.prevExpandedHeight;
    group.height = this.prevHeight;
    this.sync(group);
    updateVisibility(this.groupId, this.registry, this.sync);
  }

  getDomainEvents(): readonly EventDescriptor[] {
    const group = this.registry.getElement(this.groupId);
    if (group?.type !== "group") return [];
    return [{ event: group.meta.collapsed ? "group:collapse" : "group:expand", data: { id: this.groupId } }];
  }
}
