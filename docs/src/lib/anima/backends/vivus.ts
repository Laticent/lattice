// Anima — the Vivus backend: the second canonical VECTOR engine (ADR §7), for the
// drawn-figure class. It ingests an authored SVG line-art asset (source:'svg') and draws
// its strokes over the timeline via Vivus's stroke-dashoffset technique, driven by the
// scene's `reveal` (progress 0→1). SVG in → the poster is the finished (or partially
// drawn) vector, crisp in a PDF. Vivus is the one engine dep here, allowlisted in the
// boundary gate; the pure core imports none of it.

// @ts-expect-error vivus ships no type declarations; the untyped seam is contained (VInst = any).
import Vivus from 'vivus';
import type { RendererCaps } from '../caps';
import { clamp01 } from '../easing';
import type { AssetMap, Renderer } from '../renderer';
import type { Scene, SceneState, SvgScene } from '../types';
import { resolveColor } from './paint';

export const VIVUS_CAPS: RendererCaps = {
  vector: true,
  poster: true,
  draw: true,
  true3d: false,
  gltf: false,
  live: true,
  source: ['svg'],
};

export interface VivusOptions {
  /** Vivus internal duration in frames (only affects its own timing; Anima scrubs it). */
  duration?: number;
  /** How the strokes distribute across paths: sequential or all-at-once. */
  type?: 'oneByOne' | 'delayed' | 'sync';
}

// biome-ignore lint/suspicious/noExplicitAny: Vivus ships no types; the seam is contained here.
type VInst = any;

/** Find a path/group by id within an svg (safe against odd ids — no selector parsing). */
function byId(svg: SVGSVGElement, id: string): Element | null {
  for (const node of Array.from(svg.querySelectorAll('[id]'))) {
    if (node.id === id) return node;
  }
  return null;
}

function svgSize(svg: SVGSVGElement): { width: number; height: number } {
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const p = vb.trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && p.every(Number.isFinite)) return { width: p[2], height: p[3] };
  }
  return { width: Number(svg.getAttribute('width')) || 300, height: Number(svg.getAttribute('height')) || 150 };
}

export function vivusRenderer(opts: VivusOptions = {}): Renderer {
  let svg: SVGSVGElement | null = null;
  let vivus: VInst = null;
  let ready = false;

  function teardown(): void {
    if (vivus && typeof vivus.destroy === 'function') vivus.destroy();
    if (svg?.parentNode) svg.parentNode.removeChild(svg);
    vivus = null;
    svg = null;
    ready = false;
  }

  /** The aggregate reveal that drives the whole-SVG draw: the max over the scene's svg
   *  elements, so the drawing progresses as its lead stroke reveals over the timeline. */
  function progressOf(state: SceneState): number {
    let p = 0;
    for (const es of state.elements) if (es.reveal > p) p = es.reveal;
    return clamp01(p);
  }

  const renderer: Renderer = {
    caps: VIVUS_CAPS,
    mount(target, scene: Scene, assets?: AssetMap) {
      teardown(); // idempotent: a re-mount must not leave the prior svg/Vivus behind
      if (scene.source !== 'svg') return; // wrong engine; negotiate() should have caught it
      const s = scene as SvgScene;
      const markup = assets?.[s.asset];
      const doc = target.ownerDocument;
      if (!doc || !markup) return; // no resolved asset → nothing to draw (a placeholder is the host's job)
      const wrap = doc.createElement('div');
      wrap.innerHTML = markup;
      const found = wrap.querySelector('svg');
      if (!found) return;
      svg = found as unknown as SVGSVGElement;
      target.appendChild(svg);
      // Resolve token stroke colours on the referenced paths (palette-blind, #3).
      for (const el of s.elements) {
        if (!el.color) continue;
        const node = byId(svg, el.pathRef);
        if (node) node.setAttribute('stroke', resolveColor(el.color, target));
      }
      try {
        vivus = new Vivus(svg, { type: opts.type ?? 'oneByOne', start: 'manual', duration: opts.duration ?? 200 });
        ready = true;
      } catch {
        ready = false; // e.g. jsdom has no getTotalLength — draw becomes a no-op; the real browser draws
      }
    },
    draw(state) {
      if (!vivus || !ready) return;
      vivus.setFrameProgress(progressOf(state));
    },
    poster(state) {
      if (vivus && ready) vivus.setFrameProgress(progressOf(state));
      const size = svg ? svgSize(svg) : { width: 0, height: 0 };
      return { svg: svg ? svg.outerHTML : '', width: size.width, height: size.height };
    },
    dispose() {
      teardown();
    },
  };
  return renderer;
}
