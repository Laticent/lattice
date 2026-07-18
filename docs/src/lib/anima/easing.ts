// Anima — the closed easing set. Pure functions p∈[0,1] → p'∈[0,1]. PROGRESS-based
// verbs (reveal/draw/trace/sequence/fill/explode) map their normalized window progress
// through one of these; CYCLIC verbs (spin/bob/orbit) use raw phase and take no easing.
// Closed like the rest of the vocabulary — no arbitrary cubic-bezier authoring.

export const EASINGS = ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const;
export type Easing = (typeof EASINGS)[number];

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

export function ease(name: Easing, p: number): number {
  const t = clamp01(p);
  switch (name) {
    case 'linear':
      return t;
    case 'ease-in':
      return t * t * t;
    case 'ease-out':
      return 1 - (1 - t) ** 3;
    case 'ease-in-out':
      return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    default:
      return t; // robust public surface: an off-union name falls back to linear (F8)
  }
}
