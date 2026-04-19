import { use } from "react";
import type { CanvasEngine } from "../core";
import { CanvasContext } from "./CanvasProvider";

export function useCanvas(): CanvasEngine | null {
  return use(CanvasContext);
}
