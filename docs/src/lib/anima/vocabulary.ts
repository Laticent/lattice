// Anima — the CLOSED vocabulary: the primitive shapes a `built` scene may use, the
// motion verbs the timeline can drive, and the capability each verb needs. Closed by
// design (the anti-wizbang discipline, engineering/decisions/2026-07-17-anima-animation-library.md
// §12): you pick a ROLE from these sets, you never hand-author keyframes or easing curves.
// A backend that can't honour a member fails capability negotiation (caps.ts) rather
// than rendering something wrong.

// Built primitives — the Zdog shape set (the first backend, §14.2). The gated Three
// tier reuses the same names as meshes when it lands (§14.8).
export const PRIMITIVES = [
  'group', // an Anchor/Group: a transform node with no geometry of its own
  'shape', // a free path (a list of points) — the general primitive
  'rect',
  'rounded-rect',
  'ellipse',
  'polygon',
  'cone',
  'box',
  'cylinder',
  'hemisphere',
] as const;
export type Primitive = (typeof PRIMITIVES)[number];

// Motion verbs — the closed set. Each is valid in one or both source models and needs
// at most one extra capability (see the maps below). Their roles map to the serious use
// classes of §2: spin/orbit = explanatory 3D; sequence/reveal = mechanism; fill = data-
// bound; explode = structure; draw/trace = the drawn figure (Vivus).
export const MOTION_VERBS = [
  'spin', // continuous rotation about an axis (built)
  'orbit', // the element's position circles an axis over a period (built)
  'bob', // gentle sinusoidal translate along an axis (built)
  'explode', // elements move outward from the origin — the exploded view (built)
  'reveal', // a single element fades/scales in over a window (built)
  'sequence', // stagger element reveals across the timeline (built | svg)
  'fill', // a data-bound scalar level 0→to over a window (built | svg)
  'draw', // stroke-reveal of an SVG path (svg — needs the `draw` cap)
  'trace', // draw, following path direction (svg — needs the `draw` cap)
] as const;
export type MotionVerb = (typeof MOTION_VERBS)[number];

export const AXES = ['x', 'y', 'z'] as const;
export type Axis = (typeof AXES)[number];

/** The scene source models — `built` (Zdog/Three primitives) vs `svg` (Vivus line-art). */
export const SOURCE_MODELS = ['built', 'svg'] as const;
export type SourceModel = (typeof SOURCE_MODELS)[number];

/** verb → the extra capability a backend must advertise to honour it. `draw`/`trace`
 *  need the `draw` capability (SVG stroke reveal); the rest need only a scene-graph
 *  engine, so they add no cap beyond the source-model check (caps.ts). */
export const VERB_CAP: Record<MotionVerb, 'draw' | null> = {
  spin: null,
  orbit: null,
  bob: null,
  explode: null,
  reveal: null,
  sequence: null,
  fill: null,
  draw: 'draw',
  trace: 'draw',
};

/** verb → which source model it is valid in (`both` = either). Transform verbs are
 *  `built`-only; draw/trace are `svg`-only; sequence/fill work in both. */
export const VERB_SOURCE: Record<MotionVerb, SourceModel | 'both'> = {
  spin: 'built',
  orbit: 'built',
  bob: 'built',
  explode: 'built',
  reveal: 'built',
  sequence: 'both',
  fill: 'both',
  draw: 'svg',
  trace: 'svg',
};
