// Anima — the Renderer contract a backend implements. The core stays renderer-agnostic
// (it emits a SceneState); a consumer injects a Renderer to paint it — the generalization
// of Cadenza's injected clock (ADR §5.1). A backend builds geometry from the static
// `scene` at `mount`, then `draw(state)` updates transforms/reveal per frame by element id.

import type { RendererCaps } from './caps';
import type { Scene, SceneState } from './types';

/** Resolved assets a backend may need: for an `svg` scene, `asset` ref → the SVG markup
 *  (the caller resolves the string reference to real markup — inline in the deck, a saved
 *  scene asset, …). A `built` backend (Zdog) ignores it.
 *
 *  SECURITY (HARD RULE #22): the markup is UNTRUSTED (a saved / AI-authored / bundle-shared
 *  scene asset). The HOST that populates this map MUST sanitize the markup with
 *  `sanitizeSlideHtml` (DOMPurify, SVG profile, ids preserved) BEFORE it enters the map — a
 *  raw asset here is an XSS sink in the same-origin Studio frame. The Vivus backend also
 *  parses inertly + strips as defense-in-depth, but sanitization is the host's contract. */
export type AssetMap = Record<string, string>;

/** A rendered still. Vector backends fill `svg` (a serialized SVG string, crisp in a PDF);
 *  raster backends fill `dataUrl`. `width`/`height` are the surface's pixel size. */
export interface Poster {
  svg?: string;
  dataUrl?: string;
  width: number;
  height: number;
}

export interface Renderer {
  readonly caps: RendererCaps;
  /** Attach the backend's surface to `host` and build geometry from the static `scene`
   *  (the shapes + hierarchy; per-frame values come from `draw`). `assets` resolves an
   *  svg scene's markup; a built backend ignores it. */
  mount(host: Element, scene: Scene, assets?: AssetMap): void;
  /** Paint one time-slice — update each element's transform/reveal by id. Called per
   *  frame; the host owns the clock + loop. Safe to call before the next frame. */
  draw(state: SceneState): void;
  /** A DETERMINISTIC still of `state` (e.g. `timeline.poster()`): draws it, serialized.
   *  NOTE: poster is mount-scoped and NOT pure — it requires a prior `mount` (reads the
   *  retained surface), scrubs the live instance (call it on a separate renderer if you're
   *  also previewing live), and returns `{ svg:'', width:0, height:0 }` if nothing is mounted.
   *  The poster's colour/recolour model for the PDF export is an open decision (ADR §15). */
  poster(state: SceneState): Poster;
  /** Tear down the surface + retained objects. */
  dispose(): void;
}
