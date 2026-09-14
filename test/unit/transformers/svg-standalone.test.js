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

/**
 * THE EXPORT'S PROPERTY LIST IS DUPLICATED ON PURPOSE, so it needs a test.
 *
 * `flattenSvgStyles` is serialized into a puppeteer page, so it must be
 * closure-free — which is why it carries its own copy of the curated property
 * list and the initial-value map instead of reading the module-level ones. Two
 * copies of a list drift, and the drift is invisible: the export keeps working
 * and quietly stops carrying one property.
 *
 * The rest of the function is browser-only and covered end to end by the CLI
 * (`tools/export-chart-svg.js`), so these read the SOURCE. A text-level census
 * is the only arm that can see a list going out of sync in Node.
 */
describe('the flattener carries the edge contract into the exported file', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  // Comments are stripped first: a `//` comment inside one of these literals
  // carries an apostrophe ("the chart's swatch"), and a naive quote scan reads
  // that as the start of a string and the next one as its end.
  const SRC = fs.readFileSync(
    path.join(__dirname, '../../../lib/components/chart/_chart-family/standalone-svg.js'),
    'utf8',
  );
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  /** Both copies of an array literal named in `names`, in source order. */
  const arraysNamed = (names) => {
    const out = [];
    for (const m of CODE.matchAll(/const\s+(\w+)\s*=\s*\[([\s\S]*?)\];/g)) {
      if (!names.includes(m[1])) continue;
      out.push([...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]));
    }
    return out;
  };
  const objectsNamed = (names) => {
    const out = [];
    for (const m of CODE.matchAll(/const\s+(\w+)\s*=\s*\{([\s\S]*?)\n\s*\};/g)) {
      if (!names.includes(m[1])) continue;
      out.push([...m[2].matchAll(/'([^']+)':/g)].map((x) => x[1]));
    }
    return out;
  };

  test('the module list and the closure-free copy are the same list', () => {
    const [outer, inner] = arraysNamed(['STYLE_PROPS', 'PROPS']);
    assert.ok(outer && inner, 'both STYLE_PROPS and PROPS must be present');
    assert.deepEqual(inner, outer,
      'PROPS inside flattenSvgStyles has drifted from STYLE_PROPS — the export would carry a different set of properties than the module documents');
  });

  test('the module initial-value map and its copy are the same map', () => {
    const [outer, inner] = objectsNamed(['INITIAL', 'INIT']);
    assert.ok(outer && inner, 'both INITIAL and INIT must be present');
    assert.deepEqual(inner, outer,
      'INIT inside flattenSvgStyles has drifted from INITIAL');
  });

  test('vector-effect is carried', () => {
    for (const list of arraysNamed(['STYLE_PROPS', 'PROPS'])) {
      assert.ok(list.includes('vector-effect'),
        'without vector-effect a mark pinned with non-scaling-stroke exports as one viewBox USER unit, which the viewBox then scales — measured on the CLI artifact, a 1px map edge came back at 0.83px and a scatter dot at 2.21px');
    }
  });

  test('a stroked element never drops its width or its pin as "the initial"', () => {
    // `stroke-width: 1px` IS the CSS initial, and it is exactly what
    // --chart-edge resolves to at HD — so the omit-the-initial optimization
    // deleted the one declaration that made the edge mean anything.
    assert.match(SRC, /const\s+strokes\s*=\s*cs\.getPropertyValue\('stroke'\)/,
      'the walk must ask whether the element actually paints a stroke');
    assert.match(SRC, /const\s+pinned\s*=\s*strokes\s*&&\s*\(p === 'stroke-width' \|\| p === 'vector-effect'\)/,
      'a stroked element must pin stroke-width and vector-effect past the initial-value skip');
    assert.match(SRC, /if \(!pinned && Object\.hasOwn\(INIT, p\) && v === INIT\[p\]\) continue;/,
      'the initial-value skip must consult that pin');
  });
});
