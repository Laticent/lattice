// Anima backends — the SVG-ONLY registry.
//
// A separate file from `registry.ts`, and the separation is the whole point. `registry.ts`
// imports Zdog at module scope for the built-primitive branch; esbuild cannot drop that
// import even when only `svgRendererFor` is used, because the Zdog package is not provably
// side-effect-free — so a chart entry importing from there still shipped all of it
// (measured: no meaningful saving until the files were split).
//
// A chart never reaches the built branch — `chartToScene` always yields an `SvgScene` — so
// the chart path imports THIS file and Zdog is genuinely absent from the module graph.

import { negotiate } from '../caps';
import type { Renderer } from '../renderer';
import type { Scene } from '../types';
import { marksRenderer } from './marks';

/** Everything a CHART can reach: the marks painter, or null if the scene needs more than it
 *  advertises — which is exactly what `negotiate` is for. A chart emits only `reveal` and
 *  `slide`, so `MARKS_CAPS.draw = false` costs it nothing; a scene that DID carry a draw verb
 *  gets null here rather than a silently motionless figure.
 *  Importing this instead of `registry.ts` keeps both Zdog and the drawing library out. */
export function svgRendererFor(scene: Scene): Renderer | null {
  if (scene.source !== 'svg') return null;
  const candidate = marksRenderer();
  return negotiate(scene, candidate.caps).length === 0 ? candidate : null;
}
