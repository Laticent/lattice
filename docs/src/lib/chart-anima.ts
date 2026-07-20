// Chart → Anima bridge: turn a Lattice chart's rendered SVG into a choreographed Anima scene,
// WITHOUT touching the chart renderers. This is the §4.3 "auto-id / role-mapping" ingest pass of
// the SVG-first plan (2026-07-19-anima-svg-first-cut-zdog.md), and the model-FREE proof-gate
// on-ramp of §0.75: our own vector in → a meaningful animation out, no LLM in the loop.
//
// Charts already identify their marks with `data-mark="i"` + a class that IS the role
// (`funnel-band`, `wedge`, `quadrant-dot`, …) — the same handles `chart-interact.js` targets. But
// the Anima svg backend addresses parts by `id`, and marks carry no stable id. So this bridge
// reads the marks, maps class → a motion ROLE, mints stable ids, and emits an `SvgScene` with a
// sensible default choreography (bars build in, labels follow, flagged marks emphasize). Anima's
// core + backend stay chart-agnostic; all chart knowledge lives here.

import type { Motion, SvgElement, SvgScene } from './anima/types';

/** A chart mark's class → its Anima motion role. Unknown `[data-mark]` geometry defaults to
 *  `bar` (build in); `<text>` defaults to `label` (fade in after). Extend as chart types land. */
const ROLE_BY_CLASS: Record<string, ChartRole> = {
  'funnel-band': 'bar',
  wedge: 'sector', // pie
  'quadrant-dot': 'point',
  'radar-area': 'bar',
  'map-region': 'region',
  'funnel-label': 'label',
  'funnel-value': 'label',
  'funnel-conv': 'label',
};

export type ChartRole = 'bar' | 'sector' | 'point' | 'region' | 'label';

export interface ChartAnimaOptions {
  /** Total timeline length, ms (default 3600). */
  duration?: number;
  /** Poster time as a fraction of duration (default 1 — the finished chart). */
  hero?: number;
  /** `data-mark` indices to EMPHASIZE (e.g. a funnel's worst drop-off). Highlighted marks get a
   *  stroke + a `highlight` pulse so the emphasis reads even on a fill-only shape. */
  highlightMarks?: number[];
  /** Fraction of the timeline the marks build over, before labels arrive (default 0.6). */
  buildSpan?: number;
  /** The AssetMap key the returned scene references (default 'chart'). */
  assetKey?: string;
  /** Stroke color token applied to a highlighted mark so its emphasis reads (default var(--ink)). */
  highlightColor?: string;
}

export interface ChartAnimaResult {
  scene: SvgScene;
  /** The chart SVG with stable ids injected — mount as `assets[assetKey]`. */
  asset: string;
  assetKey: string;
  /** What each mark became — for tests / a future choreograph inspector. */
  roles: Array<{ id: string; role: ChartRole; mark: number | null }>;
}

/** The first class on a node that we know a role for (else null). */
function roleForNode(el: Element): ChartRole | null {
  // A per-node `data-anima-role` wins if a renderer ever emits one (forward-compatible); else the class map.
  const explicit = el.getAttribute('data-anima-role');
  if (explicit && isRole(explicit)) return explicit;
  for (const cls of Array.from(el.classList)) {
    if (cls in ROLE_BY_CLASS) return ROLE_BY_CLASS[cls];
  }
  if (el.tagName.toLowerCase() === 'text') return 'label';
  return null;
}

function isRole(s: string): s is ChartRole {
  return s === 'bar' || s === 'sector' || s === 'point' || s === 'region' || s === 'label';
}

/** Parse chart markup inertly (no script/subresource execution) and return its root <svg>, or
 *  null. Mirrors the backend's `parseSvgInert` intent; the mounted asset is re-sanitized there. */
function parseSvg(markup: string): SVGSVGElement | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  return doc.querySelector('svg');
}

/**
 * Turn a chart's rendered SVG into a default-choreographed Anima scene. Returns null if the markup
 * has no <svg> or no recognizable marks (the caller shows the static chart). Pure w.r.t. its
 * inputs (it clones + mutates a fresh parse, never the caller's string).
 */
export function chartToScene(markup: string, opts: ChartAnimaOptions = {}): ChartAnimaResult | null {
  const svg = parseSvg(markup);
  if (!svg) return null;

  const duration = opts.duration ?? 3600;
  const hero = opts.hero ?? 1;
  const buildSpan = Math.min(0.9, Math.max(0.1, opts.buildSpan ?? 0.6));
  const assetKey = opts.assetKey ?? 'chart';
  const highlight = new Set(opts.highlightMarks ?? []);
  const highlightColor = opts.highlightColor ?? 'var(--ink)';

  // Geometry marks (bars/sectors/…) build; text marks (labels/values) follow. Document order is
  // the build order, which for a top-to-bottom funnel reads correctly.
  const markNodes = Array.from(svg.querySelectorAll('[data-mark]'));
  const textNodes = Array.from(svg.querySelectorAll('text'));

  const elements: SvgElement[] = [];
  const roles: ChartAnimaResult['roles'] = [];
  const seen = new Set<string>();
  const uniqueId = (base: string): string => {
    let id = base;
    let n = 1;
    while (seen.has(id)) id = `${base}-${n++}`;
    seen.add(id);
    return id;
  };

  // ── geometry marks: staggered fade-in over [0, buildSpan] (opacity, not stroke — most marks
  //    are filled shapes). A flagged mark also emphasizes.
  const n = Math.max(1, markNodes.length);
  const slot = buildSpan / n;
  markNodes.forEach((node, i) => {
    const role = roleForNode(node) ?? 'bar';
    const markAttr = node.getAttribute('data-mark');
    const mark = markAttr != null ? Number(markAttr) : null;
    const id = uniqueId(role === 'label' ? `label-m${i}` : `${role}-${markAttr ?? i}`);
    node.setAttribute('id', id);

    const motion: Motion[] = [{ verb: 'reveal', at: i * slot, span: slot + 0.08 }];
    const el: SvgElement = { id, pathRef: id, motion };
    if (mark != null && highlight.has(mark)) {
      // A fill-only chart mark often carries a CSS stroke (e.g. the funnel band's `--bg` separator)
      // that a presentation ATTRIBUTE can't override — so paint the emphasis stroke as INLINE STYLE
      // (which outranks the rule), and pulse its weight AFTER the build so the eye lands on the
      // point once the chart is assembled. (Line-art SVGs use `el.color`; charts need the override.)
      (node as unknown as SVGElement).style.stroke = highlightColor;
      motion.push({ verb: 'highlight', at: buildSpan, span: 1 - buildSpan });
    }
    elements.push(el);
    roles.push({ id, role, mark });
  });

  // ── text marks: fade in as the build completes ([buildSpan·0.85 … end]).
  const labelAt = Math.min(0.95, buildSpan * 0.85);
  textNodes.forEach((node) => {
    if (node.id && seen.has(node.id)) return; // already handled (a text with data-mark)
    const id = uniqueId('label');
    node.setAttribute('id', id);
    elements.push({ id, pathRef: id, motion: [{ verb: 'reveal', at: labelAt, span: 1 - labelAt }] });
    roles.push({ id, role: 'label', mark: null });
  });

  if (elements.length === 0) return null;

  const scene: SvgScene = { source: 'svg', duration, hero, asset: assetKey, elements };
  return { scene, asset: svg.outerHTML, assetKey, roles };
}
