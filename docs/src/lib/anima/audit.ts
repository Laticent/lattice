// Anima — the "reads as information?" audit. A pure, heuristic check that surfaces when a
// scene's motion reads as ORNAMENT rather than MEANING — the anti-gimmick bar of
// 2026-07-18-anima-motion-faculty-modes.md §3.2, made EXPLICIT for Rig Mode (§3.1, the
// Analyst's "reads as information?" check). It never blocks: the closed vocabulary already
// keeps every verb serious, so this only ADVISES — the author-facing analog of the WCAG
// audit and the FPS readout. Deterministic and DOM-free, like the rest of the core.

import type { BuiltElement, Motion, Scene, SvgElement } from './types';

export type AuditLevel = 'info' | 'warn';
export interface AuditNote {
  level: AuditLevel;
  /** The element this note is about, when it is element-specific (else scene-wide). */
  elId?: string;
  message: string;
}

// A rotation slower than this reads as trackable EXPLANATION; faster, it blurs into a
// gimmick. 800ms/rev is a CHOSEN heuristic threshold — not a measured constant — a
// deliberately conservative "can a viewer follow a single turn?" floor, in the spirit of
// the anti-gimmick bar (2026-07-17-anima-animation-library.md §2). Tune with real feedback.
export const READABLE_PERIOD_MS = 800;

/** Every element in the scene, flattened — a built tree recurses through `children`; an
 *  svg scene is already flat. */
function allElements(scene: Scene): (BuiltElement | SvgElement)[] {
  if (scene.source !== 'built') return scene.elements;
  const out: BuiltElement[] = [];
  const walk = (els: readonly BuiltElement[]) => {
    for (const el of els) {
      out.push(el);
      if (Array.isArray(el.children)) walk(el.children);
    }
  };
  walk(scene.elements);
  return out;
}

/** Does this built element, or any descendant, render visible geometry? Only a `group`
 *  (a pure transform node) draws nothing; every other primitive is visible. */
function hasVisibleGeometry(el: BuiltElement): boolean {
  if (el.shape !== 'group') return true;
  return (el.children ?? []).some(hasVisibleGeometry);
}

/**
 * Audit a scene for motion that won't read as information. Returns notes worst-nothing:
 * an empty array means every motion earns its place. Pure — safe to call on every edit.
 */
export function auditScene(scene: Scene): AuditNote[] {
  const notes: AuditNote[] = [];
  const els = allElements(scene);

  // A still scene is legitimate (poster-first, §4.1) — but name it, so a missing verb reads
  // as a choice rather than an oversight. Nothing else to audit on a scene that doesn't move.
  const anyMotion = els.some((e) => (e.motion?.length ?? 0) > 0);
  if (!anyMotion) {
    return [{ level: 'info', message: 'This scene doesn’t move — it renders as a still poster. Add a motion verb to animate an element.' }];
  }

  for (const el of els) {
    const motions = el.motion ?? [];
    if (motions.length === 0) continue;

    // Too fast to read — a spin/orbit that blurs rather than explains.
    for (const m of motions) {
      if ((m.verb === 'spin' || m.verb === 'orbit') && m.period < READABLE_PERIOD_MS) {
        notes.push({ level: 'warn', elId: el.id, message: `“${el.id}” ${m.verb}s once every ${m.period}ms — too fast to track. A reader follows rotation at about ${READABLE_PERIOD_MS}ms per turn or slower.` });
      }
    }

    // Redundant motion — a duplicate that a reader can't tell apart. Two spins/orbits on the
    // SAME axis fold into one net rate (compile sums rotation per-axis), but on DIFFERENT axes
    // they compose into a real compound tumble — so key those by axis, every other verb by
    // name. This never flags a meaningful multi-axis rig; it flags only true redundancy.
    const sig = (m: Motion) => (m.verb === 'spin' || m.verb === 'orbit' ? `${m.verb}:${m.axis}` : m.verb);
    const sigs = motions.map(sig);
    for (const s of new Set(sigs.filter((x, i) => sigs.indexOf(x) !== i))) {
      const dup = motions.find((m) => sig(m) === s);
      notes.push({ level: 'warn', elId: el.id, message: `“${el.id}” repeats “${dup?.verb}” with no distinguishing difference — the copies read as one. Keep one.` });
    }

    // Motion with nothing to show — a group that moves but renders no geometry (an empty rig).
    if (scene.source === 'built' && (el as BuiltElement).shape === 'group' && !hasVisibleGeometry(el as BuiltElement)) {
      notes.push({ level: 'warn', elId: el.id, message: `“${el.id}” moves but has nothing to show — it’s an empty group. Give it a child shape, or the motion is invisible.` });
    }
  }

  // Dedupe identical notes — a model-generated scene can carry two byte-identical motions
  // (e.g. two same-axis too-fast spins), which would otherwise yield two identical warnings
  // (and, in the UI, a duplicate React key). One note per distinct (level·element·message).
  const seen = new Set<string>();
  return notes.filter((n) => {
    const k = `${n.level}:${n.elId ?? ''}:${n.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
