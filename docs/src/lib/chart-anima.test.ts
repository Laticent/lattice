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
