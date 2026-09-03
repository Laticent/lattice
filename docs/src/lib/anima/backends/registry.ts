// Anima backends — the DEFAULT registry: which backend paints which scene source.
//
// This lives OUTSIDE `hydrate.ts` on purpose, and the reason is bytes rather than taste.
// `hydrate.ts` used to `import` both backends at module scope and pick between them inline,
// so ANY entry that reached the host dragged in BOTH — and a chart-only player entry paid
// for Zdog it can never run: a chart scene is always `source:'svg'`, so the built-primitive
// branch is unreachable from that entry. Measured on the chart path, minified: Zdog is
// 31,039 bytes raw (8,297 gzip) of the 65,613 a chart player would otherwise ship.
//
// So the host now takes `rendererFor` as an OPTION and imports no backend itself. An entry
// declares the backends it can actually reach, and esbuild drops the rest. The full registry
// here is what the docs-site host and the scene player pass; the chart path imports the
// narrower `registry-svg.ts` instead — a SEPARATE FILE, because esbuild cannot drop a Zdog
// import that merely sits unused beside it (the package is not provably side-effect-free).
//
// It is a REQUIRED option rather than one defaulting to this file, because a default would
// reintroduce the static import it exists to remove — and because a host that silently
// mounted no backend would show a poster that looks exactly like a scene declared `still`.

import { negotiate } from '../caps';
import type { Renderer } from '../renderer';
import type { Scene } from '../types';
import { vivusRenderer } from './vivus';
import { zdogRenderer } from './zdog';

/** The backend for a scene's source model (built → Zdog, svg → Vivus), or null if none
 *  advertises the capabilities the scene needs. */
export function rendererFor(scene: Scene): Renderer | null {
  const candidate = scene.source === 'svg' ? vivusRenderer() : zdogRenderer({ zoom: 1.1 });
  return negotiate(scene, candidate.caps).length === 0 ? candidate : null;
}
