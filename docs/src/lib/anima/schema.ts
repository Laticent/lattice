// Anima — the SPEC validator. Hand-rolled and zero-dependency (like Cadenza): given
// untrusted input (the LLM emits DATA, never code — HARD RULE #22), return either a
// typed `Scene` or a list of human-readable errors. It enforces the closed vocabulary,
// the hero range, palette-blind token colours (HARD RULE #3), and source/verb
// compatibility — the structural half of the safety envelope, before anything renders.

import { EASINGS, type Easing } from './easing';
import type { Motion, Scene } from './types';
import { AXES, MOTION_VERBS, type MotionVerb, PRIMITIVES, type SourceModel, VERB_SOURCE } from './vocabulary';

export type ParseResult = { ok: true; scene: Scene } | { ok: false; errors: string[] };

// A token colour is `var(--name)` with an optional `var(--name)` fallback — no hex, no
// keyword, no functions. The forbid-list is a belt over the allow-regex: token values
// are host-trusted and must never smuggle url()/expression()/markup (Vetrina's rule).
const TOKEN_COLOR = /^var\(--[a-z0-9_-]+(?:\s*,\s*var\(--[a-z0-9_-]+\))?\)$/i;
const COLOR_FORBID = /(url\(|image\(|expression\(|javascript:|[;{}<>])/i;

export function validateColor(c: unknown): string | null {
  if (typeof c !== 'string') return 'colour must be a string var(--token) reference';
  if (COLOR_FORBID.test(c)) return `colour '${c}' contains a forbidden construct (url/expression/markup)`;
  if (!TOKEN_COLOR.test(c.trim())) return `colour '${c}' must be a var(--token) reference (palette-blind, HARD RULE #3)`;
  return null;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isVec3(v: unknown): v is [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every(isFiniteNumber);
}

function isUnit(v: unknown): v is number {
  return isFiniteNumber(v) && v >= 0 && v <= 1;
}

function validateTransform(t: unknown, at: string, errors: string[]): void {
  if (!t || typeof t !== 'object') {
    errors.push(`${at}.transform must be an object`);
    return;
  }
  const tf = t as Record<string, unknown>;
  if (tf.at != null && !isVec3(tf.at)) errors.push(`${at}.transform.at must be a [x,y,z] of finite numbers`);
  if (tf.rotate != null && !isVec3(tf.rotate)) errors.push(`${at}.transform.rotate must be a [x,y,z] of finite numbers (radians)`);
  if (tf.scale != null && !isFiniteNumber(tf.scale)) errors.push(`${at}.transform.scale must be a finite number`);
}

const PROP_NUMS = ['stroke', 'size', 'width', 'height', 'depth', 'diameter', 'length'] as const;

function validateProps(p: unknown, at: string, errors: string[]): void {
  if (!p || typeof p !== 'object') {
    errors.push(`${at}.props must be an object`);
    return;
  }
  const props = p as Record<string, unknown>;
  for (const key of PROP_NUMS) {
    if (props[key] != null && (!isFiniteNumber(props[key]) || (props[key] as number) < 0)) errors.push(`${at}.props.${key} must be a non-negative, finite number`);
  }
  // `sides` (polygon) must be an integer in [3, 1024]: `sides: 0`/`2`/`2.5` crashes Zdog's
  // render (the trio's HIGH), and an unbounded huge count hangs the render (the trio's DoS
  // MED — one vertex per side). Validate ⇒ renderable in bounded time.
  if (props.sides != null && (!isFiniteNumber(props.sides) || !Number.isInteger(props.sides) || (props.sides as number) < 3 || (props.sides as number) > 1024)) errors.push(`${at}.props.sides must be an integer in [3, 1024]`);
  if (props.fill != null && typeof props.fill !== 'boolean') errors.push(`${at}.props.fill must be a boolean`);
}

function validateWindow(m: Record<string, unknown>, at: string, errors: string[]): void {
  if (m.at != null && !isUnit(m.at)) errors.push(`${at}.at must be in [0,1] (fraction of the timeline)`);
  if (m.span != null && !isUnit(m.span)) errors.push(`${at}.span must be in [0,1]`);
  if (m.easing != null && !EASINGS.includes(m.easing as Easing)) errors.push(`${at}.easing '${String(m.easing)}' is not one of [${EASINGS.join(', ')}]`);
}

function validateMotion(m: unknown, source: SourceModel, at: string, errors: string[]): void {
  if (!m || typeof m !== 'object') {
    errors.push(`${at} must be an object`);
    return;
  }
  const mo = m as Record<string, unknown>;
  const verb = mo.verb as MotionVerb;
  if (!MOTION_VERBS.includes(verb)) {
    errors.push(`${at}.verb '${String(mo.verb)}' is not a motion verb [${MOTION_VERBS.join(', ')}]`);
    return;
  }
  const allowed = VERB_SOURCE[verb];
  if (allowed !== 'both' && allowed !== source) {
    errors.push(`${at}.verb '${verb}' is only valid in a '${allowed}' scene, not '${source}'`);
  }
  switch (verb) {
    case 'spin':
    case 'orbit':
      if (!AXES.includes(mo.axis as never)) errors.push(`${at}.axis must be one of [${AXES.join(', ')}]`);
      // Floor at 1ms/rev: a sub-millisecond (or denormal like 5e-324) period overflows
      // t/period to Infinity in compile (the trio's M2) and is meaningless for a slide.
      if (!isFiniteNumber(mo.period) || (mo.period as number) < 1) errors.push(`${at}.period must be a number >= 1 (ms/revolution)`);
      break;
    case 'fill':
      if (!isUnit(mo.to)) errors.push(`${at}.to must be a level in [0,1]`);
      validateWindow(mo, at, errors);
      break;
    case 'explode':
      // Non-negative: distance is a fraction to push OUTWARD; a negative would flip the
      // element through the origin to the mirror side (checker MED — range discipline).
      if (!isFiniteNumber(mo.distance) || (mo.distance as number) < 0) errors.push(`${at}.distance must be a non-negative, finite number`);
      validateWindow(mo, at, errors);
      break;
    case 'slide':
      // `from` is the [dx, dy] scene-local offset the element moves IN from — two finite
      // numbers (negatives are legitimate: slide in from the left/top).
      if (!Array.isArray(mo.from) || mo.from.length !== 2 || !mo.from.every(isFiniteNumber)) errors.push(`${at}.from must be a [dx, dy] of two finite numbers (the move-in offset)`);
      validateWindow(mo, at, errors);
      break;
    case 'reveal':
    case 'sequence':
    case 'draw':
    case 'trace':
    case 'highlight':
      validateWindow(mo, at, errors);
      break;
  }
}

// Structural bounds on the element tree — the trio's DoS finding. `sides`/`period` cap the
// LEAVES; these cap the TREE. Without them a `.scene.json` with a deeply-nested `children`
// chain overflows the (recursive) validator's stack — a RangeError thrown OUT of parseScene,
// which (a) a caller's per-item drop can't catch and (b) V8's iterative JSON.parse doesn't
// pre-empt. Bounded → the scene is a plain validation FAILURE (dropped), never a crash. No
// legitimate exploded-view rig is deep, and 2000 nodes is far past any real boardroom scene.
const MAX_TREE_DEPTH = 32;
const MAX_ELEMENTS = 2000;

/** Validate one element (recursively, for a built sub-tree). `ids` is shared across the
 *  whole tree so ids are unique tree-wide; `count` bounds total nodes, `depth` bounds nesting
 *  (both stop the recursion-bomb DoS). svg elements are flat (no children). */
function validateElement(raw: unknown, at: string, source: SourceModel, ids: Set<string>, errors: string[], depth: number, count: { n: number }): void {
  if (depth > MAX_TREE_DEPTH) {
    errors.push(`${at}: element tree exceeds the max nesting depth (${MAX_TREE_DEPTH})`);
    return; // stop descending — bounds the stack
  }
  if (++count.n > MAX_ELEMENTS) {
    errors.push(`scene exceeds the max element count (${MAX_ELEMENTS})`);
    return; // stop — bounds total work
  }
  if (!raw || typeof raw !== 'object') {
    errors.push(`${at} must be an object`);
    return;
  }
  const el = raw as Record<string, unknown>;
  if (typeof el.id !== 'string' || !el.id) errors.push(`${at}.id must be a non-empty string`);
  else if (ids.has(el.id)) errors.push(`${at}.id '${el.id}' is duplicated`);
  else ids.add(el.id);

  if (el.color != null) {
    const e = validateColor(el.color);
    if (e) errors.push(`${at}: ${e}`);
  }

  if (source === 'built') {
    if (!PRIMITIVES.includes(el.shape as never)) errors.push(`${at}.shape '${String(el.shape)}' is not a primitive [${PRIMITIVES.join(', ')}]`);
    if (el.transform != null) validateTransform(el.transform, at, errors);
    if (el.props != null) validateProps(el.props, at, errors);
    // Reject cross-shape fields so a confused emission fails loudly (compile ignores them).
    if (el.pathRef != null) errors.push(`${at}.pathRef is an svg-only field, but this is a built element`);
    // Nested children compose under this element (the Zdog/Three tree).
    if (el.children != null) {
      if (!Array.isArray(el.children)) errors.push(`${at}.children must be an array`);
      else {
        el.children.forEach((c, k) => {
          validateElement(c, `${at}.children[${k}]`, source, ids, errors, depth + 1, count);
        });
      }
    }
  } else {
    if (typeof el.pathRef !== 'string' || !el.pathRef) errors.push(`${at}.pathRef must be a non-empty string (a path/group id in the SVG asset)`);
    if (el.shape != null) errors.push(`${at}.shape is a built-only field, but this is an svg element`);
    // A 2-D base transform IS allowed on an svg part (the backend uses at.x/y, scale, rotate.z);
    // it shares the shape of the built Transform, so validate it the same way.
    if (el.transform != null) validateTransform(el.transform, at, errors);
    if (el.children != null) errors.push(`${at}.children is a built-only field (an svg scene is flat), but this is an svg element`);
  }

  if (el.motion != null) {
    if (!Array.isArray(el.motion)) errors.push(`${at}.motion must be an array`);
    else {
      el.motion.forEach((m, j) => {
        validateMotion(m, source, `${at}.motion[${j}]`, errors);
      });
    }
  }
}

/**
 * Validate untrusted input into a typed `Scene`, or a list of errors. Deterministic and
 * pure. The compile step (compile.ts) may then assume a well-formed scene.
 */
export function parseScene(input: unknown): ParseResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['scene must be an object'] };
  const o = input as Record<string, unknown>;

  const source = o.source;
  if (source !== 'built' && source !== 'svg') errors.push("scene.source must be 'built' or 'svg'");
  if (!isFiniteNumber(o.duration) || (o.duration as number) <= 0) errors.push('scene.duration must be a positive, finite number (ms)');
  if (!isUnit(o.hero)) errors.push('scene.hero must be a number in [0,1]');
  if (source === 'svg' && (typeof o.asset !== 'string' || !o.asset)) errors.push("an svg scene needs a non-empty 'asset' reference");
  if (source === 'built') {
    if (o.camera != null) {
      const cam = o.camera as Record<string, unknown>;
      if (typeof cam !== 'object') errors.push('scene.camera must be an object');
      else if (cam.rotate != null && !isVec3(cam.rotate)) errors.push('scene.camera.rotate must be a [x,y,z] of finite numbers (radians)');
    }
    if (o.asset != null) errors.push('scene.asset is an svg-only field, but this is a built scene');
  }
  if (source === 'svg' && o.camera != null) errors.push('scene.camera is a built-only field, but this is an svg scene');

  if (!Array.isArray(o.elements) || o.elements.length === 0) {
    errors.push('scene.elements must be a non-empty array');
    return { ok: false, errors };
  }

  // Only validate elements against a known source; an unknown source already errored.
  const src: SourceModel | null = source === 'built' || source === 'svg' ? source : null;
  if (src) {
    const ids = new Set<string>();
    const count = { n: 0 }; // total nodes across the whole tree (bounds the recursion-bomb)
    o.elements.forEach((raw, i) => {
      validateElement(raw, `elements[${i}]`, src, ids, errors, 0, count);
    });
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, scene: input as unknown as Scene };
}

/** Convenience: the motion verbs used by a validated scene (deduped), RECURSING through
 *  the built tree — a scene's motion routinely lives on a nested child (the canonical
 *  "rotor spinning inside a housing" puts `spin` on a child), so a top-level-only walk
 *  would miss it. (`requiredCaps` keeps its own draw-only top-level check — svg scenes,
 *  the only ones with a cap-gated verb, are flat.) */
export function usedVerbs(scene: Scene): MotionVerb[] {
  const set = new Set<MotionVerb>();
  const visit = (els: readonly { motion?: Motion[]; children?: unknown }[]): void => {
    for (const el of els) {
      for (const m of (el.motion ?? []) as Motion[]) set.add(m.verb);
      if (Array.isArray(el.children)) visit(el.children as readonly { motion?: Motion[] }[]);
    }
  };
  visit(scene.elements as readonly { motion?: Motion[]; children?: unknown }[]);
  return [...set];
}
