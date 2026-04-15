import type { Command } from "./command";
import type { EventDescriptor } from "../events/event-emitter";
import type { CanvasElement } from "../types";
import type { ElementRegistry } from "../registry/element-registry";
import { applyParentChange } from "../hierarchy/group-ops";

export class AssignCommand implements Command {
  readonly type = "assign";
  private readonly oldParent: string | null;

  constructor(
    private readonly childId: string,
    private readonly newParent: string | null,
    private readonly registry: ElementRegistry,
    private readonly sync: (el: CanvasElement) => void,
  ) {
    this.oldParent = registry.getElementOrThrow(childId).parentGroupId;
  }

  execute(): void {
    applyParentChange(this.childId, this.newParent, this.registry, this.sync);
  }

  undo(): void {
    applyParentChange(this.childId, this.oldParent, this.registry, this.sync);
  }

  getDomainEvents(direction: "execute" | "undo"): readonly EventDescriptor[] {
    return [{
      event: "group:membership",
      data: {
        childId: this.childId,
        oldGroupId: direction === "execute" ? this.oldParent : this.newParent,
        newGroupId: direction === "execute" ? this.newParent : this.oldParent,
      },
    }];
  }
}
