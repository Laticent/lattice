// Anima — the SVG backend: the second canonical VECTOR engine (ADR §7), for the
// drawn-figure class. It ingests an authored SVG line-art asset (source:'svg') and paints
// the timeline onto it two ways: Vivus drives the STROKE-DRAW (stroke-dashoffset, paths in
// document order via `oneByOne`) for draw/trace/sequence; and a PER-ELEMENT paint pass
// (`paintElements`) applies the channels the single Vivus scalar can't — transform (the
// `slide` verb + a part's base transform), opacity (`reveal` on a non-drawn part, e.g. a
// label), and emphasis (`highlight` → stroke-weight). SVG in → the poster is the finished
// (or partially built) vector with those channels baked in, crisp in a PDF. Vivus is the one
// engine dep here, allowlisted in the boundary gate; the pure core imports none of it.
// (Per-element stroke-draw WINDOWS still ride Vivus's document-order scalar — replacing that
// with direct per-path dashoffset is the next slice; see 2026-07-19 §4.4a.)
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

// Verbs that make an element PARTICIPATE in the stroke-draw (so a static colored label
// doesn't pin the aggregate progress to 1 — the trio's poison case). `reveal` is NOT here:
// a reveal fades a part in via OPACITY (paintElements), not a stroke, so it must not pin the
// stroke aggregate (2026-07-19-anima-svg-first-cut-zdog.md §4.4a).
const DRAW_VERBS = new Set(['draw', 'trace', 'sequence']);

// A `highlight` element bumps its stroke-weight by up to this factor at full emphasis — a
// restrained attention cue (the anti-gimmick bar), enough to read as "look here", not a flash.
const EMPHASIS_GAIN = 0.9;

/** The verbs that make a part FADE via opacity rather than stroke: a `reveal` that isn't also
 *  a draw/trace. (A path is normally drawn; a label is normally revealed.) */
function isFadeElement(motion: readonly { verb: string }[]): boolean {
  const verbs = new Set(motion.map((m) => m.verb));
  return verbs.has('reveal') && !verbs.has('draw') && !verbs.has('trace');
}

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

/** A resolved svg part: its DOM node plus the paint metadata captured once at mount, so the
 *  per-frame `paintElements` pass stays allocation-light and never re-reads the DOM. */
interface Part {
  id: string;
  node: Element;
  isFade: boolean; // reveal without draw/trace → shows via opacity
  hasHighlight: boolean; // bumps stroke-weight on emphasis
  hasTransform: boolean; // has a base transform or a slide verb → paints a transform
  baseStrokeWidth: number; // the un-emphasized stroke weight (attribute, or a 2 default)
  origTransform: string; // any transform already on the node, kept innermost
  cx: number; // the part's center (bbox), for rotate/scale
  cy: number;
}

/** Round to 3 dp so a transform/opacity string stays compact and stable (poster bytes). */
function fmt(n: number): number {
  return Number(n.toFixed(3));
}

