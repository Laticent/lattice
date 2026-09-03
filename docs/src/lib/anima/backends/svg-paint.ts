// Anima backends — the SHARED SVG PAINTER.
//
// Everything a backend that paints an svg scene needs, MINUS the stroke-draw channel: inert
// parsing of the (untrusted) asset, part resolution, and the per-frame transform / opacity /
// emphasis pass. It carries no third-party dependency at all.
//
// It exists because the draw channel is the ONLY part that differs between backends, and it
// is the only part that costs bytes. Charts emit no `draw`/`trace` at all (`chart-anima.ts`
// builds `reveal` + `slide`), so a chart player needs this file and nothing else; an authored
// svg scene that draws adds anime.js on top (`drawable.ts`). Keeping the split at the module
// boundary is what lets a chart-only bundle omit the drawing library entirely — the same
// reason `registry-svg.ts` is a separate file from `registry.ts`.
//
// Extracted verbatim from the Vivus backend (HARD RULE #1: one source of truth), which had
// grown all of this around a library that, on the chart path, painted nothing — every visible
// pixel already came from `paintElements` here.

import { clamp01 } from '../easing';
import type { SceneState, SvgScene } from '../types';
import { resolveColor } from './paint';

/** A part that reveals WITHOUT drawing shows via opacity. A part that draws is revealed by
 *  its stroke instead, so fading it too would double-apply the reveal. */
function isFadeElement(motion: readonly { verb: string }[]): boolean {
  const verbs = new Set(motion.map((m) => m.verb));
  return verbs.has('reveal') && !verbs.has('draw') && !verbs.has('trace');
}

const STRIP_TAGS = new Set(['script', 'foreignobject', 'style', 'image', 'use', 'animate', 'animatetransform', 'animatemotion', 'set']);

/** INERTLY parse SVG markup (no script/onerror execution) and strip side-effecting / off-origin
 *  nodes as defense-in-depth (STRIP_TAGS). Parsed as `text/html`: a DOMParser document is inert
 *  (scripts don't run, subresources don't load) AND HTML parsing infers the SVG namespace (so
 *  markup without an explicit `xmlns` still becomes real SVG — strict `image/svg+xml` would drop
 *  it). */
