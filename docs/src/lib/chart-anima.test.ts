// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseScene } from './anima/schema';
import { chartToScene } from './chart-anima';

// A funnel-shaped fixture mirroring the real renderer's output (polygon bands + flanking text).
const FUNNEL =
  '<svg class="funnel-svg" viewBox="0 0 320 180" role="img" aria-hidden="true">' +
  '<polygon class="funnel-band" data-mark="0" data-label="Visitors" data-value="10,000" style="--i:0" points="85,16 235,16 184,46 136,46"/>' +
  '<text class="funnel-label" x="76" y="31">Visitors</text>' +
  '<text class="funnel-value" x="244" y="31">10,000</text>' +
  '<polygon class="funnel-band" data-mark="1" data-label="Signups" data-value="3,200" style="--i:1" points="136,58 184,58 168,88 152,88"/>' +
  '<text class="funnel-label" x="76" y="73">Signups</text>' +
  '</svg>';

describe('chartToScene', () => {
  it('maps chart marks to roles and mints stable ids', () => {
    const out = chartToScene(FUNNEL);
    expect(out).not.toBeNull();
    const bars = out?.roles.filter((r) => r.role === 'bar') ?? [];
    const labels = out?.roles.filter((r) => r.role === 'label') ?? [];
    expect(bars).toHaveLength(2); // two funnel-band polygons
    expect(labels).toHaveLength(3); // three <text> nodes
    // ids are unique and stable
    const ids = out?.roles.map((r) => r.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
    expect(bars[0].id).toBe('bar-0');
  });

  it('reads data-anima-role AUTHORITATIVELY — a non-default role wins over the class map', () => {
    // A geometry mark with NO class we know, tagged data-anima-role="sector". If the attribute were
    // ignored, roleForNode would fall through to the geometry default 'bar' — so asserting 'sector'
    // fails unless data-anima-role is genuinely read. (This is the guard the trivial old test lacked.)
    const svg =
      '<svg viewBox="0 0 100 100">' +
      '<polygon data-mark="0" data-anima-role="sector" points="0,0 10,0 5,10"/>' +
      '<polygon class="funnel-band" data-mark="1" data-anima-role="point" points="0,0 10,0 5,10"/>' +
      '</svg>';
    const out = chartToScene(svg);
    const roles = out?.roles.filter((r) => r.mark != null).map((r) => r.role) ?? [];
    expect(roles).toEqual(['sector', 'point']); // 'sector' (no class) and 'point' (overriding funnel-band→bar)
  });

  it('produces a scene that PASSES the anima validator', () => {
    const out = chartToScene(FUNNEL);
    const r = parseScene(out?.scene);
    expect(r.ok).toBe(true);
  });

  it('injects the minted ids into the returned asset SVG (so the backend can address them)', () => {
    const out = chartToScene(FUNNEL);
    expect(out?.asset).toContain('id="bar-0"');
    expect(out?.asset).toContain('id="bar-1"');
    // every scene element's pathRef resolves to an id present in the asset
    for (const el of out?.scene.elements ?? []) expect(out?.asset).toContain(`id="${el.id}"`);
  });

  it('bars fade in staggered (reveal windows advance in document order)', () => {
    const out = chartToScene(FUNNEL, { buildSpan: 0.6 });
    const bar0 = out?.scene.elements.find((e) => e.id === 'bar-0');
    const bar1 = out?.scene.elements.find((e) => e.id === 'bar-1');
    const at0 = (bar0?.motion?.[0] as { at?: number })?.at ?? 0;
    const at1 = (bar1?.motion?.[0] as { at?: number })?.at ?? 0;
    expect(at1).toBeGreaterThan(at0); // later band starts later
  });

  it('highlights a flagged mark: an inline emphasis stroke + a highlight verb', () => {
    const out = chartToScene(FUNNEL, { highlightMarks: [0], highlightColor: 'var(--ink)' });
    const bar0 = out?.scene.elements.find((e) => e.id === 'bar-0');
    expect(bar0?.motion?.some((m) => m.verb === 'highlight')).toBe(true);
    // the inline stroke override is baked into the asset (wins over the chart's CSS stroke)
    expect(out?.asset).toContain('id="bar-0"');
    expect(out?.asset).toMatch(/stroke:\s*var\(--ink\)/);
    // a non-highlighted band gets NO highlight verb
    const bar1 = out?.scene.elements.find((e) => e.id === 'bar-1');
    expect(bar1?.motion?.some((m) => m.verb === 'highlight')).toBe(false);
  });

  it('namespaces renderer-emitted defs ids + their url() references (gradient-filled charts)', () => {
    // A pie/quadrant/radar wedge fills via `url(#pie-wedge-N)` → a `<radialGradient>` def. The scene
    // mounts a COPY beside the hidden poster (same document, same ids), so an un-namespaced copy would
    // resolve `url(#pie-wedge-1)` to the display:none poster's def and paint NOTHING. The ingest must
    // give the copy's defs + refs a unique prefix so the animated svg is self-contained.
    const pie =
      '<svg viewBox="0 0 100 100"><defs>' +
      '<radialGradient id="pie-wedge-1"><stop offset="0" style="stop-color:red"/></radialGradient>' +
      '<radialGradient id="pie-wedge-2"><stop offset="0" style="stop-color:blue"/></radialGradient>' +
      '</defs>' +
      '<path class="wedge" data-mark="0" data-anima-role="sector" style="fill:url(#pie-wedge-1)" d="M50 50 L90 50 A40 40 0 0 1 50 90 Z"/>' +
      '<path class="wedge" data-mark="1" data-anima-role="sector" style="fill:url(#pie-wedge-2)" d="M50 50 L50 10 A40 40 0 0 1 90 50 Z"/></svg>';
    const out = chartToScene(pie);
    expect(out).not.toBeNull();
    const asset = out?.asset ?? '';
    // The bare renderer ids are gone; every def id carries the unique prefix, and no `url(#pie-wedge-N)`
    // reference is left pointing at the un-prefixed (poster-colliding) id.
    expect(asset).not.toMatch(/id="pie-wedge-1"/);
    expect(asset).not.toMatch(/url\(#pie-wedge-1\)/);
    expect(asset).toMatch(/<radialGradient id="ca[0-9a-z]+-pie-wedge-1"/);
    // The fill still resolves — the wedge's url() points at the SAME namespaced def id that now exists.
    const gradId = (asset.match(/<radialGradient id="(ca[0-9a-z]+-pie-wedge-1)"/) || [])[1];
    expect(gradId).toBeTruthy();
    expect(asset).toContain(`fill:url(#${gradId})`);
    // `#pie-wedge-1` must not be a prefix-collision victim of `#pie-wedge-1` vs a longer id.
    expect(asset).toContain('-pie-wedge-2"');
  });

  it('namespaces an id containing `$` without corruption (replacement-string $-substitution guard)', () => {
    // JS String.replace expands `$'`/`$&`/`$$`/`$n` in a STRING replacement. A namespaced id derived
    // from an id containing `$'` (= "text after the match") would corrupt the ref into a dangling
    // pointer (the original bug) unless a FUNCTION replacement is used.
    const svg =
      '<svg viewBox="0 0 10 10"><defs><radialGradient id="g$\'x"><stop offset="0" style="stop-color:red"/></radialGradient></defs>' +
      '<path class="wedge" data-mark="0" data-anima-role="sector" style="fill:url(#g$\'x)" d="M0 0 L5 0 L5 5 Z"/></svg>';
    const out = chartToScene(svg);
    expect(out).not.toBeNull();
    const asset = out?.asset ?? '';
    // The def id and the wedge's url() must point at the SAME namespaced id — no `$`-expansion artifacts.
    const gradId = (asset.match(/<radialGradient id="(ca[0-9a-z]+-g\$'x)"/) || [])[1];
    expect(gradId).toBeTruthy(); // the id survived intact through the rename
    expect(asset).toContain(`fill:url(#${gradId})`); // the ref resolves to it (not a corrupted fragment)
  });

  it('rewrites href / xlink:href fragment references, not just url() fills', () => {
    // The rewrite scans ALL attributes, so a fragment `href`/`xlink:href` (e.g. a <use> or a
    // gradient's template ref) is namespaced consistently with its target def.
    const svg =
      '<svg viewBox="0 0 10 10"><defs><linearGradient id="base"><stop offset="0" style="stop-color:red"/></linearGradient>' +
      '<radialGradient id="grad" href="#base"/></defs>' +
      '<path class="wedge" data-mark="0" data-anima-role="sector" style="fill:url(#grad)" d="M0 0 L5 0 L5 5 Z"/></svg>';
    const out = chartToScene(svg);
    const asset = out?.asset ?? '';
    const baseId = (asset.match(/<linearGradient id="(ca[0-9a-z]+-base)"/) || [])[1];
    expect(baseId).toBeTruthy();
    expect(asset).toContain(`href="#${baseId}"`); // the href tracks the renamed target
    expect(asset).not.toMatch(/href="#base"/); // no dangling reference to the bare id
  });

  it('reveals sector marks SYNCHRONIZED (whole disc), bars STAGGERED (sequential build)', () => {
    // A pie's wedges must fade in together so the disc is never a slice short mid-build (trio: Munger).
    const pie =
      '<svg viewBox="0 0 10 10">' +
      '<path class="wedge" data-mark="0" data-anima-role="sector" d="M0 0 L5 0 Z"/>' +
      '<path class="wedge" data-mark="1" data-anima-role="sector" d="M0 0 L0 5 Z"/></svg>';
    const pieOut = chartToScene(pie);
    const ats = (pieOut?.scene.elements ?? []).map((e) => (e.motion?.[0] as { at?: number })?.at ?? -1);
    expect(ats).toEqual([0, 0]); // both wedges start together — no staggered hole
    // Bars still stagger (the funnel build is the story) — regression guard on the funnel path.
    const bars =
      '<svg viewBox="0 0 10 10">' +
      '<polygon class="funnel-band" data-mark="0" points="0,0 1,0 1,1"/>' +
      '<polygon class="funnel-band" data-mark="1" points="0,0 1,0 1,1"/></svg>';
    const barsOut = chartToScene(bars);
    const barAts = (barsOut?.scene.elements ?? []).map((e) => (e.motion?.[0] as { at?: number })?.at ?? -1);
    expect(barAts[1]).toBeGreaterThan(barAts[0]); // staggered
  });

  it('a pre-existing def id never collides with a minted mark id (both resolve distinctly)', () => {
    // A chart's <defs> gradient could share a base with a minted mark id. Namespacing the def FIRST
    // (`ca…-bar-0`) frees the base, so the mark cleanly mints `bar-0` — two DISTINCT ids in the asset,
    // and the wedge/mark resolves to itself, never the def.
    const withDefs =
      '<svg viewBox="0 0 100 100"><defs><radialGradient id="bar-0"/></defs>' +
      '<polygon class="funnel-band" data-mark="0" points="0,0 10,0 5,10"/></svg>';
    const out = chartToScene(withDefs);
    const bar = out?.roles.find((r) => r.role === 'bar');
    expect(bar?.id).toBe('bar-0'); // the base is free — the def was namespaced away
    expect(out?.asset).toContain('id="bar-0"'); // the mark carries it
    expect(out?.asset).toMatch(/<radialGradient id="ca[0-9a-z]+-bar-0"/); // the def is namespaced, distinct
    expect(out?.asset).not.toMatch(/<radialGradient id="bar-0"/); // NOT the bare id (would collide)
  });

  it('falls back to a token when highlightColor is not palette-blind (#3)', () => {
    const out = chartToScene(FUNNEL, { highlightMarks: [0], highlightColor: '#ff0000' });
    expect(out?.asset).not.toMatch(/stroke:\s*#ff0000/); // the raw hex was rejected
    expect(out?.asset).toMatch(/stroke:\s*var\(--ink\)/); // fell back to the default token
  });

  it('treats a non-numeric / empty data-mark as unindexed (never mark 0)', () => {
    const svg =
      '<svg viewBox="0 0 9 9"><polygon class="funnel-band" data-mark="" points="0,0 1,0 1,1"/>' +
      '<polygon class="funnel-band" data-mark="x" points="0,0 1,0 1,1"/></svg>';
    const out = chartToScene(svg, { highlightMarks: [0] });
    expect(out?.roles.filter((r) => r.role === 'bar')).toHaveLength(2);
    expect(out?.roles.every((r) => r.mark === null)).toBe(true); // '' and 'x' → null, not 0
    // so highlightMarks:[0] matches nothing → no highlight verb anywhere
    const anyHighlight = out?.scene.elements.some((e) => e.motion?.some((m) => m.verb === 'highlight'));
    expect(anyHighlight).toBe(false);
  });

  it('does not double-process a <text> that also carries data-mark (WeakSet guard)', () => {
    const svg = '<svg viewBox="0 0 9 9"><text class="wc-word" data-mark="0" x="1" y="1">hi</text></svg>';
    const out = chartToScene(svg);
    // one element total — handled once in the mark loop, skipped in the text loop
    expect(out?.scene.elements).toHaveLength(1);
    const ids = out?.roles.map((r) => r.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns null on a chart past the element bound (adapter-side DoS guard)', () => {
    const many = '<svg viewBox="0 0 9 9">' + '<polygon class="funnel-band" data-mark="0" points="0,0 1,0 1,1"/>'.repeat(2001) + '</svg>';
    expect(chartToScene(many)).toBeNull();
  });

  it('rejects a pathological NODE count before the namespacing rewrite — even with a valid mark', () => {
    // The node guard must fire on an svg that WOULD otherwise produce a scene: > 3000 id-less nodes
    // (so the id cap does NOT catch it first) + one real mark (< the 2000 mark cap, so that isn't it
    // either). Remove the node guard and this returns a scene, not null.
    const filler = '<g></g>'.repeat(3100); // 3100 nodes, ZERO ids → only the NODE guard applies
    const huge = `<svg viewBox="0 0 9 9">${filler}<polygon class="funnel-band" data-mark="0" points="0,0 1,0 1,1"/></svg>`;
    expect(huge.length).toBeLessThan(256 * 1024); // under the markup cap; 0 ids → under the id cap
    expect(chartToScene(huge)).toBeNull();
  });

  it('rejects an svg with too many [id] nodes (bounds the O(ids × attr-length) rewrite product)', () => {
    // The hostile shape red-team F1 / the Copilot review flagged: many small `<defs id>` (few total
    // nodes, small markup) + one ref-dense attribute. An explicit id cap rejects it up front.
    const defs = Array.from({ length: 520 }, (_, k) => `<radialGradient id="g${k}"/>`).join('');
    const svg = `<svg viewBox="0 0 9 9"><defs>${defs}</defs><polygon class="funnel-band" data-mark="0" points="0,0 1,0 1,1"/></svg>`;
    expect(svg.length).toBeLessThan(256 * 1024); // under the markup cap
    expect(chartToScene(svg)).toBeNull(); // rejected by the id cap (would otherwise namespace 520 ids)
  });

  it('rejects oversized raw markup before parse (attribute-length DoS the node cap misses)', () => {
    // A svg with FEW nodes but a multi-hundred-KB attribute (the red-team PoC shape: the rewrite is
    // O(ids × attr-length)) must be rejected by the MARKUP cap, which the node cap cannot catch.
    const bigAttr = '0,0 '.repeat(70000); // ~280 KB of points on ONE mark node
    const svg = `<svg viewBox="0 0 9 9"><polygon class="funnel-band" data-mark="0" points="${bigAttr}"/></svg>`;
    expect(svg.length).toBeGreaterThan(256 * 1024);
    expect(chartToScene(svg)).toBeNull(); // remove the markup cap and this returns a (1-mark) scene
  });

  it('coerces a bad buildSpan / duration option to a valid scene', () => {
    const out = chartToScene(FUNNEL, { buildSpan: Number.NaN, duration: -5 });
    expect(out).not.toBeNull();
    const r = parseScene(out?.scene);
    expect(r.ok).toBe(true); // NaN buildSpan / negative duration didn't poison the windows
  });

  it('returns null on markup with no <svg> or no marks', () => {
    expect(chartToScene('<div>not svg</div>')).toBeNull();
    expect(chartToScene('<svg viewBox="0 0 10 10"></svg>')).toBeNull();
  });

  it('honors duration / hero / assetKey options', () => {
    const out = chartToScene(FUNNEL, { duration: 5000, hero: 0.5, assetKey: 'myChart' });
    expect(out?.scene.duration).toBe(5000);
    expect(out?.scene.hero).toBe(0.5);
    expect(out?.assetKey).toBe('myChart');
    expect(out?.scene.asset).toBe('myChart');
  });
});

// The three motion STYLES the `motion:` deck setting / `motion-*` slide class select must produce
// visibly DIFFERENT choreographies — else the picker is a lie. A pie fixture (sector role) proves
// the style OVERRIDES the role-aware default (sectors sync on `build`, but `build` here is a funnel).
const PIE =
  '<svg viewBox="0 0 200 200">' +
  '<path class="wedge" data-mark="0" data-anima-role="sector" d="M100,100 L100,0 A100,100 0 0,1 195,69 Z"/>' +
  '<path class="wedge" data-mark="1" data-anima-role="sector" d="M100,100 L195,69 A100,100 0 0,1 100,200 Z"/>' +
  '<path class="wedge" data-mark="2" data-anima-role="sector" d="M100,100 L100,200 A100,100 0 0,1 100,0 Z"/>' +
  '</svg>';

const revealOf = (out: ReturnType<typeof chartToScene>, id: string) =>
  out?.scene.elements.find((e) => e.id === id)?.motion?.find((m) => m.verb === 'reveal') as { at?: number; span?: number } | undefined;

describe('chartToScene — motion styles', () => {
  it('build (default): bars stagger — reveal windows advance in document order', () => {
    const out = chartToScene(FUNNEL, { style: 'build', buildSpan: 0.6 });
    expect(revealOf(out, 'bar-1')?.at).toBeGreaterThan(revealOf(out, 'bar-0')?.at ?? 0);
    // no slide verb on a plain build
    expect(out?.scene.elements.every((e) => !e.motion?.some((m) => m.verb === 'slide'))).toBe(true);
  });

  it('together: every mark reveals SYNCHRONIZED — same window, no stagger — even for staggering bars', () => {
    const out = chartToScene(FUNNEL, { style: 'together', buildSpan: 0.6 });
    const a = revealOf(out, 'bar-0');
    const b = revealOf(out, 'bar-1');
    expect(a?.at).toBe(0);
    expect(b?.at).toBe(0); // NOT staggered — the whole chart fades in at once
    expect(a?.span).toBe(b?.span);
  });

  it('rise: each mark ALSO slides up (a slide verb, from a positive-dy offset) over the reveal window', () => {
    const out = chartToScene(FUNNEL, { style: 'rise' });
    const bar0 = out?.scene.elements.find((e) => e.id === 'bar-0');
    const slide = bar0?.motion?.find((m) => m.verb === 'slide') as { from?: [number, number]; at?: number } | undefined;
    expect(slide).toBeDefined();
    expect(slide?.from?.[1]).toBeGreaterThan(0); // starts displaced DOWNWARD → rises into place
    // the slide shares the reveal's start, so fade + move read as one gesture
    expect(slide?.at).toBe(revealOf(out, 'bar-0')?.at);
    // still passes the validator
    expect(parseScene(out?.scene).ok).toBe(true);
  });

  it('`together` OVERRIDES the bar stagger (a funnel) → synchronized; `build` keeps a pie whole', () => {
    // The real override is on BARS: `build` staggers them, `together` forces them synchronized.
    const funnelBuild = chartToScene(FUNNEL, { style: 'build' });
    expect(revealOf(funnelBuild, 'bar-1')?.at).toBeGreaterThan(revealOf(funnelBuild, 'bar-0')?.at ?? 0);
    const funnelTogether = chartToScene(FUNNEL, { style: 'together' });
    expect(revealOf(funnelTogether, 'bar-0')?.at).toBe(revealOf(funnelTogether, 'bar-1')?.at);
    // SECTORS stay whole under both build and the default — a staggered disc would read as a missing
    // slice (Munger), so `build` is role-aware for a closed figure and never staggers a pie.
    const pieDefault = chartToScene(PIE);
    const pieBuild = chartToScene(PIE, { style: 'build' });
    expect(revealOf(pieDefault, 'sector-0')?.at).toBe(revealOf(pieDefault, 'sector-1')?.at);
    expect(revealOf(pieBuild, 'sector-0')?.at).toBe(revealOf(pieBuild, 'sector-1')?.at);
  });

  it('an unknown style falls back to build (staggered), never throws', () => {
    // @ts-expect-error — exercising a bad runtime value the front-matter could carry
    const out = chartToScene(FUNNEL, { style: 'wobble' });
    expect(out).not.toBeNull();
    expect(revealOf(out, 'bar-1')?.at).toBeGreaterThan(revealOf(out, 'bar-0')?.at ?? 0);
  });
});

// ── the role map must describe what the renderers ACTUALLY emit ──────────────
// Born from a real defect: ROLE_BY_CLASS carried 'radar-area', a class no
// renderer has ever emitted (the radar emits `.radar-poly`). The entry read as
// "radar shapes animate" while the radar's shape silently never built. A map
// key that matches nothing is dead code wearing the costume of a feature, so
// the map is gated against the kernels' own source.
describe('ROLE_BY_CLASS honesty', () => {
  const KERNELS = [
    'lib/components/chart/funnel/funnel.transform.js',
    'lib/components/chart/radar/radar.transform.js',
    'lib/components/chart/quadrant/quadrant.transform.js',
    'lib/components/chart/map/map.transform.js',
    'lib/components/chart/state-chart/state-chart.transform.js',
    'lib/components/chart/_chart-family/chart-family.js',
  ];

  it('every class in the map is emitted by a chart kernel', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    // Repo root from docs/src/lib → ../../..
    const root = resolve(__dirname, '../../..');
    const source = KERNELS.map((f) => readFileSync(resolve(root, f), 'utf8')).join('\n');

    // Re-read the map from its own source so the test sees the real keys.
    const mapSrc = readFileSync(resolve(root, 'docs/src/lib/chart-anima.ts'), 'utf8');
    const block = mapSrc.match(/const ROLE_BY_CLASS[^{]*\{([\s\S]*?)\n\};/);
    expect(block, 'ROLE_BY_CLASS block not found').toBeTruthy();
    const keys = [...(block as RegExpMatchArray)[1].matchAll(/^\s*'?([\w-]+)'?\s*:/gm)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);

    // Match the class as a whole token, so `wedge` is not credited to the
    // `pie-wedge-N` gradient ids and a genuinely dead key still fails. The
    // kernels name a class either inline (`class="funnel-band"`) or as an
    // emitter argument (`className: 'funnel-label'`), so both quote styles and
    // bare word boundaries count.
    const missing = keys.filter((k) => !new RegExp(`(^|[^\\w-])${k}([^\\w-]|$)`).test(source));
    expect(missing, `role-map classes no kernel emits: ${missing.join(', ')}`).toEqual([]);
  });
});

// ── radar: the shape must build, and the popover's index map must survive ────
// The radar was the mission's headline motion gap: its series polygons carried
// no addressable attribute, so chartToScene saw ONLY the axis labels and the
// chart animated its text while its shape sat still. The polygons now declare
// `data-anima-role` WITHOUT a `data-mark` — deliberately, because the radar's
// data-mark namespace belongs to the axis labels (chart-interact.js keys each
// axis's detail template by that index), so a mark on a polygon would open the
// wrong popover.
const RADAR =
  '<svg class="radar-svg" viewBox="0 0 300 300" role="img">' +
  '<g class="radar-grid"><polygon class="radar-ring" data-ring="1" points="0,0 1,1"/></g>' +
  '<g class="radar-axes">' +
  '<text class="radar-axis-label" data-mark="0" x="10" y="10">Coverage</text>' +
  '<text class="radar-axis-label" data-mark="1" x="20" y="20">Support</text>' +
  '</g>' +
  '<g class="radar-plot">' +
  '<polygon class="radar-poly" data-anima-role="region" data-series="0" points="1,1 2,2 3,3"/>' +
  '<polygon class="radar-poly" data-anima-role="region" data-series="1" points="4,4 5,5 6,6"/>' +
  '</g></svg>';

describe('radar motion', () => {
  it('animates the series polygons as regions — the shape BUILDS, not just the labels', () => {
    const out = chartToScene(RADAR);
    expect(out).not.toBeNull();
    const regions = out?.roles.filter((r) => r.role === 'region') ?? [];
    expect(regions).toHaveLength(2);
  });

  it('still animates the axis labels, as labels', () => {
    const out = chartToScene(RADAR);
    const labels = out?.roles.filter((r) => r.role === 'label') ?? [];
    expect(labels).toHaveLength(2);
  });

  it('leaves the polygons free of data-mark, so the popover index map is untouched', () => {
    const out = chartToScene(RADAR);
    // Every mark INDEX the scene knows about comes from an axis label (0, 1) —
    // the polygons contribute geometry but claim no index.
    const indices = (out?.roles ?? []).map((r) => r.mark).filter((m) => m != null).sort();
    expect(indices).toEqual([0, 1]);
    expect(out?.asset).not.toMatch(/radar-poly[^>]*data-mark/);
  });

  it('produces a scene that PASSES the anima validator', () => {
    const out = chartToScene(RADAR);
    expect(() => parseScene(out!.scene)).not.toThrow();
  });
});
