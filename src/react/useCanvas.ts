import { use } from "react";
import { CanvasContext } from "./CanvasProvider";
import type { CanvasEngine } from "../core";

export function useCanvas(): CanvasEngine | null {
  return use(CanvasContext);
}
