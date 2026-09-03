// Anima backends — MARKS: the svg backend with no drawing channel at all.
//
// What a CHART needs, and nothing more. `chart-anima.ts` builds an `SvgScene` whose verbs are
// `reveal` and `slide` — it emits no `draw`/`trace` anywhere — so the stroke-draw channel is
// dead weight on that path. Under Vivus that was not merely unused but actively harmful: the
// library was constructed, its Pathformer destructively rewrote `rect`/`circle`/`line` nodes
// inside the (untrusted) asset, and it was then pinned at progress 1 for the life of the
// animation while every visible pixel came from the shared painter regardless.
//
// So this backend is the shared painter with a `caps` block, and it carries no third-party
// dependency. That is what makes a chart player small: the drawing library only enters a
// bundle that can actually reach a drawing scene (`drawable.ts`).

import type { RendererCaps } from '../caps';
import type { AssetMap, Renderer } from '../renderer';
import type { Scene, SvgScene } from '../types';
import { createSvgPainter } from './svg-paint';

/** Everything the shared painter can do. `draw: false` is the load-bearing entry — `negotiate`
 *  refuses a scene carrying a draw verb, so a drawing scene can never silently mount here and
 *  render as a motionless figure. */
export const MARKS_CAPS: RendererCaps = {
  vector: true,
  poster: true,
  draw: false,
  true3d: false,
  gltf: false,
  live: true,
  source: ['svg'],
};

export function marksRenderer(): Renderer {
  const painter = createSvgPainter();
  return {
    caps: MARKS_CAPS,
    mount(target, scene: Scene, assets?: AssetMap) {
      painter.teardown(); // idempotent: a re-mount must not leave the prior svg behind
      if (scene.source !== 'svg') return; // wrong backend; negotiate() should have caught it
      const s = scene as SvgScene;
      painter.mount(target, s, assets?.[s.asset]);
    },
    draw(state) {
      painter.paint(state);
    },
    poster(state) {
      painter.paint(state); // bake the per-element channels into the still before serializing
      const svg = painter.root();
      const size = painter.size();
      return { svg: svg ? svg.outerHTML : '', width: size.width, height: size.height };
    },
    dispose() {
      painter.teardown();
    },
  };
}
