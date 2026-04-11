/**
 * Shared viewport state. Drawing functions read `scale` to compute
 * zoom-invariant stroke widths (Figma-style constant visual thickness).
 */
export const viewState = {
  scale: 1,
};
