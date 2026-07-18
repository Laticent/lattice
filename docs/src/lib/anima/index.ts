// Anima — the public surface. Framework-free, zero-dependency: give it a scene SPEC
// (data), get a Timeline whose `at(t)` yields an engine-neutral SceneState a backend
// paints. It owns no DOM and no WebGL; the renderer is injected by the consumer (the
// generalization of Cadenza's injected clock). See the design ADR:
// engineering/decisions/2026-07-17-anima-animation-library.md
//
// Stage 1 is the pure core (no backend): the spec schema, the timeline compiler, the
// closed vocabulary, and the capability model. Backends (Zdog, Vivus, Three) land next.

export { canRender, negotiate, type RendererCaps, type RequiredCaps, requiredCaps } from './caps';
export { compile } from './compile';
export { clamp01, EASINGS, type Easing, ease } from './easing';
export { type ParseResult, parseScene, usedVerbs, validateColor } from './schema';
export type {
  BuiltElement,
  BuiltScene,
  Camera,
  Color,
  ElementState,
  Motion,
  ResolvedTransform,
  Scene,
  SceneState,
  SvgElement,
  SvgScene,
  Timeline,
  Transform,
  Vec3,
} from './types';
export {
  AXES,
  type Axis,
  MOTION_VERBS,
  type MotionVerb,
  PRIMITIVES,
  type Primitive,
  SOURCE_MODELS,
  type SourceModel,
  VERB_CAP,
  VERB_SOURCE,
} from './vocabulary';
