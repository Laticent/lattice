/**
 * Unit: lib/components/chart/_chart-family/standalone-svg.js — the PURE halves of
 * the standalone chart-SVG export (finalizeStandaloneSvg + collectFontFamilies).
 *
 * flattenSvgStyles is browser-only (needs getComputedStyle); it's covered
 * end-to-end by the CLI (tools/export-chart-svg.js) rasterisation, not here.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const {
  finalizeStandaloneSvg,
  collectFontFamilies,
  parseTokenDecls,
  applyCollectedTokens,
  bakePlan,
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

// ── The file's own token definitions ────────────────────────────────────────────
// `flattenSvgStyles({ collectTokens: true })` deliberately leaves a scheme-varying
// paint as `fill:var(--token)` so the exported player can re-theme it, and hands the
// resolved values out on `data-lattice-tokens`. This half turns that into the file's
// own `svg{…}` rule. The bake is browser-only; everything below is the pure half, so
// it is exercised here on hand-built markup.
describe('finalizeStandaloneSvg — the file\'s own token definitions', () => {
  const withTokens = (css, rest) =>
    `<svg viewBox="0 0 10 10" data-lattice-tokens="${css}"${rest || ''}><rect/></svg>`;

  test('turns the attribute into a root-scoped rule and strips the attribute itself', () => {
    const out = finalizeStandaloneSvg(withTokens('--chart-cat-1:rgb(30, 58, 95);'), { xmlProlog: false });
    assert.match(out, /<style type="text\/css"><!\[CDATA\[\n?\[data-lattice-scope="[a-z0-9]+"\]\{--chart-cat-1:rgb\(30, 58, 95\);\}/);
    // The attribute is scratch space between the two halves of one export — it must
    // never survive into the file, where it would publish the palette a second time.
    assert.doesNotMatch(out, /data-lattice-tokens/);
  });

  // An SVG `<style>` is DOCUMENT-scoped wherever the file ends up, so a bare `svg{…}`
  // selector repaints every other chart on a page that inlines this one. Measured
  // before this scoping: a light and a dark heatmap export inlined together resolved
  // the same `--heatmap-step5-ink`.
  test('scopes the rule to its own root, and never with a bare svg selector', () => {
    const out = finalizeStandaloneSvg(withTokens('--a:red;'), { xmlProlog: false });
    const scope = out.match(/data-lattice-scope="([^"]+)"/)?.[1] ?? '';
    assert.match(scope, /^[a-z0-9]+$/, 'the root takes a generated scope');
    assert.ok(out.includes(`[data-lattice-scope="${scope}"]{--a:red;}`), 'the rule selects that scope');
    assert.doesNotMatch(out, /CDATA\[\s*svg\{/, 'never a bare svg{} selector');
  });

  test('the scope is derived from the declarations — stable per export, distinct across them', () => {
    const red = finalizeStandaloneSvg(withTokens('--a:red;'), { xmlProlog: false });
    const redAgain = finalizeStandaloneSvg(withTokens('--a:red;'), { xmlProlog: false });
    const blue = finalizeStandaloneSvg(withTokens('--a:blue;'), { xmlProlog: false });
    assert.equal(red, redAgain, 'byte-stable — a re-export must not churn the file');
    const scopeOf = (t) => t.match(/data-lattice-scope="([^"]+)"/)?.[1] ?? '';
    assert.notEqual(scopeOf(red), scopeOf(blue), 'two different palettes cannot collide on one page');
  });

  // The first cut of the scoping reused the root's `id` when it had one — and a
  // Mermaid export ALWAYS has one, numbered per deck from 1. So two decks on two
  // themes both emitted `#lattice-mmd-1{…}` and the second re-palettized the first:
  // the exact bug the scoping was written to fix, reinstated for every diagram.
  test('two files sharing a root id still get different scopes', () => {
    const one = '<svg id="lattice-mmd-1" viewBox="0 0 10 10" data-lattice-tokens="--a:red;"><rect/></svg>';
    const two = '<svg id="lattice-mmd-1" viewBox="0 0 10 10" data-lattice-tokens="--a:blue;"><rect/></svg>';
    const a = finalizeStandaloneSvg(one, { xmlProlog: false });
    const b = finalizeStandaloneSvg(two, { xmlProlog: false });
    const scopeOf = (t) => t.match(/data-lattice-scope="([^"]+)"/)?.[1] ?? '';
    assert.notEqual(scopeOf(a), scopeOf(b), 'a shared root id must not become a shared selector');
    // And the author's own id survives — it can be the target of url(#…) or
    // aria-labelledby inside the same file, so we never rewrite it.
    assert.ok(a.includes('id="lattice-mmd-1"'), "the source's own id is left alone");
    assert.equal(a.match(/ id=/g).length, 1, 'exactly one id attribute');
  });

  test('an unusable root id yields no second id attribute', () => {
    for (const bad of ['1starts-with-a-digit', 'has:a:colon', '']) {
      const out = finalizeStandaloneSvg(
        `<svg id="${bad}" viewBox="0 0 10 10" data-lattice-tokens="--a:red;"><rect/></svg>`, { xmlProlog: false });
      assert.equal(out.match(/ id=/g).length, 1, `id="${bad}" produced a duplicate id attribute`);
    }
  });

  test('no attribute means no rule — an inline clone is byte-identical to before', () => {
    const out = finalizeStandaloneSvg('<svg viewBox="0 0 10 10"><rect/></svg>', { xmlProlog: false });
    assert.doesNotMatch(out, /<style/);
  });

  test('token rule and embedded fonts share one CDATA block, tokens first', () => {
    const out = finalizeStandaloneSvg(withTokens('--a:red;'), {
      xmlProlog: false, fontFaceCss: '@font-face{font-family:X;src:url(data:font/woff2;base64,AA)}',
    });
    assert.equal(out.match(/<style/g).length, 1);
    assert.ok(out.search(/\[data-lattice-scope="[a-z0-9]+"\]\{--a:red;\}/) < out.indexOf('@font-face'),
      'tokens precede the faces');
  });

  test('admits the shapes a resolved paint actually takes', () => {
    for (const ok of ['rgb(30, 58, 95)', 'rgba(1, 2, 3, 0.5)', 'oklab(0.55 0.02 -0.11)',
      'oklch(62% 0.13 264 / 0.4)', '#11131780', 'red', 'none', 'currentColor']) {
      const out = finalizeStandaloneSvg(withTokens(`--t:${ok};`), { xmlProlog: false });
      assert.match(out, /\[data-lattice-scope="[a-z0-9]+"\]\{--t:/, `should admit ${ok}`);
      assert.ok(out.includes(`--t:${ok};`), `should carry ${ok} verbatim`);
    }
  });

  test('a value must be a COLOR LITERAL — a charset filter is not enough', () => {
    // Every one of these passes a naive "only these characters" test and must still be
    // refused: a fetch, a nested call, a second declaration smuggled past the split, and
    // an early CDATA close.
    for (const bad of ['url(//evil/x)', 'url(http://evil/x)', 'a(b(c))', 'red}svg{fill:blue',
      'red !important', ']]></style><script>alert(1)</script>', 'var(--other)', '']) {
      const out = finalizeStandaloneSvg(withTokens(`--t:${bad};`), { xmlProlog: false });
      assert.doesNotMatch(out, /--t:/, `should refuse ${JSON.stringify(bad)}`);
    }
  });

  test('a name must be a custom property', () => {
    for (const bad of ['fill', '--a b', '--a<b', 'color']) {
      const out = finalizeStandaloneSvg(withTokens(`${bad}:red;`), { xmlProlog: false });
      assert.doesNotMatch(out, /<style/, `should refuse name ${bad}`);
    }
  });

  test('one bad declaration drops itself, not the good ones beside it', () => {
    const out = finalizeStandaloneSvg(
      withTokens('--good:red;--bad:url(//x);--also-good:rgb(1, 2, 3);'), { xmlProlog: false });
    assert.match(out, /\[data-lattice-scope="[a-z0-9]+"\]\{--good:red;--also-good:rgb\(1, 2, 3\);\}/);
  });

  test('reads the attribute at an attribute BOUNDARY, not wherever the name appears', () => {
    // A value that merely SPELLS the attribute is not the attribute. Searching the
    // root's text for the name matched here and ate `viewBox` as the "declaration
    // list"; tokenizing the attribute list cannot, because every value is "-quoted
    // and so cannot contain a " of its own.
    const out = finalizeStandaloneSvg(
      '<svg aria-label=" data-lattice-tokens=" viewBox="0 0 10 10"><rect/></svg>', { xmlProlog: false });
    assert.match(out, /viewBox="0 0 10 10"/);
    assert.doesNotMatch(out, /<style/);
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

// ── The OTHER consumer of the same collection ───────────────────────────────────
// `finalizeStandaloneSvg` above writes the definitions into a FILE's `<style>`. The
// Studio's PDF/PPTX rasterizer has no file: it hands the flattened clone to
// html-to-image, which deep-clones an `<svg>` root and then walks none of its
// descendants — so every paint the bake left as `var(--token)` arrives in a detached
// document with nothing to define it, and an undefined `fill` is SVG-initial BLACK
// (#2210: 47 of 62 paints on a flattened heatmap). `applyCollectedTokens` is that
// path's consumer — same attribute, same grammar, onto the root's own inline style.
//
// jsdom, not a hand-rolled stub: the claim under test is that real CSSOM accepts these
// declarations and hands them back, and a fake `style` object would assert only that
// the test's own object works. What jsdom canNOT show is the html-to-image half — that
// an inherited custom property actually repaints a descendant in the serialized
// document. That is a real-browser claim and it is pinned in
// docs/e2e/journeys/chart-export.spec.ts, not here.
describe('applyCollectedTokens — the rasterizer path\'s definitions', () => {
  const rootOf = (attr) => {
    const dom = new JSDOM(`<!doctype html><body><svg ${attr}><rect/></svg></body>`);
    return dom.window.document.querySelector('svg');
  };

  test('moves each definition onto the root\'s own inline style and strips the scratch attribute', () => {
    const el = rootOf('data-lattice-tokens="--chart-cat-1:rgb(30, 58, 95);--chart-cat-2:#ff0000;"');
    assert.equal(applyCollectedTokens(el), 2);
    assert.equal(el.style.getPropertyValue('--chart-cat-1'), 'rgb(30, 58, 95)');
    assert.equal(el.style.getPropertyValue('--chart-cat-2'), '#ff0000');
    // Scratch space between the two halves of one export — a clone that keeps it
    // publishes the deck's resolved palette into whatever happens to the element next.
    assert.equal(el.hasAttribute('data-lattice-tokens'), false);
  });

  test('a paint that references the token now resolves against the root', () => {
    // The whole point: the definition has to be INHERITABLE by the descendants the
    // bake wrote `var()` onto, not merely present somewhere on the element.
    const dom = new JSDOM('<!doctype html><body><svg data-lattice-tokens="--c:#336699;"><rect style="fill:var(--c)"/></svg></body>');
    const svg = dom.window.document.querySelector('svg');
    applyCollectedTokens(svg);
    const rect = dom.window.document.querySelector('rect');
    assert.equal(dom.window.getComputedStyle(rect).getPropertyValue('--c'), '#336699',
      'the rect must inherit the definition from the root, or its var(--c) fill stays undefined and falls to black');
  });

  test('no attribute is a no-op — the two non-collecting call sites are unaffected', () => {
    const el = rootOf('viewBox="0 0 10 10"');
    assert.equal(applyCollectedTokens(el), 0);
    assert.equal(el.getAttribute('style'), null);
  });

  test('strips the attribute even when nothing in it is admitted', () => {
    const el = rootOf('data-lattice-tokens="notatoken:red;"');
    assert.equal(applyCollectedTokens(el), 0);
    assert.equal(el.hasAttribute('data-lattice-tokens'), false);
  });

  test('a missing or style-less element is tolerated, never thrown from', () => {
    // One un-tokenized chart must not fail a whole deck export — the caller's catch
    // already leaves the svg unstyled, but this should not be the thing that trips it.
    assert.equal(applyCollectedTokens(null), 0);
    assert.equal(applyCollectedTokens({}), 0);
  });
});

// ONE grammar, two consumers. The producer (`flattenSvgStyles`) writes the attribute;
// `finalizeStandaloneSvg` and `applyCollectedTokens` read it. A second reader that
// re-derived the producer's format from its own copy of the rules is exactly the shape
// of defect this branch was handed a warning about — it passes on the day it is written
// and drifts silently the first time the emit changes.
describe('parseTokenDecls — the shared grammar', () => {
  test('admits a computed color in each of the three shapes getComputedStyle produces', () => {
    assert.deepEqual(parseTokenDecls('--a:rgb(1, 2, 3);--b:#abc;--c:red;'),
      [['--a', 'rgb(1, 2, 3)'], ['--b', '#abc'], ['--c', 'red']]);
  });

  test('refuses a name that is not a custom property, and a value that is not a color literal', () => {
    for (const bad of ['color:red;', 'a:red;', '--a:url(//evil/x);', '--a:b(c(d));', '--a:;', '--bad name:red;']) {
      assert.deepEqual(parseTokenDecls(bad), [], `admitted ${bad}`);
    }
  });

  test('both consumers admit exactly the same set', () => {
    // The drift arm. If one reader ever grows its own filter, this fails.
    const css = '--ok:rgb(1, 2, 3);--nope:url(//evil/x);--fine:#abc;';
    const fromFile = finalizeStandaloneSvg(
      `<svg viewBox="0 0 10 10" data-lattice-tokens="${css}"><rect/></svg>`, { xmlProlog: false });
    const fileNames = new Set(Array.from(fromFile.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g), (m) => m[1]));
    const dom = new JSDOM(`<!doctype html><body><svg data-lattice-tokens="${css}"></svg></body>`);
    const el = dom.window.document.querySelector('svg');
    applyCollectedTokens(el);
    const domNames = new Set(parseTokenDecls(css).map(([n]) => n));
    assert.deepEqual([...domNames].sort(), [...fileNames].sort());
    for (const n of domNames) assert.notEqual(el.style.getPropertyValue(n), '', `${n} missing from the inline style`);
  });
});

// `bakeSvg` is the engine's `baked` delivery mode (2026-09-24-one-style-delivery-spine.md
// §4.1): flatten, then freeze the tokens onto the clone root. The Studio's rasterizer relies
// on the freeze being the DEFAULT; the exported player's diagram bake relies on `false`
// switching it off so its dark/light toggle still moves the tokens. Pinned on the policy,
// because jsdom resolves no custom property and so cannot watch a freeze happen.
describe('bakePlan — the baked mode\'s option policy', () => {
  test('freezes by default, and collects exactly when it freezes', () => {
    for (const opts of [undefined, {}, { foreignObjectLabels: 'text' }, { freezeTokens: true }]) {
      const plan = bakePlan(opts);
      assert.equal(plan.freeze, true, `${JSON.stringify(opts)} must freeze`);
      assert.equal(plan.flatten.collectTokens, true);
    }
  });
  test('only a literal false turns the freeze off', () => {
    const plan = bakePlan({ freezeTokens: false, foreignObjectLabels: 'text' });
    assert.deepEqual(plan, { freeze: false, flatten: { foreignObjectLabels: 'text', collectTokens: false } });
  });
});
