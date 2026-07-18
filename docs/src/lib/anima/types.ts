// Anima — the medium-independent SPEC + evaluated SNAPSHOT types. The spec is DATA (a
// scene graph + motion) that owns no DOM and no WebGL; `compile` (compile.ts) turns it
// into a Timeline whose `at(t)` yields a SceneState — the engine-neutral snapshot a
// backend paints. The scene is a TAGGED UNION on `source`: `built` (Zdog/Three
// primitives) or `svg` (Vivus line-art), because the three engines share the timeline
// layer but NOT the scene layer (2026-07-17-anima-animation-library.md §4–5).

import type { Easing } from './easing';
import type { Axis, Primitive, SourceModel } from './vocabulary';

export type Vec3 = [number, number, number];

/** A colour reference — a `var(--token)` string, resolved to a concrete colour at PAINT,
 *  never in the pure core (palette-blindness, HARD RULE #3). Validated by schema.ts. */
export type Color = string;

export interface Transform {
  at?: Vec3; // translate (scene-local units; the host frames/scales the whole scene)
  rotate?: Vec3; // radians, per axis
  scale?: number; // uniform scale (non-uniform deferred)
}

/** Geometry params a `built` primitive needs to have a size (the IR is otherwise
 *  dimensionless). A backend reads the fields its primitive uses and defaults the rest;
 *  all are optional and non-negative. Units are scene-local (the host frames the scene). */
export interface ShapeProps {
  stroke?: number; // line weight / rounded-edge radius (Zdog `stroke`)
  size?: number; // generic primary dimension (a radius / half-extent) for shape/ellipse/polygon
  width?: number; // box / rect
  height?: number; // box / rect
  depth?: number; // box
  diameter?: number; // cone / cylinder / hemisphere
  length?: number; // cone / cylinder
  sides?: number; // polygon
  fill?: boolean; // filled vs stroked
}

// ── Motion — the closed, typed verbs (a discriminated union on `verb`) ──────────
// Windowed verbs carry `at`/`span` ∈ [0,1] of the timeline (defaults 0 / 1) and an
// optional `easing`; cyclic verbs carry a `period` in ms and take no easing.
export interface SpinMotion {
  verb: 'spin';
  axis: Axis;
  period: number; // ms per revolution
}
export interface OrbitMotion {
  verb: 'orbit';
  axis: Axis;
  period: number; // ms per revolution of the element's position about the axis
}
export interface ExplodeMotion {
  verb: 'explode';
  distance: number; // fraction of the element's base offset to push outward (0 = none)
  at?: number;
  span?: number;
  easing?: Easing;
}
export interface RevealMotion {
  verb: 'reveal';
  at?: number;
  span?: number;
  easing?: Easing;
}
export interface SequenceMotion {
  verb: 'sequence';
  at?: number;
  span?: number;
  easing?: Easing;
}
export interface FillMotion {
  verb: 'fill';
  to: number; // target level ∈ [0,1] (data-bound)
  at?: number;
  span?: number;
  easing?: Easing;
}
export interface DrawMotion {
  verb: 'draw';
  at?: number;
  span?: number;
  easing?: Easing;
}
export interface TraceMotion {
  verb: 'trace';
  at?: number;
  span?: number;
  easing?: Easing;
}

export type Motion =
  | SpinMotion
  | OrbitMotion
  | ExplodeMotion
  | RevealMotion
  | SequenceMotion
  | FillMotion
  | DrawMotion
  | TraceMotion;

// ── Elements ────────────────────────────────────────────────────────────────
// The built scene is a NESTED tree (like Zdog's Anchor tree and Three's Object3D
// tree): a child's transform is LOCAL to its parent, and the backend composes
// parent∘child (which is how both engines natively work). This is why compound motion
// — a rotor spinning inside a tilting housing — is expressible: put the rotor's `spin`
// on a child of the housing. A `group` (no `shape`) is a pure transform node with
// children. Paint/z-order is document (tree pre-order) order.
export interface BuiltElement {
  id: string;
  shape: Primitive;
  color?: Color;
  props?: ShapeProps; // geometry (size/stroke/…); a backend defaults what's omitted
  transform?: Transform; // the element's LOCAL transform, before its motions
  motion?: Motion[];
  children?: BuiltElement[]; // nested sub-tree; their transforms compose under this one
  // Reserved caps-gated extensions for the Three tier (material / light /
  // camera-perspective) are NOT spec'd in Stage 1 — added when §14.8 lands.
}

export interface SvgElement {
  id: string;
  /** Id of a path or group inside the scene's SVG asset that this element reveals. */
  pathRef: string;
  color?: Color; // stroke colour
  motion?: Motion[];
}

export interface Camera {
  rotate?: Vec3; // radians
}

// ── The scene — a tagged union on `source` ──────────────────────────────────
export interface BuiltScene {
  source: 'built';
  /** Total timeline length, ms. */
  duration: number;
  /** Poster time as a fraction of `duration`, ∈ [0,1]. */
  hero: number;
  camera?: Camera;
  elements: BuiltElement[];
}
export interface SvgScene {
  source: 'svg';
  duration: number;
  hero: number;
  /** Reference to the SVG line-art asset the element paths live in. */
  asset: string;
  elements: SvgElement[];
}
export type Scene = BuiltScene | SvgScene;

// ── The evaluated snapshot (engine-neutral; a backend reads what it needs) ──────
export interface ResolvedTransform {
  at: Vec3;
  rotate: Vec3;
  scale: number;
}
export interface ElementState {
  id: string;
  /** The element's LOCAL resolved transform (relative to its parent). The backend
   *  builds the nested tree and lets Zdog/Three compose parent∘child — the core never
   *  pre-composes to world space (which would discard the tree the engines z-sort by). */
  transform: ResolvedTransform;
  color?: Color; // still a token ref — resolved at paint
  /** 0→1 progressive PRESENCE, defined as OPACITY (the portable reading across a vector
   *  and a GPU backend; a transparent-material backend honours it as material opacity).
   *  For an svg element this is the stroke-draw progress. */
  reveal: number;
  /** 0→1 data-bound LEVEL (the `fill` verb); 1 when no fill drives it. Its geometry
   *  binding is per-verb and backend-defined (e.g. a vessel's fill height). */
  level: number;
  visible: boolean;
  /** Nested children (built scenes only); [] for a leaf or an svg element. */
  children: ElementState[];
}
export interface SceneState {
  source: SourceModel;
  tMs: number;
  /** 0→1 across the whole timeline. */
  progress: number;
  camera: ResolvedTransform; // identity for an svg scene
  /** The ROOT elements; each carries its sub-tree in `children`. Pre-order = paint order. */
  elements: ElementState[];
}

export interface Timeline {
  durationMs: number;
  /** The engine-neutral snapshot at time t (clamped to [0, durationMs]). Pure. */
  at(tMs: number): SceneState;
  /** The poster snapshot at the scene's hero time — the still the PDF freezes. */
  poster(): SceneState;
}
