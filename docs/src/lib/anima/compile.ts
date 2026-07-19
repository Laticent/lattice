// Anima — the pure core: `compile(scene)` → a Timeline whose `at(t)` yields a SceneState.
// This is the shared substrate the three engines agree on: the SCENE differs per engine,
// but "time → a snapshot of transforms/reveal/level" is universal (the generalization of
// Cadenza's "a timeline is data; the clock is someone else's"). No DOM, no WebGL, no
// randomness, no wall-clock — a given scene renders ONE reproducible snapshot at any t,
// which is what the byte-stable poster gate depends on
// (2026-07-17-anima-animation-library.md §5–7).
//
// The built scene is a NESTED tree; each element's transform is emitted LOCAL to its
// parent (the backend composes parent∘child, as Zdog/Three do natively), so compound
// motion — a rotor spinning inside a tilting housing — is expressible. A backend reads
// whichever fields it paints.

import { clamp01, type Easing, ease } from './easing';
import type { BuiltElement, ElementState, ResolvedTransform, Scene, SceneState, SvgElement, Timeline, Vec3 } from './types';
import type { Axis } from './vocabulary';

const TAU = Math.PI * 2;
const EPS = 1e-6;
const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

type AnyElement = BuiltElement | SvgElement;

function identity(): ResolvedTransform {
  return { at: [0, 0, 0], rotate: [0, 0, 0], scale: 1 };
}

/** Eased progress through a `[at, at+span]` window of the overall 0→1 timeline progress. */
function windowed(progress: number, at = 0, span = 1, easing: Easing = 'linear'): number {
  const s = span <= 0 ? EPS : span;
  return ease(easing, clamp01((progress - at) / s));
}

/** Right-handed rotation of a position vector about an axis by `a` radians. All three
 *  axes share ONE handedness (cyclic x→y→z); an earlier y-branch was the transpose —
 *  the adversarial-trio F1 correctness bug. */
function rotateAbout(v: Vec3, axis: Axis, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const [x, y, z] = v;
  if (axis === 'x') return [x, y * c - z * s, y * s + z * c];
  if (axis === 'y') return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}