export function vivusRenderer(opts: VivusOptions = {}): Renderer {
  let svg: SVGSVGElement | null = null;
  let vivus: VInst = null;
  let ready = false;
  let animated = new Set<string>(); // element ids that participate in the stroke-draw
  let parts: Part[] = []; // resolved svg parts + their per-element paint metadata

  function teardown(): void {
    if (vivus && typeof vivus.destroy === 'function') vivus.destroy();
    if (svg?.parentNode) svg.parentNode.removeChild(svg);
    vivus = null;
    svg = null;
    ready = false;
    animated = new Set();
    parts = [];
  }

  /** The SVG-`transform`-attribute string for a part this frame: a translate (base `at` +
   *  the `slide` verb), plus — only when needed — a rotate/scale about the part's own center.
   *  Any transform already on the node is kept innermost so our motion composes on top. */
  function composeTransform(es: SceneState['elements'][number], part: Part): string {
    const [tx, ty] = es.transform.at;
    const s = es.transform.scale;
    const rzDeg = (es.transform.rotate[2] * 180) / Math.PI;
    let out = `translate(${fmt(tx)} ${fmt(ty)})`;
    if (Math.abs(rzDeg) > 1e-4 || Math.abs(s - 1) > 1e-4) {
      out += ` translate(${fmt(part.cx)} ${fmt(part.cy)}) rotate(${fmt(rzDeg)}) scale(${fmt(s)}) translate(${fmt(-part.cx)} ${fmt(-part.cy)})`;
    }
    return part.origTransform ? `${out} ${part.origTransform}` : out;
  }

  /** Paint the PER-ELEMENT channels the single-scalar stroke-draw can't: transform (slide +
   *  base), opacity (reveal on a non-drawn part), and emphasis (highlight → stroke-weight).
   *  DOM-attribute-only, so it runs in jsdom AND serializes cleanly into the poster — and it
   *  runs even when Vivus itself couldn't initialise (no `getTotalLength`). */
  function paintElements(state: SceneState): void {
    if (!parts.length) return;
    const stateById = new Map(state.elements.map((es) => [es.id, es] as const));
    for (const part of parts) {
      const es = stateById.get(part.id);
      if (!es) continue;
      if (part.hasTransform) part.node.setAttribute('transform', composeTransform(es, part));
      if (part.isFade) part.node.setAttribute('opacity', String(clamp01(es.reveal)));
      if (part.hasHighlight) part.node.setAttribute('stroke-width', String(fmt(part.baseStrokeWidth * (1 + clamp01(es.emphasis) * EMPHASIS_GAIN))));
    }
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
      // Build Vivus FIRST: its Pathformer (in the ctor) rewrites shape nodes (rect/circle/…)
      // into <path>s, REPLACING the DOM nodes. So capture part refs + colors AFTER, against the
      // rewritten nodes — else paintElements would mutate detached originals (byId matches the
      // preserved id either way).
      try {
        vivus = new Vivus(svg, { type: opts.type ?? 'oneByOne', start: 'manual', duration: opts.duration ?? 200 });
        ready = true;
      } catch {
        ready = false; // e.g. jsdom has no getTotalLength — draw becomes a no-op; the real browser draws
      }
      // Resolve each part's node ONCE and capture the metadata paintElements needs per frame:
      // token stroke color (palette-blind, #3), base stroke weight, center, and which channels
      // it paints (fade / highlight / transform). A part whose pathRef doesn't resolve is skipped.
      parts = [];
      for (const el of s.elements) {
        const node = byId(svg, el.pathRef);
        if (!node) continue;
        if (el.color) node.setAttribute('stroke', resolveColor(el.color, target));
        const motion = el.motion ?? [];
        const bw = Number(node.getAttribute('stroke-width'));
        let cx = 0;
        let cy = 0;
        try {
          const bb = (node as SVGGraphicsElement).getBBox();
          cx = bb.x + bb.width / 2;
          cy = bb.y + bb.height / 2;
        } catch {
          /* jsdom / detached node has no getBBox — center stays 0 (translate-only slide is unaffected) */
        }
        parts.push({
          id: el.id,
          node,
          isFade: isFadeElement(motion),
          hasHighlight: motion.some((m) => m.verb === 'highlight'),
          hasTransform: el.transform != null || motion.some((m) => m.verb === 'slide'),
          baseStrokeWidth: Number.isFinite(bw) && bw > 0 ? bw : 2,
          origTransform: node.getAttribute('transform') ?? '',
          cx,
          cy,
        });
      }
    },
    draw(state) {
      // Stroke-draw needs Vivus (the real browser); per-element paint does not, so it runs
      // regardless — transforms/opacity/emphasis animate even where getTotalLength is absent.
      if (vivus && ready) vivus.setFrameProgress(progressOf(state));
      paintElements(state);
    },
    poster(state) {
      if (vivus && ready) vivus.setFrameProgress(progressOf(state));
      paintElements(state); // bake the per-element channels into the still before serialising
      const size = svg ? svgSize(svg) : { width: 0, height: 0 };
      return { svg: svg ? svg.outerHTML : '', width: size.width, height: size.height };
    },
    dispose() {
      teardown();
    },
  };
  return renderer;
}
