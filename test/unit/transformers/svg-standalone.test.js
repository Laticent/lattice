/**
 * Unit: lib/components/chart/_chart-family/standalone-svg.js — the PURE halves of
 * the standalone chart-SVG export (finalizeStandaloneSvg + collectFontFamilies).
 *
 * flattenSvgStyles is browser-only (needs getComputedStyle); it's covered
 * end-to-end by the CLI (tools/export-chart-svg.js) rasterisation, not here.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  finalizeStandaloneSvg,
  collectFontFamilies,
} = require('../../../lib/components/chart/_chart-family/standalone-svg.js');

describe('finalizeStandaloneSvg', () => {
  const PIE = '<svg viewBox="0 0 377 200"><rect/></svg>';

  test('prepends the XML prolog by default, omits it when asked', () => {
    assert.match(finalizeStandaloneSvg(PIE), /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<svg/);
    assert.match(finalizeStandaloneSvg(PIE, { xmlProlog: false }), /^<svg/);
  });

  test('adds xmlns when missing, keeps an existing one', () => {
    assert.match(finalizeStandaloneSvg(PIE), /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    const once = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"></svg>';
    const out = finalizeStandaloneSvg(once, { xmlProlog: false });
    assert.equal(out.match(/xmlns="http/g).length, 1);
  });

  test('derives intrinsic width/height from the viewBox', () => {
    const out = finalizeStandaloneSvg(PIE);
    assert.match(out, /width="377"/);
    assert.match(out, /height="200"/);
  });

  test('does not override an explicit width/height', () => {
    const sized = '<svg viewBox="0 0 377 200" width="754" height="400"></svg>';
    const out = finalizeStandaloneSvg(sized);
    assert.match(out, /width="754"/);
    assert.match(out, /height="400"/);
    assert.doesNotMatch(out, /width="377"/);
  });

  test('adds xmlns:xlink only when xlink: is used', () => {
    const withXlink = '<svg viewBox="0 0 1 1"><use xlink:href="#a"/></svg>';
    assert.match(finalizeStandaloneSvg(withXlink), /xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/);
    assert.doesNotMatch(finalizeStandaloneSvg(PIE), /xmlns:xlink/);
  });

  test('injects the embedded-font <style> in <defs> as CDATA when given', () => {
    const css = "@font-face{font-family:'Outfit';src:url(data:font/woff2;base64,AAA) format('woff2')}";
    const out = finalizeStandaloneSvg(PIE, { fontFaceCss: css });
    assert.match(out, /<defs><style type="text\/css"><!\[CDATA\[/);
    assert.match(out, /@font-face\{font-family:'Outfit'/);
    assert.match(out, /\]\]><\/style><\/defs>/);
    // The style block sits as the FIRST child, before the body.
    assert.ok(out.indexOf('<defs>') < out.indexOf('<rect'));
  });

  test('emits no <style> when there is no font CSS', () => {
    assert.doesNotMatch(finalizeStandaloneSvg(PIE), /<style/);
    assert.doesNotMatch(finalizeStandaloneSvg(PIE, { fontFaceCss: '   ' }), /<style/);
  });

  test('throws on non-<svg> input', () => {
    assert.throws(() => finalizeStandaloneSvg('<div></div>'), /not an <svg>/);
    assert.throws(() => finalizeStandaloneSvg(''), /not an <svg>/);
  });

  test('bakes a full-bleed background rect when given, omits it otherwise', () => {
    const out = finalizeStandaloneSvg(PIE, { background: '#111317' });
    assert.match(out, /<rect x="0" y="0" width="100%" height="100%" fill="#111317"\/>/);
    // the rect is the first painted child (behind the chart content)
    assert.match(out, /<svg[^>]*>(?:<defs>[\s\S]*?<\/defs>)?<rect /);
    assert.doesNotMatch(finalizeStandaloneSvg(PIE), /<rect [^>]*width="100%"/);
    assert.doesNotMatch(finalizeStandaloneSvg(PIE, { background: '  ' }), /<rect [^>]*width="100%"/);
  });

  test('accepts only a safe CSS color literal for the background (no markup injection)', () => {
    // Safe forms bake a rect.
    for (const ok of ['#fff', '#ffffff', '#11131780', 'white', 'transparent', 'currentColor', 'rgb(1,2,3)', 'rgba(1, 2, 3, .5)', 'hsl(200 50% 40%)']) {
      assert.match(finalizeStandaloneSvg(PIE, { background: ok }), /<rect [^>]*fill="/, `should bake ${ok}`);
    }
    // Unsafe forms (attribute break-out, markup, url(), expressions) are dropped — no rect at all.
    for (const bad of ['#fff" onload="x', 'red"/><script>alert(1)</script>', 'url(http://evil/x)', 'red;stroke:blue', '"><rect', 'javascript:1']) {
      assert.doesNotMatch(finalizeStandaloneSvg(PIE, { background: bad }), /<rect [^>]*width="100%"/, `should drop ${bad}`);
    }
  });
});

describe('collectFontFamilies', () => {
  test('pulls families from inline style font-family', () => {
    const m = '<text style="font-family:Outfit, system-ui;fill:red">x</text>';
    assert.deepEqual(collectFontFamilies(m), ['Outfit', 'system-ui']);
  });

  test('pulls families from a font-family attribute', () => {
    assert.deepEqual(collectFontFamilies('<text font-family="JetBrains Mono">9</text>'), ['JetBrains Mono']);
  });

  test('decodes &quot; entities (XMLSerializer escaping) and strips quotes', () => {
    const m = '<text style="font-family:&quot;Outfit&quot;, &quot;Apple Color Emoji&quot;">x</text>';
    assert.deepEqual(collectFontFamilies(m), ['Outfit', 'Apple Color Emoji']);
  });

  test('de-dupes case-insensitively, keeps first-seen order + casing', () => {
    const m = '<text style="font-family:Outfit"/><text style="font-family:OUTFIT"/><text style="font-family:JetBrains Mono"/>';
    assert.deepEqual(collectFontFamilies(m), ['Outfit', 'JetBrains Mono']);
  });

  test('returns [] for empty / family-free markup', () => {
    assert.deepEqual(collectFontFamilies(''), []);
    assert.deepEqual(collectFontFamilies('<svg><rect/></svg>'), []);
  });
});
