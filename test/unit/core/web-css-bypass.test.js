/**
 * The spellings of a web fetch that a regex scan read differently from the browser
 * (test/fixtures/web-ref-beacons.js), held against every scanner that reads them:
 *   - `remoteCssRefs` (the gallery gate, `webRefsInCss`) and the door's `cssRefTargets` LIST them;
 *   - `blockWebCss` and `blockWebImages` REWRITE them, so the attacker's URL survives only as the
 *     placeholder's `data-lattice-web-src` label.
 * `blockWebImages` runs with jsdom's DOMParser here; every real caller is a browser page, where it
 * uses the page's own (test/integration/invariants/web-ref-beacon.test.js measures that in
 * Chromium, with a control arm that fetches every payload as written).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const remoteRef = require('../../../lib/core/remote-ref.js');
const { galleryRemoteRefs } = require('../../../lib/packages/gallery-gate.js');
const { webRefBeacons, asHtml } = require('../../fixtures/web-ref-beacons.js');

const { blockWebCss, blockWebImages, remoteCssRefs, cssRefSpans, decodeEntities } = remoteRef;
const BASE = 'https://evil.example';
const PAYLOADS = webRefBeacons(BASE);
const { DOMParser } = new JSDOM('').window;
/** A reference as the HTML parser decodes it in an attribute value. */
const parsed = (ref) => new DOMParser().parseFromString(`<p title="${ref}">`, 'text/html').querySelector('p').getAttribute('title');

/** The text with every `data-lattice-web-src="…"` label taken out: the one place the URL may stay. */
const withoutLabels = (html) => html.replace(/data-lattice-web-src="[^"]*"/g, '');

describe('the CSS scanners list every spelling', () => {
  for (const p of PAYLOADS.filter((x) => x.kind !== 'html')) {
    test(`remoteCssRefs: ${p.name}`, () => {
      assert.ok(remoteCssRefs(p.text).some((u) => u.startsWith(`${BASE}/${p.name}`)), JSON.stringify(remoteCssRefs(p.text)));
    });
  }

  test('the gallery gate refuses a <style> whose string a form feed ends', () => {
    const md = `# Hello\n\n<style>\na{b:"x\f}section{background:url(${BASE}/beacon.png)}"}\n</style>\n`;
    assert.ok(galleryRemoteRefs(md).includes(`${BASE}/beacon.png`));
  });

  test("the code-package door's cssRefTargets lists a url() after a string a form feed ends", async () => {
    const { cssRefTargets } = await import('../../../lib/core/door-attr.mjs');
    assert.deepEqual(cssRefTargets(`color:red;content:"x\f;background:url(${BASE}/door.png)`), [`${BASE}/door.png`]);
  });

  test('cssRefSpans: a font source and a selector string are marked, not hidden', () => {
    const spans = cssRefSpans(`a[href="${BASE}/sel"]{} @font-face{src:url(${BASE}/font)} p{background:url(${BASE}/bg)}`);
    assert.deepEqual(spans.map((s) => [s.value.slice(BASE.length), s.selector, s.fontFace]), [['/sel', true, false], ['/font', false, true], ['/bg', false, false]]);
  });
});

describe('the rewrites leave the URL nowhere but its label', () => {
  for (const p of PAYLOADS) {
    test(`blockWebImages: ${p.name}`, () => {
      const { html, blocked } = blockWebImages(asHtml(p), [], { fonts: p.kind === 'font', DOMParser });
      assert.ok(!withoutLabels(html).includes(BASE), html);
      assert.ok(blocked.some((b) => b.url.startsWith(`${BASE}/${p.name}`)), JSON.stringify(blocked));
    });
    if (p.kind === 'html') continue;
    test(`blockWebCss: ${p.name}`, () => {
      const { css, blocked } = blockWebCss(p.text);
      assert.ok(!css.includes(BASE), css);
      assert.ok(blocked.some((b) => b.url.startsWith(`${BASE}/${p.name}`)));
    });
  }

  test('a font is left to the policy where one backs the rewrite, and refused where none does', () => {
    const font = PAYLOADS.find((p) => p.kind === 'font');
    assert.ok(blockWebImages(asHtml(font), [], { DOMParser }).html.includes(`${BASE}/font-face-src`));
    assert.ok(!blockWebImages(asHtml(font), [], { fonts: true, DOMParser }).html.includes(BASE));
  });

  test('an attribute selector naming a URL is a selector, not a fetch, and stays', () => {
    const css = `a[href^="${BASE}/x"]{color:red}`;
    assert.equal(blockWebCss(css).css, css);
  });

  test('a rewritten style attribute is written back double-quoted and escaped', () => {
    const { html } = blockWebImages(`<p style='content:"a&b";background:url(${BASE}/q)'>x</p>`, [], { DOMParser: null });
    assert.match(html, /<p style="content:&quot;a&amp;b&quot;;background:repeating-linear-gradient\(/);
  });
});

describe('the parser check changes nothing on an ordinary deck', () => {
  const engine = require('../../../lib/engine/index.js').createEngine();
  for (const deck of ['examples/sample-images.md', 'examples/video.md', 'examples/qr.md', 'test/integration/baseline-decks/gallery.md']) {
    test(deck, () => {
      const { html } = engine.render(fs.readFileSync(path.join(__dirname, '../../..', deck), 'utf8'));
      const regexOnly = blockWebImages(html, [], { DOMParser: null });
      const checked = blockWebImages(html, [], { DOMParser });
      assert.equal(checked.html, regexOnly.html);
      assert.deepEqual(checked.blocked, regexOnly.blocked);
    });
  }
});

test("decodeEntities: every ASCII punctuation reference decodes as the HTML parser decodes it", () => {
  // Every named reference in the HTML standard (entities.json, a frozen list) whose value is one
  // ASCII character other than a letter or a digit, with its `;`.
  const NAMES = ['AMP', 'amp', 'DiacriticalGrave', 'grave', 'GT', 'gt', 'Hat', 'LT', 'lt', 'NewLine', 'QUOT', 'quot', 'Tab',
    'UnderBar', 'lowbar', 'VerticalLine', 'verbar', 'vert', 'apos', 'ast', 'midast', 'bsol', 'colon', 'comma', 'commat',
    'dollar', 'equals', 'excl', 'lbrace', 'lcub', 'lbrack', 'lsqb', 'lpar', 'num', 'percnt', 'period', 'plus', 'quest',
    'rbrace', 'rcub', 'rbrack', 'rsqb', 'rpar', 'semi', 'sol'];
  assert.equal(NAMES.length, 45);
  for (const n of NAMES) {
    // A tab and a newline decode to nothing: the URL parser drops both anywhere in a URL.
    const want = parsed(`&${n};`).replace(/[\t\n]/g, '');
    assert.equal(decodeEntities(`&${n};`), want, n);
  }
  // Names are case-sensitive, and only the legacy few work without a `;`.
  const odd = '&LPAR;&lpar &amp &constructor;';
  assert.equal(decodeEntities(odd), parsed(odd));
});
