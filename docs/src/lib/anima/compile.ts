// Anima — the pure core: `compile(scene)` → a Timeline whose `at(t)` yields a SceneState.
// This is the shared substrate the three engines agree on: the SCENE differs per engine,
// but "time → a snapshot of transforms/reveal/level" is universal (the generalization of
// Cadenza's "a timeline is data; the clock is someone else's"). No DOM, no WebGL, no
// randomness, no wall-clock — a given scene renders ONE reproducible snapshot at any t,
// which is what the byte-stable poster gate depends on
// (2026-07-17-anima-animation-library.md §5–7). A backend reads whichever fields it paints.

import { clamp01, type Easing, ease } from './easing';
import type { BuiltElement, ElementState, ResolvedTransform, Scene, SceneState, SvgElement, Timeline, Vec3 } from './types';
import type { Axis } from './vocabulary';

const TAU = Math.PI * 2;
const EPS = 1e-6;
const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

function identity(): ResolvedTransform {
  return { at: [0, 0, 0], rotate: [0, 0, 0], scale: 1 };
}

/** Eased progress through a `[at, at+span]` window of the overall 0→1 timeline progress. */
function windowed(progress: number, at = 0, span = 1, easing: Easing = 'linear'): number {
  const s = span <= 0 ? EPS : span;
  return ease(easing, clamp01((progress - at) / s));
}

/** Rotate a position vector about an axis by `a` radians (right-handed). */
function rotateAbout(v: Vec3, axis: Axis, a: number): Vec3 {
  const c = Math.cos(a);
  const s = Math.sin(a);
  const [x, y, z] = v;
  if (axis === 'y') return [x * c - z * s, y, x * s + z * c];
  if (axis === 'x') return [x, y * c - z * s, y * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}

function evalElement(el: BuiltElement | SvgElement, index: number, count: number, tMs: number, progress: number): ElementState {
  const tf = identity();
  // Base transform (built elements only; svg elements have no scene-graph transform).
  if ('transform' in el && el.transform) {
    const b = el.transform;
    if (b.at) tf.at = [...b.at];
    if (b.rotate) tf.rotate = [...b.rotate];
    if (typeof b.scale === 'number') tf.scale = b.scale;
  }

  let reveal = 1;
  let level = 1;
  let hasReveal = false;

  for (const m of el.motion ?? []) {
    switch (m.verb) {
      case 'spin':
        tf.rotate[AXIS_INDEX[m.axis]] += (tMs / m.period) * TAU;
        break;
      case 'orbit':
        tf.at = rotateAbout(tf.at, m.axis, (tMs / m.period) * TAU);
        break;
      case 'bob':
        tf.at[AXIS_INDEX[m.axis]] += m.amplitude * Math.sin((tMs / m.period) * TAU);
        break;
      case 'explode': {
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
        // Stagger: element i of n reveals over its own slot within the [at, at+span] window.
        hasReveal = true;
        const span = m.span ?? 1;
        const slot = span / Math.max(1, count);
        const start = (m.at ?? 0) + index * slot;
        reveal *= windowed(progress, start, slot, m.easing);
        break;
      }
      case 'fill':
        level = m.to * windowed(progress, m.at, m.span, m.easing);
        break;
    }
  }

  if (!hasReveal) reveal = 1;

  return {
    id: el.id,
    transform: tf,
    ...(el.color ? { color: el.color } : {}),
    reveal,
    level,
    visible: reveal > EPS,
  };
}

/**
 * Compile a (validated) scene into a Timeline. `at(t)` clamps t to `[0, duration]` and
 * returns the engine-neutral snapshot; `poster()` samples the hero time. Pure and
 * deterministic — the same scene always yields the same snapshot at the same t.
 */
export function compile(scene: Scene): Timeline {
  const duration = scene.duration;
  const count = scene.elements.length;

  const at = (tMs: number): SceneState => {
    const t = tMs < 0 ? 0 : tMs > duration ? duration : tMs;
    const progress = duration > 0 ? t / duration : 0;
    const camera = identity();
    if (scene.source === 'built' && scene.camera?.rotate) camera.rotate = [...scene.camera.rotate];
    const elements = scene.elements.map((el, i) => evalElement(el, i, count, t, progress));
    return { source: scene.source, tMs: t, progress, camera, elements };
  };

  return {
    durationMs: duration,
    at,
    poster: () => at(clamp01(scene.hero) * duration),
  };
}
