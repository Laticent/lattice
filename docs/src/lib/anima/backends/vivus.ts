// Anima — the Vivus backend: the second canonical VECTOR engine (ADR §7), for the
// drawn-figure class. It ingests an authored SVG line-art asset (source:'svg') and draws
// its strokes over the timeline via Vivus (stroke-dashoffset), sequencing paths in
// document order (Vivus `oneByOne`) driven by the scene's draw progress. SVG in → the
// poster is the finished (or partially drawn) vector, crisp in a PDF. Vivus is the one
// engine dep here, allowlisted in the boundary gate; the pure core imports none of it.
//
// SECURITY (HARD RULE #22): the SVG markup in the AssetMap is treated as UNTRUSTED. The
// HOST that resolves an asset reference to markup MUST run it through `sanitizeSlideHtml`
// (DOMPurify, SVG profile, ids preserved) BEFORE it enters the AssetMap — that is the
// authoritative boundary, and the host builder is registered in the #22 gate when Stage 5
// lands. As defense-in-depth this backend still parses the markup INERTLY (DOMParser,
// which does not run scripts/onerror at parse) and strips `<script>`/`<foreignObject>`/
// `on*` handlers / `javascript:` hrefs before it ever enters the live DOM.

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
  duration?: number; // Vivus internal duration in frames (Anima scrubs it)
  type?: 'oneByOne' | 'delayed' | 'sync';
}

// biome-ignore lint/suspicious/noExplicitAny: Vivus ships no types; the seam is contained here.
type VInst = any;

// Verbs that make an element PARTICIPATE in the draw (so a static coloured label doesn't
// pin the aggregate progress to 1 — the trio's poison case).
const DRAW_VERBS = new Set(['draw', 'trace', 'sequence', 'reveal']);

/** Find a path/group by id within an svg (safe against odd ids — no selector parsing). */
function byId(svg: Element, id: string): Element | null {
  for (const node of Array.from(svg.querySelectorAll('[id]'))) {
    if (node.id === id) return node;
  }
  return null;
}

/** INERTLY parse SVG markup (no script/onerror execution) and strip dangerous nodes as
 *  defense-in-depth. The authoritative sanitize is the host's (see the file header).
 *  Parsed as `text/html`: a DOMParser document is inert (scripts don't run, subresources
 *  don't load) AND HTML parsing infers the SVG namespace (so markup without an explicit
 *  `xmlns` still becomes real SVG — strict `image/svg+xml` would silently drop it). */
function parseSvgInert(markup: string, doc: Document): SVGSVGElement | null {
  const parsed = new DOMParser().parseFromString(markup, 'text/html');
  const svgEl = parsed.querySelector('svg');
  if (!svgEl) return null;
  for (const el of Array.from(svgEl.querySelectorAll('*'))) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'foreignobject') {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      if (n.startsWith('on') || ((n === 'href' || n === 'xlink:href') && /^\s*javascript:/i.test(attr.value))) el.removeAttribute(attr.name);
    }
  }
  return doc.importNode(svgEl, true) as unknown as SVGSVGElement;
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
  let animated = new Set<string>(); // element ids that participate in the draw

  function teardown(): void {
    if (vivus && typeof vivus.destroy === 'function') vivus.destroy();
    if (svg?.parentNode) svg.parentNode.removeChild(svg);
    vivus = null;
    svg = null;
    ready = false;
    animated = new Set();
  }

  /** The progress that drives the whole-SVG draw: the max reveal over the DRAWING elements
   *  (a static element no longer pins it to 1). Vivus sequences the paths in document order
   *  across this progress. Per-element `at`/`span` WINDOWS are not independently honored —
   *  the drawing ORDER is document order (a documented limitation; a future direct-
   *  dashoffset mode would honor arbitrary per-path windows). */
  function progressOf(state: SceneState): number {
    let p = 0;
    let any = false;
    for (const es of state.elements) {
      if (animated.has(es.id)) {
        any = true;
        if (es.reveal > p) p = es.reveal;
      }
    }
    return any ? clamp01(p) : 1; // no drawing elements → a static (fully-drawn) figure
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
      const parsed = parseSvgInert(markup, doc);
      if (!parsed) return;
      svg = parsed;
      target.appendChild(svg);
      animated = new Set(s.elements.filter((el) => (el.motion ?? []).some((m) => DRAW_VERBS.has(m.verb))).map((el) => el.id));
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
