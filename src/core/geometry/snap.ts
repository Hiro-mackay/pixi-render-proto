export function snapToGrid(value: number, gridSize: number | undefined): number {
  if (!gridSize) return value;
  return Math.round(value / gridSize) * gridSize;
}
