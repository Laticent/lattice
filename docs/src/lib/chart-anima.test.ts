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

  it('does not collide a minted id with a pre-existing SVG id (e.g. a gradient def)', () => {
    // A chart like the pie carries <defs> gradient ids; if one happens to equal a minted base, the
    // mark must get a DIFFERENT id so it resolves to the mark, not the (document-first) def.
    const withDefs =
      '<svg viewBox="0 0 100 100"><defs><radialGradient id="bar-0"/></defs>' +
      '<polygon class="funnel-band" data-mark="0" points="0,0 10,0 5,10"/></svg>';
    const out = chartToScene(withDefs);
    const bar = out?.roles.find((r) => r.role === 'bar');
    expect(bar?.id).not.toBe('bar-0'); // dodged the pre-existing def id
    expect(out?.asset).toContain(`id="${bar?.id}"`); // the mark carries its unique id
    expect(out?.asset).toContain('id="bar-0"'); // the def id is untouched
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
