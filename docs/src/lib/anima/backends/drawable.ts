// Anima backends — DRAWABLE: the stroke-reveal backend, on anime.js v4.
//
// Replaces the Vivus backend for authored `svg` scenes. Vivus was retired for reasons the
// bake-off measured (2026-09-02-motion-engine-bakeoff.md §2); the two that decide this file:
//
//  1. It drove the WHOLE drawing off one progress scalar, so per-element `at`/`span` windows
//     were impossible and the order was DOM document order, full stop. `createDrawable` gives
//     each element its own animation, so a window is just that element's own timeline.
//  2. It needed `getTotalLength()`, which throws in jsdom — so the entire draw channel
//     silently no-opped behind `ready = false` and nothing in the test tier could see it.
//     `createDrawable` stamps `pathLength="1000"` and works in NORMALIZED units, so it does not
//     need to measure geometry. What is actually asserted, on the real Playground against a
//     real funnel polygon, is that `pathLength` — evidence FOR normalization, not the
//     instrumented negative an earlier version of this comment claimed
//     (docs/e2e/anima-motion-frames.spec.ts). No `getTotalLength` instrumentation exists in
//     the tree; do not cite one.
//
// It also stops MUTATING the untrusted asset: Vivus's Pathformer replaced `rect`/`circle`/
// `line` nodes with `<path>` clones in the caller's DOM. Nothing here rewrites a node.
//
// The per-element transform / opacity / emphasis channels are NOT here — they are the shared
// painter (`svg-paint.ts`), which this backend composes. This file is only the draw channel.

// Subpath imports, not the barrel: `animejs/svg` pulls only the drawable helper, which
// measured 1,773 bytes raw (754 gzip) smaller than importing `svg` off the package root.
import { animate } from 'animejs';
import { createDrawable } from 'animejs/svg';
import type { RendererCaps } from '../caps';
import { clamp01 } from '../easing';
import type { AssetMap, Renderer } from '../renderer';
import type { Scene, SceneState, SvgScene } from '../types';
import { createSvgPainter } from './svg-paint';

export const DRAWABLE_CAPS: RendererCaps = {
  vector: true,
  poster: true,
  draw: true,
  true3d: false,
  gltf: false,
  live: true,
  source: ['svg'],
};

/** One element's draw animation, held paused and SEEKED per frame rather than played. The
 *  frame model owns the clock (`timeline.at(t)` upstream), so the library is used purely as a
 *  painter: `seek(p * DURATION)` makes frame k a deterministic still, which is the property the
 *  bake-off measured as path-independent (same frame from three different seek journeys). */
interface DrawTrack {
  id: string;
  seek(p: number): void;
}

/** A nominal duration for the paused timelines. Never elapses — every frame is a seek — so the
 *  value only sets the resolution of the progress mapping. */
const TRACK_MS = 1000;

export function drawableRenderer(): Renderer {
  const painter = createSvgPainter();
  let tracks: DrawTrack[] = [];

  function buildTracks(): void {
    tracks = [];
    const drawn = painter.drawn();
    if (!drawn.size) return;
    for (const part of painter.parts()) {
      if (!drawn.has(part.id)) continue;
      let anim: { seek(t: number): void } | null = null;
      try {
        // createDrawable normalizes via `pathLength`, so this does not measure the node and
        // does not throw where geometry APIs are absent.
        anim = animate(createDrawable(part.node), { draw: '0 1', duration: TRACK_MS, autoplay: false, ease: 'linear' }) as { seek(t: number): void };
      } catch {
        anim = null; // one unhandleable node must not stop the rest of the figure drawing
      }
      if (!anim) continue;
      const a = anim;
      tracks.push({ id: part.id, seek: (p) => a.seek(clamp01(p) * TRACK_MS) });
    }
  }

  /** Paint the draw channel for this frame: each drawing element seeks to ITS OWN reveal —
   *  the per-element window Vivus structurally could not honor. */
  function drawStrokes(state: SceneState): void {
    if (!tracks.length) return;
    const byId = new Map(state.elements.map((es) => [es.id, es] as const));
    for (const track of tracks) {
      const es = byId.get(track.id);
      if (es) track.seek(es.reveal);
    }
  }

  return {
    caps: DRAWABLE_CAPS,
    mount(target, scene: Scene, assets?: AssetMap) {
      painter.teardown();
      tracks = [];
      if (scene.source !== 'svg') return;
      const s = scene as SvgScene;
      if (!painter.mount(target, s, assets?.[s.asset])) return;
      buildTracks();
    },
    draw(state) {
      drawStrokes(state);
      painter.paint(state);
    },
    poster(state) {
      drawStrokes(state);
      painter.paint(state);
      const svgEl = painter.root();
      const size = painter.size();
      return { svg: svgEl ? svgEl.outerHTML : '', width: size.width, height: size.height };
    },
    dispose() {
      painter.teardown();
      tracks = [];
    },
  };
}