function parseSvgInert(markup: string, doc: Document): SVGSVGElement | null {
  const parsed = new DOMParser().parseFromString(markup, 'text/html');
  const svgEl = parsed.querySelector('svg');
  if (!svgEl) return null;
  for (const el of Array.from(svgEl.querySelectorAll('*'))) {
    if (STRIP_TAGS.has(el.tagName.toLowerCase())) {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const n = attr.name.toLowerCase();
      // Strip event handlers and javascript: hrefs. (The main off-origin FETCH vectors —
      // <image>/<use>/<style>@import — are removed as whole ELEMENTS via STRIP_TAGS above;
      // external `url()` in a filter/mask/fill attribute is not a fetch vector browsers honor
      // cross-document, so it's left alone. DOMPurify at the host boundary remains authoritative.)
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
export interface Part {
  id: string;
  node: Element;
  isFade: boolean; // reveal without draw/trace → shows via opacity
  hasHighlight: boolean; // bumps stroke-weight on emphasis
  hasTransform: boolean; // has a base transform or a slide verb → paints a transform
  baseStrokeWidth: number; // the un-emphasized stroke weight (attribute, CSS-computed, or a 2 default)
  origTransform: string; // any transform already on the node, kept innermost
  cx: number; // the part's center (bbox), for rotate/scale
  cy: number;
}

/** Round to 3 dp so a transform/opacity string stays compact and stable (poster bytes). */
function fmt(n: number): number {
  return Number(n.toFixed(3));
}

/** Element ids whose motion includes a stroke-draw verb. A drawing backend animates these;
 *  the shared painter only needs to know which parts must NOT be faded in by opacity. */
export const DRAW_VERBS: ReadonlySet<string> = new Set(['draw', 'trace', 'sequence']);

/** How much a `highlight` bumps stroke weight at full emphasis. */
const EMPHASIS_GAIN = 0.9;

export interface SvgPainter {
  /** Parse + attach the asset, resolve parts. Returns false when there is nothing to paint. */
  mount(target: Element, scene: SvgScene, markup: string | undefined): boolean;
  /** The per-frame transform / opacity / emphasis pass. */
  paint(state: SceneState): void;
  /** The parts resolved at mount, for a drawing backend to attach its own channel to. */
  parts(): readonly Part[];
  /** Ids that carry a draw verb. */
  drawn(): ReadonlySet<string>;
  root(): SVGSVGElement | null;
  size(): { width: number; height: number };
  teardown(): void;
}

/** The shared painter. A backend wraps this and adds only its stroke-draw channel. */
export function createSvgPainter(): SvgPainter {
  let svg: SVGSVGElement | null = null;
  let parts: Part[] = [];
  let animated: Set<string> = new Set();

  function composeTransform(es: SceneState['elements'][number], part: Part): string {
    const [tx, ty] = es.transform.at;
    const s = es.transform.scale;
    const rzDeg = (es.transform.rotate[2] * 180) / Math.PI;
    let out = `translate(${fmt(tx)} ${fmt(ty)})`;
    if (Math.abs(rzDeg) > 1e-4 || Math.abs(s - 1) > 1e-4) {
      out += ` translate(${fmt(part.cx)} ${fmt(part.cy)}) rotate(${fmt(rzDeg)}) scale(${fmt(s)}) translate(${fmt(-part.cx)} ${fmt(-part.cy)})`;
    }
    // The part's own authored transform goes OUTERMOST (applied last), so our motion runs in the
    // part's LOCAL space — the space `getBBox` measured, where the `cx/cy` rotate/scale pivot is
    // valid. Innermost would pivot in the already-placed space and swing the part off-position.
    return part.origTransform ? `${part.origTransform} ${out}` : out;
  }

  return {
    mount(target, s, markup) {
      const doc = target.ownerDocument;
      if (!doc || !markup) return false;
      const parsed = parseSvgInert(markup, doc);
      if (!parsed) return false;
      svg = parsed;
      target.appendChild(svg);
      animated = new Set(s.elements.filter((el) => (el.motion ?? []).some((m) => DRAW_VERBS.has(m.verb))).map((el) => el.id));
      const nodeById = new Map<string, Element>();
      for (const node of Array.from(svg.querySelectorAll('[id]'))) {
        if (!nodeById.has(node.id)) nodeById.set(node.id, node);
      }
      parts = [];
      for (const el of s.elements) {
        const node = nodeById.get(el.pathRef);
        if (!node) continue;
        if (el.color) node.setAttribute('stroke', resolveColor(el.color, target));
        const motion = el.motion ?? [];
        let bw = Number(node.getAttribute('stroke-width'));
        if (!(Number.isFinite(bw) && bw > 0) && doc.defaultView) {
          const csw = Number.parseFloat(doc.defaultView.getComputedStyle(node).strokeWidth);
          if (Number.isFinite(csw) && csw > 0) bw = csw;
        }
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
      return true;
    },
    paint(state) {
      if (!parts.length) return;
      const stateById = new Map(state.elements.map((es) => [es.id, es] as const));
      for (const part of parts) {
        const es = stateById.get(part.id);
        if (!es) continue;
        if (part.hasTransform) part.node.setAttribute('transform', composeTransform(es, part));
        if (part.isFade) part.node.setAttribute('opacity', String(clamp01(es.reveal)));
        // Via INLINE STYLE, not the presentation attribute: an (untrusted) asset can style
        // stroke-width through a <style> rule or inline style, which outranks a presentation
        // attribute and would make the emphasis a silent no-op. Inline style wins over both.
        if (part.hasHighlight) (part.node as SVGElement).style.strokeWidth = String(fmt(part.baseStrokeWidth * (1 + clamp01(es.emphasis) * EMPHASIS_GAIN)));
      }
    },
    parts: () => parts,
    drawn: () => animated,
    root: () => svg,
    size: () => (svg ? svgSize(svg) : { width: 0, height: 0 }),
    teardown() {
      if (svg?.parentNode) svg.parentNode.removeChild(svg);
      svg = null;
      parts = [];
      animated = new Set();
    },
  };
}