function evalElement(el: AnyElement, seqRank: Map<string, number>, seqCount: number, tMs: number, progress: number, parentReveal: number): ElementState {
  const tf = identity();
  // Base LOCAL transform. Built elements nest (parent∘child); an svg part carries an optional
  // flat 2-D transform (the backend paints at.x/at.y as translate, scale, rotate.z).
  if ('transform' in el && el.transform) {
    const b = el.transform;
    if (b.at) tf.at = [...b.at];
    if (b.rotate) tf.rotate = [...b.rotate];
    if (typeof b.scale === 'number') tf.scale = b.scale;
  }

  let reveal = 1;
  let level = 1;
  let emphasis = 0;
  let hasReveal = false;

  // Motions apply in array order onto the LOCAL transform (composition is order-dependent —
  // documented in the vocabulary; e.g. `explode` scales whatever offset precedes it).
  for (const m of el.motion ?? []) {
    switch (m.verb) {
      case 'spin':
        tf.rotate[AXIS_INDEX[m.axis]] += (tMs / m.period) * TAU;
        break;
      case 'orbit':
        tf.at = rotateAbout(tf.at, m.axis, (tMs / m.period) * TAU);
        break;
      case 'explode': {
        // Push the element outward from its PARENT origin — a child separating from its
        // assembly (the exploded view), which nesting makes meaningful.
        const k = 1 + m.distance * windowed(progress, m.at, m.span, m.easing);
        tf.at = [tf.at[0] * k, tf.at[1] * k, tf.at[2] * k];
        break;
      }
      case 'reveal':
      case 'draw':
      case 'trace':
        hasReveal = true;
        reveal *= windowed(progress, m.at, m.span, m.easing);
        break;
      case 'sequence': {
        // Stagger over the SEQUENCED SUBSET (tree pre-order), so a scene where only some
        // elements sequence has no dead slots. Sequenced elements are expected to share
        // `at`/`span` for a gapless tiling (each uses its own here).
        hasReveal = true;
        const span = m.span ?? 1;
        const slot = span / seqCount;
        const start = (m.at ?? 0) + (seqRank.get(el.id) ?? 0) * slot;
        reveal *= windowed(progress, start, slot, m.easing);
        break;
      }
      case 'fill':
        level = m.to * windowed(progress, m.at, m.span, m.easing);
        break;
      case 'slide': {
        // A move-IN: displaced by `from` at the window's start, arriving at the base position
        // (offset 0) by its end. 2-D only — the svg backend paints at.x/at.y as a translate.
        const w = windowed(progress, m.at, m.span, m.easing);
        tf.at[0] += m.from[0] * (1 - w);
        tf.at[1] += m.from[1] * (1 - w);
        break;
      }
      case 'highlight':
        // Rises to full emphasis over the window and HOLDS (windowed clamps to 1 past the
        // window), so the emphasized state is present in the hero-still poster. Max, so
        // multiple highlights don't dim each other.
        emphasis = Math.max(emphasis, windowed(progress, m.at, m.span, m.easing));
        break;
    }
  }

  if (!hasReveal) reveal = 1;
  // EFFECTIVE reveal composes DOWN the tree: a child's presence is gated by its ancestors
  // (a hidden/ fading group fades its whole sub-assembly — the mechanism/exploded classes).
  // A group Anchor has no color of its own, so this is the ONLY way its reveal reaches paint
  // (the trio's Munger #3). Multiplicative, so an all-present branch is unaffected.
  const effective = reveal * parentReveal;

  const children = 'children' in el && el.children ? el.children.map((c) => evalElement(c, seqRank, seqCount, tMs, progress, effective)) : [];

  return {
    id: el.id,
    transform: tf,
    ...(el.color ? { color: el.color } : {}),
    reveal: effective,
    level,
    emphasis,
    visible: effective > EPS,
    children,
  };
}

/** Collect ids carrying a `sequence` verb, in tree PRE-ORDER, so the stagger tiles the
 *  sequenced subset deterministically across the whole tree. */
function collectSequenced(elements: AnyElement[], out: string[]): void {
  for (const el of elements) {
    if ((el.motion ?? []).some((m) => m.verb === 'sequence')) out.push(el.id);
    if ('children' in el && el.children) collectSequenced(el.children, out);
  }
}

/**
 * Compile a (validated) scene into a Timeline. `at(t)` clamps t to `[0, duration]` (and
 * maps a non-finite clock to 0) and returns the engine-neutral snapshot; `poster()`
 * samples the hero time. Pure and deterministic.
 */
export function compile(scene: Scene): Timeline {
  const duration = scene.duration;

  const sequenced: string[] = [];
  collectSequenced(scene.elements as AnyElement[], sequenced);
  const seqRank = new Map(sequenced.map((id, i) => [id, i] as const));
  const seqCount = Math.max(1, sequenced.length);

  const at = (tMs: number): SceneState => {
    // NaN clock (a dropped rAF timestamp) → 0, so it can't flood the snapshot with NaN:
    // `NaN < 0` and `NaN > duration` are both false, so the plain min/max below would leak
    // NaN into every element (the trio's M1). ±Infinity clamp naturally through the min/max.
    const t = Number.isNaN(tMs) ? 0 : tMs < 0 ? 0 : tMs > duration ? duration : tMs;
    const progress = duration > 0 ? t / duration : 0;
    const camera = identity();
    if (scene.source === 'built' && scene.camera?.rotate) camera.rotate = [...scene.camera.rotate];
    const elements = (scene.elements as AnyElement[]).map((el) => evalElement(el, seqRank, seqCount, t, progress, 1));
    return { source: scene.source, tMs: t, progress, camera, elements };
  };

  return {
    durationMs: duration,
    at,
    poster: () => at(clamp01(scene.hero) * duration),
  };
}
