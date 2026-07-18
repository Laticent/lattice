// Anima — the CAPABILITY model. A backend advertises what it can do (`RendererCaps`);
// the library derives what a scene REQUIRES and validates one against the other,
// failing loudly on a mismatch. This is what makes "swap / run multiple engines" a
// CHECKED contract rather than a hope (2026-07-17-anima-animation-library.md §5.1) —
// e.g. a `draw` scene routed to a build-only engine is rejected here, not mis-rendered.

import type { Scene } from './types';
import type { SourceModel } from './vocabulary';
import { VERB_CAP } from './vocabulary';

export interface RendererCaps {
  vector: boolean; // resolution-independent output (SVG) — the poster-capable path
  poster: boolean; // can produce a crisp still fit for the canonical PDF path
  draw: boolean; // progressive stroke-reveal of SVG line-art (Vivus)
  true3d: boolean; // real depth/lighting, not projected pseudo-3D (Three) — reserved
  gltf: boolean; // can load external 3D model assets (Three) — reserved
  live: boolean; // animates on an interactive surface
  /** The scene source models this backend can consume. */
  source: SourceModel[];
}

/** The capabilities a scene REQUIRES: its source model and whether it uses a draw verb.
 *  (true3d/gltf are reserved for the Three tier and never required by a Stage-1 scene.) */
export interface RequiredCaps {
  source: SourceModel;
  draw: boolean;
}

export function requiredCaps(scene: Scene): RequiredCaps {
  let draw = false;
  for (const el of scene.elements) {
    for (const m of el.motion ?? []) {
      if (VERB_CAP[m.verb] === 'draw') draw = true;
    }
  }
  return { source: scene.source, draw };
}

/**
 * Validate a scene against a backend's capabilities. Returns `[]` when the backend can
 * render the scene, else a list of human-readable mismatches. Pure — no rendering.
 */
export function negotiate(scene: Scene, caps: RendererCaps): string[] {
  const need = requiredCaps(scene);
  const errors: string[] = [];
  if (!caps.source.includes(need.source)) {
    errors.push(`scene source '${need.source}' is not in the backend's source models [${caps.source.join(', ') || 'none'}]`);
  }
  if (need.draw && !caps.draw) {
    errors.push("scene uses a draw/trace verb but the backend lacks the 'draw' capability");
  }
  if (need.source === 'svg' && !caps.vector) {
    errors.push('an svg (line-art) scene needs a vector backend to draw its strokes');
  }
  return errors;
}

/** True when the backend can render the scene (no capability mismatch). */
export function canRender(scene: Scene, caps: RendererCaps): boolean {
  return negotiate(scene, caps).length === 0;
}
