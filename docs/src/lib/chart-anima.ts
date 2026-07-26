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

import { validateColor } from './anima/schema';
import type { Motion, SvgElement, SvgScene } from './anima/types';

/** A chart mark's class → its Anima motion role. Unknown `[data-mark]` geometry defaults to
 *  `bar` (build in); `<text>` defaults to `label` (fade in after). Extend as chart types land.
 *
 *  EVERY KEY HERE MUST BE A CLASS A RENDERER ACTUALLY EMITS. This map is a FALLBACK for charts
 *  that predate `data-anima-role`; an entry for a class nothing emits is not a harmless
 *  placeholder, it is dead code that reads as working support. `'radar-area': 'bar'` was exactly
 *  that — the radar emits `.radar-poly`, never `.radar-area`, so the entry never once matched and
 *  the radar's shape silently never animated. It is removed rather than renamed: the radar now
 *  declares `data-anima-role` natively, which outranks this map anyway.
 *  `chart-anima.test.ts` gates the map against the emitters so it cannot rot again. */
const ROLE_BY_CLASS: Record<string, ChartRole> = {
  'funnel-band': 'bar',
  wedge: 'sector', // pie
  'quadrant-dot': 'point',
  'quadrant-bubble': 'point',       // sized scatter — a point with a magnitude
  'quadrant-trail-after': 'point',  // the "after" end of a movement trail
  'radar-poly': 'region',           // a series' filled area
  'map-region': 'region',
  'funnel-label': 'label',
  'funnel-value': 'label',
  'funnel-conv': 'label',
};

export type ChartRole = 'bar' | 'sector' | 'point' | 'region' | 'label';

/** The choreography a chart animates with — the closed style vocabulary the `motion` deck
 *  setting / `motion-*` slide class select (§0.75 "closed set of policies"):
 *  - `build`    — role-aware staggered reveal: bars build top-to-bottom, a closed disc's sectors
 *                 fade in together (a staggered wedge leaves a holey gap). The sensible default.
 *  - `together` — the WHOLE chart fades in at once (every mark synchronized), regardless of role.
 *  - `rise`     — the build, plus each mark slides UP into place as it reveals. */
export type ChartAnimaStyle = 'build' | 'together' | 'rise';

export interface ChartAnimaOptions {
  /** Which choreography to animate with (default 'build'). */
  style?: ChartAnimaStyle;
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
  // A per-node `data-anima-role` is AUTHORITATIVE — the renderer declares the role (the funnel emits
  // it natively; §0.75), so we honor it over the class map rather than guessing from the class name.
  // The class map is the fallback for charts that don't yet emit roles.
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

/** A node's `data-mark` as a usable index, or null. Only a clean integer counts: '' / non-numeric
 *  → null (unindexed, never matched by `highlightMarks`), so `data-mark=""` isn't silently treated
 *  as mark 0. Shared by the geometry and label passes so a LABEL that carries an index (the radar
 *  tags its axis labels, which are its popover marks) keeps it — reporting `mark: null` there would
 *  drop it from `roles` and make `highlightMarks` unable to emphasize an axis. */
function markIndexOf(el: Element): number | null {
  const raw = el.getAttribute('data-mark');
  const parsed = raw != null && raw !== '' ? Number(raw) : Number.NaN;
  return Number.isInteger(parsed) ? parsed : null;
}

/** Parse chart markup inertly (no script/subresource execution) and return its root <svg>, or
 *  null. Mirrors the backend's `parseSvgInert` intent; the mounted asset is re-sanitized there. */
function parseSvg(markup: string): SVGSVGElement | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(markup, 'text/html');
  return doc.querySelector('svg');
}

