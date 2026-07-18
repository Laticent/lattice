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
const TOKEN_COLOR = /^var\(--[a-z0-9-]+(?:\s*,\s*var\(--[a-z0-9-]+\))?\)$/i;
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
      if (!isFiniteNumber(mo.period) || (mo.period as number) <= 0) errors.push(`${at}.period must be a positive number (ms)`);
      break;
    case 'bob':
      if (!AXES.includes(mo.axis as never)) errors.push(`${at}.axis must be one of [${AXES.join(', ')}]`);
      if (!isFiniteNumber(mo.amplitude)) errors.push(`${at}.amplitude must be a finite number`);
      if (!isFiniteNumber(mo.period) || (mo.period as number) <= 0) errors.push(`${at}.period must be a positive number (ms)`);
      break;
    case 'fill':
      if (!isUnit(mo.to)) errors.push(`${at}.to must be a level in [0,1]`);
      validateWindow(mo, at, errors);
      break;
    case 'explode':
      if (!isFiniteNumber(mo.distance)) errors.push(`${at}.distance must be a finite number`);
      validateWindow(mo, at, errors);
      break;
    case 'reveal':
    case 'sequence':
    case 'draw':
    case 'trace':
      validateWindow(mo, at, errors);
      break;
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
  if (source === 'built' && o.camera != null) {
    const cam = o.camera as Record<string, unknown>;
    if (typeof cam !== 'object') errors.push('scene.camera must be an object');
    else if (cam.rotate != null && !isVec3(cam.rotate)) errors.push('scene.camera.rotate must be a [x,y,z] of finite numbers (radians)');
  }

  if (!Array.isArray(o.elements) || o.elements.length === 0) {
    errors.push('scene.elements must be a non-empty array');
    return { ok: false, errors };
  }

  // Only validate element shape against a known source; an unknown source already errored.
  const src: SourceModel | null = source === 'built' || source === 'svg' ? source : null;
  const ids = new Set<string>();
  o.elements.forEach((raw, i) => {
    const at = `elements[${i}]`;
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

    if (src === 'built') {
      if (!PRIMITIVES.includes(el.shape as never)) errors.push(`${at}.shape '${String(el.shape)}' is not a primitive [${PRIMITIVES.join(', ')}]`);
      if (el.transform != null) validateTransform(el.transform, at, errors);
    } else if (src === 'svg') {
      if (typeof el.pathRef !== 'string' || !el.pathRef) errors.push(`${at}.pathRef must be a non-empty string (a path/group id in the SVG asset)`);
    }

    if (el.motion != null) {
      if (!Array.isArray(el.motion)) errors.push(`${at}.motion must be an array`);
      else if (src) {
        el.motion.forEach((m, j) => {
          validateMotion(m, src, `${at}.motion[${j}]`, errors);
        });
      }
    }
  });

  if (errors.length) return { ok: false, errors };
  return { ok: true, scene: input as unknown as Scene };
}

/** Convenience: the motion verbs used by a validated scene (deduped). */
export function usedVerbs(scene: Scene): MotionVerb[] {
  const set = new Set<MotionVerb>();
  for (const el of scene.elements) for (const m of (el.motion ?? []) as Motion[]) set.add(m.verb);
  return [...set];
}