// Per-call namespace counter — a scene mounts a COPY of the chart svg alongside the still poster (in
// the SAME document, poster hidden). Renderer-emitted `<defs>` ids (e.g. the pie/quadrant/radar
// `pie-wedge-N` radial gradients) are IDENTICAL in both, so a wedge's `fill:url(#pie-wedge-N)` would
// resolve to the FIRST match — the display:none poster's def — and paint NOTHING (the gradient-filled
// charts rendered as bare outlines). Namespacing the copy's ids + their fragment references makes the
// animated svg self-contained. Base-36 keeps the token short; a plain counter is deterministic
// (no Date/Math.random) and unique per hydration, so two charts on one page don't collide either.
//
// NOTE (host-property boundary — logged per HARD RULE #18): the "identical-id copy beside a
// display:none original" hazard is really a property of the SHARED HOST's mount strategy
// (anima/hydrate.ts hides the poster with display:none and mounts a copy of its markup), not of the
// chart adapter. We namespace HERE because the chart path is the only one that ships `<defs>` paint
// servers today — spec (`data-scene-spec`) svg scenes are currently Vivus line-art (stroked paths, no
// gradient defs), so their identical-markup copy has nothing to collide. If a baked svg scene ever
// carries gradient/clip/mask defs it inherits the same bug and the host mount would need the same
// treatment (or, categorically, `poster.remove()` instead of display:none). See gotchas.md.
let CHART_NS_SEQ = 0;

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Namespace every id already in the svg (the renderer's `<defs>` paint-servers) with a unique
 *  per-call prefix, and rewrite every internal fragment reference to match — `url(#id)` (in `fill`/
 *  `stroke`/`clip-path`/… attributes AND inline `style`), and `href` / `xlink:href="#id"`. The mark
 *  ids Anima mints below are fresh + copy-only, so this only touches pre-existing defs; a chart with
 *  no ids (the funnel — CSS fills, no gradients) is a no-op. */
function namespaceInternalRefs(svg: SVGSVGElement): void {
  const ided = Array.from(svg.querySelectorAll('[id]'));
  if (ided.length === 0) return;
  const ns = `ca${(++CHART_NS_SEQ).toString(36)}`;
  const rename = new Map<string, string>();
  for (const el of ided) {
    const old = el.getAttribute('id');
    if (!old) continue;
    const nu = `${ns}-${old}`;
    rename.set(old, nu);
    el.setAttribute('id', nu);
  }
  // The leading `#` stops a match INSIDE a longer id (`#foo` won't hit `#barfoo`); the trailing
  // `(?![\w-])` stops it at the END (`#foo` won't hit `#foobar` — a fragment ends at `)`/`"`, never
  // an id char). Longest-first is redundant belt-and-suspenders. Coverage is ATTRIBUTE VALUES ONLY
  // (`style` + presentation attrs like `fill`/`clip-path`) — the only ref form the chart renderers
  // emit; SMIL `begin="id.evt"` / `<style>`-text refs are out of scope (and STRIP_TAGS-removed downstream).
  const olds = Array.from(rename.keys()).sort((a, b) => b.length - a.length);
  for (const el of [svg, ...Array.from(svg.querySelectorAll('*'))]) {
    for (const name of el.getAttributeNames()) {
      const val = el.getAttribute(name);
      if (!val || val.indexOf('#') === -1) continue;
      let out = val;
      for (const old of olds) {
        if (out.indexOf(`#${old}`) === -1) continue;
        const nu = rename.get(old);
        // FUNCTION replacement, not a string: a namespaced id derived from an attacker-supplied
        // id can contain `$&` / `$'` / `$$` etc., which `String.replace` would expand in a string
        // replacement — corrupting the ref back into a dangling pointer (the original bug). A thunk
        // is opaque to `$`-substitution. (`nu` is constant per `old`.)
        out = out.replace(new RegExp(`#${escapeReg(old)}(?![\\w-])`, 'g'), () => `#${nu}`);
      }
      if (out !== val) el.setAttribute(name, out);
    }
  }
}

/**
 * Turn a chart's rendered SVG into a default-choreographed Anima scene. Returns null if the markup
 * has no <svg> or no recognizable marks (the caller shows the static chart). Pure w.r.t. its
 * inputs (it clones + mutates a fresh parse, never the caller's string).
 *
 * SECURITY: the returned `asset` is the chart's own markup with ids/inline-styles injected — it is
 * NOT re-sanitized here. The caller MUST pass it through the host's `sanitizeSlideHtml` at the
 * AssetMap boundary before it reaches a preview frame (HARD RULE #22), exactly as for any svg asset.
 */
export function chartToScene(markup: string, opts: ChartAnimaOptions = {}): ChartAnimaResult | null {
  // Bound the RAW markup size BEFORE parse + the O(nodes × ids) namespacing rewrite. The per-attribute
  // work is attacker-controllable UNDER the node cap below (many defs + ONE multi-MB `style` attr that
  // references them all → ids × attr-length char-scans), so a giant svg must be rejected up front (#22 —
  // untrusted shared / AI markup could otherwise hang the Studio tab). A real chart svg is a few KB.
  if (typeof markup !== 'string' || markup.length > 256 * 1024) return null;
  const svg = parseSvg(markup);
  if (!svg) return null;

  // Bound node count too, before the per-node loops. chartToScene can be handed sanitized shared /
  // AI-generated markup in the Studio (#22), so a svg with tens of thousands of nodes must be rejected
  // before the reference rewrite — the mark cap below fires too late. Any real chart is < ~200 nodes.
  if (svg.querySelectorAll('*').length > 3000) return null;
  // And explicitly bound the number of `[id]` nodes: the rewrite is O(ids × attr-length). The markup
  // cap bounds attr-length and the node cap bounds ids ≤ 3000, but an id cap keeps the PRODUCT small
  // on a hostile "many small `<defs id>` + one big ref-dense attr" shape that stays under both other
  // caps (red-team F1 / Copilot review). A real chart carries a handful of defs; 512 is deep slack.
  if (svg.querySelectorAll('[id]').length > 512) return null;

  // Self-contain the copy's paint-server references BEFORE minting mark ids, so a gradient-filled
  // chart resolves its `url(#…)` fills against its OWN defs, not the identical (hidden) poster's.
  namespaceInternalRefs(svg);

  // Coerce caller numerics to finite, in-range values so a bad option (e.g. buildSpan: NaN,
  // duration ≤ 0) can't propagate NaN into every window and make the whole scene unvalidatable
  // (red-team F3).
  const duration = Number.isFinite(opts.duration) && (opts.duration as number) > 0 ? (opts.duration as number) : 3600;
  const hero = Number.isFinite(opts.hero) && (opts.hero as number) >= 0 && (opts.hero as number) <= 1 ? (opts.hero as number) : 1;
  const buildSpan = Math.min(0.9, Math.max(0.1, Number.isFinite(opts.buildSpan) ? (opts.buildSpan as number) : 0.6));
  const style: ChartAnimaStyle = opts.style === 'together' || opts.style === 'rise' ? opts.style : 'build';
  const assetKey = opts.assetKey ?? 'chart';
  const highlight = new Set(opts.highlightMarks ?? []);
  // The emphasis stroke must be a palette-blind token (HARD RULE #3) — an invalid/hard-coded value
  // falls back to the default rather than baking a raw color into the asset.
  const highlightColor = opts.highlightColor && validateColor(opts.highlightColor) === null ? opts.highlightColor : 'var(--ink)';

  // Geometry marks (bars/sectors/…) build; text marks (labels/values) follow. Document order is
  // the build order, which for a top-to-bottom funnel reads correctly.
  //
  // A node is an animation CANDIDATE if it carries a per-mark index (`data-mark` — the popover's
  // handle, which most charts already emit) OR if the renderer DECLARED its motion role
  // (`data-anima-role`). The second arm is what lets a mark animate WITHOUT owning a mark index:
  // the radar's series polygons are the shape the chart builds, but the radar's `data-mark`
  // namespace belongs to its AXIS LABELS — chart-interact.js keys each axis's detail template by
  // that index — so tagging a polygon with `data-mark` would shift the popover's map and open the
  // wrong detail. Declaring only the role animates the shape and leaves the popover untouched.
  // (Before this, `[data-mark]` was the ONLY selector, so a radar animated its labels and never
  // its shape, and `ROLE_BY_CLASS['radar-area']` was unreachable dead code.)
  const candidates = Array.from(svg.querySelectorAll('[data-mark], [data-anima-role]'));
  // Labels are choreographed AFTER the build whatever they're tagged with, so split them out here
  // rather than letting a role-declaring <text> (the funnel labels carry data-anima-role="label")
  // fall into the geometry stagger.
  const markNodes = candidates.filter((el) => (roleForNode(el) ?? 'bar') !== 'label');
  // Every label: a plain <text> (role by tag) plus any non-text node the renderer declared a label.
  // One document-order query keeps them unique and ordered; the `processed` set below skips any
  // already handled in the mark loop.
  const textNodes = Array.from(svg.querySelectorAll('text, [data-anima-role="label"]'));
  // Bound the work at the schema's element cap BEFORE the per-node loops — parseScene's
  // MAX_ELEMENTS fires too late to protect the adapter from a pathological chart (red-team F1).
  if (markNodes.length + textNodes.length > 2000) return null;

  const elements: SvgElement[] = [];
  const roles: ChartAnimaResult['roles'] = [];
  // Seed `seen` with ids ALREADY in the SVG (e.g. a chart's `<defs>` gradients `pie-wedge-N`), so a
  // minted id never collides with — and mis-resolves to — a pre-existing node (maker-checker MED-1;
  // the backend's nodeById is first-wins in document order, and <defs> come first).
  const seen = new Set<string>();
  for (const node of Array.from(svg.querySelectorAll('[id]'))) if (node.id) seen.add(node.id);
  // Track PROCESSED nodes by identity (not by id-in-`seen`), so a `<text>` whose pre-existing id
  // happens to equal a minted one isn't falsely skipped.
  const processed = new WeakSet<Element>();
  // O(1) amortized: a per-base counter resumes where the last mint left off, so N nodes sharing
  // one base cost O(N), not O(N²) (red-team F1 — a linear suffix rescan would hang on a chart
  // whose marks share a data-mark).
  const nextSuffix = new Map<string, number>();
  const uniqueId = (base: string): string => {
    let id = base;
    if (seen.has(id)) {
      let k = nextSuffix.get(base) ?? 1;
      while (seen.has(`${base}-${k}`)) k++;
      id = `${base}-${k}`;
      nextSuffix.set(base, k + 1);
    }
    seen.add(id);
    return id;
  };

  // ── geometry marks: fade-in over [0, buildSpan] (opacity, not stroke — most marks are filled
  //    shapes). A flagged mark also emphasizes.
  const n = Math.max(1, markNodes.length);
  const slot = buildSpan / n;
  // Sectors (pie/donut wedges) are radial parts of a CLOSED figure: a STAGGERED reveal leaves a
  // visible wedge-shaped gap mid-build, so the disc reads as "missing a slice", not "assembling"
  // (adversarial trio — Munger). So the role-aware default reveals a sector chart SYNCHRONIZED (the
  // whole disc fades in as one) while bars (a funnel's stages) keep the stagger — the top-to-bottom
  // build IS the drop-off story. The `together` STYLE forces every chart synchronized regardless of
  // role (an explicit "all at once"); `build`/`rise` stay role-aware.
  const isSector = markNodes.length > 0 && (roleForNode(markNodes[0]) ?? 'bar') === 'sector';
  const synchronized = style === 'together' || isSector;
  // `rise`: each mark STARTS displaced downward by a fraction of the chart's own height and slides up
  // into place as it reveals (viewBox units — the `slide` verb paints a translate in the svg's space).
  // The displacement is deliberately LARGE (a fifth of the chart height) so `rise` reads as an obvious
  // upward travel, not a near-static fade indistinguishable from `build` (adversarial trio finding).
  const vb = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const vbH = vb.length === 4 && Number.isFinite(vb[3]) && vb[3] > 0 ? vb[3] : 180;
  const riseFrom: [number, number] | null = style === 'rise' ? [0, vbH * 0.2] : null;
  markNodes.forEach((node, i) => {
    const role = roleForNode(node) ?? 'bar';
    const mark = markIndexOf(node);
    const id = uniqueId(role === 'label' ? `label-m${i}` : `${role}-${mark ?? i}`);
    node.setAttribute('id', id);
    processed.add(node);

    const at = synchronized ? 0 : i * slot;
    const span = synchronized ? buildSpan : slot + 0.08;
    const motion: Motion[] = [{ verb: 'reveal', at, span }];
    // `rise`: slide up into place over the SAME window as the reveal, so the fade and the move read
    // as one gesture. `from` is the start displacement (below); it arrives at 0 by the window's end.
    // `ease-out` decelerates into place, so the mark settles rather than stopping abruptly.
    if (riseFrom) motion.push({ verb: 'slide', at, span, from: riseFrom, easing: 'ease-out' });
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
    if (processed.has(node)) return; // already handled in the mark loop (a <text> with data-mark)
    const id = uniqueId('label');
    node.setAttribute('id', id);
    // A label can carry a mark index of its own — the radar's axis labels ARE its popover marks —
    // so report it rather than hard-coding null, which would hide those marks from `roles` and from
    // `highlightMarks`. A label with no index reports null exactly as before.
    const mark = markIndexOf(node);
    const motion: Motion[] = [{ verb: 'reveal', at: labelAt, span: 1 - labelAt }];
    if (mark != null && highlight.has(mark)) {
      (node as unknown as SVGElement).style.stroke = highlightColor;
      motion.push({ verb: 'highlight', at: buildSpan, span: 1 - buildSpan });
    }
    elements.push({ id, pathRef: id, motion });
    roles.push({ id, role: 'label', mark });
  });

  if (elements.length === 0) return null;

  const scene: SvgScene = { source: 'svg', duration, hero, asset: assetKey, elements };
  return { scene, asset: svg.outerHTML, assetKey, roles };
}
