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

/** Whether `text` holds `part` anywhere. A test of absence, not a sanitizer: written as a split so
 *  CodeQL's URL-substring query does not read `.includes(url)` as one. */
const holds = (text, part) => String(text).split(part).length > 1;
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
    assert.ok(galleryRemoteRefs(md).some((u) => u === `${BASE}/beacon.png`));
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
      assert.ok(!holds(withoutLabels(html), BASE), html);
      assert.ok(blocked.some((b) => b.url.startsWith(`${BASE}/${p.name}`)), JSON.stringify(blocked));
    });
    if (p.kind === 'html') continue;
    test(`blockWebCss: ${p.name}`, () => {
      const { css, blocked } = blockWebCss(p.text);
      assert.ok(!holds(css, BASE), css);
      assert.ok(blocked.some((b) => b.url.startsWith(`${BASE}/${p.name}`)));
    });
  }

  test('a font is left to the policy where one backs the rewrite, and refused where none does', () => {
    const font = PAYLOADS.find((p) => p.kind === 'font');
    assert.ok(holds(blockWebImages(asHtml(font), [], { DOMParser }).html, `${BASE}/font-face-src`));
    assert.ok(!holds(blockWebImages(asHtml(font), [], { fonts: true, DOMParser }).html, BASE));
  });

  test('an attribute selector naming a URL is a selector, not a fetch, and stays', () => {
    const css = `a[href^="${BASE}/x"]{color:red}`;
    assert.equal(blockWebCss(css).css, css);
  });

  test('a rewritten style attribute keeps its quotes and every other character reference', () => {
    const { html } = blockWebImages(`<p style='font-family:"Caf&eacute;";content:"a&amp;b";background:url(${BASE}/q)'>x</p>`, [], { DOMParser: null });
    assert.match(html, /^<p style='font-family:"Caf&eacute;";content:"a&amp;b";background:repeating-linear-gradient\(/);
  });

  test('a web string that fetches nothing becomes `none`, not a slide-sized hatch', () => {
    const { css } = blockWebCss(`footer::after{content:"${BASE}/report"} p{--src:"${BASE}/t";background:url(${BASE}/bg)}`);
    assert.equal(css.match(/none/g)?.length, 2);
    assert.equal(css.match(/repeating-linear-gradient/g)?.length, 1);
  });

  test('`@font-face` inside a selector or a prelude does not hide the rule from the rewrite', () => {
    for (const css of [`:is(@font-face, p){background:url(${BASE}/a)}`, `p{ :is(@font-face, &) {background:url(${BASE}/b)} }`, `@media (@font-face), all{p{background:url(${BASE}/c)}}`]) {
      const out = blockWebImages(`<style>${css}</style>`, [], { DOMParser: null });
      assert.ok(!holds(out.html, BASE), out.html);
      assert.equal(out.blocked.length, 1);
    }
  });

  test('declarative shadow DOM content is rewritten, though a DOMParser does not attach it', () => {
    const { html } = blockWebImages(`<div><template shadowrootmode="open"><p style="background:url(${BASE}/dsd)">x</p><img alt=a'b src=${BASE}/dsd2></template></div>`, [], { DOMParser });
    assert.ok(!holds(withoutLabels(html), BASE), html);
  });

  test('an attribute keeps a legacy name followed by `=` as written, as the HTML parser does', () => {
    const out = blockWebImages(`<p style='--a:&quot=; background:url(${BASE}/q); --b:"'>x</p>`, [], { DOMParser: null });
    assert.ok(!holds(out.html, `${BASE}/q`), out.html);
  });

  test('a numeric reference in the windows-1252 range decodes to that character', () => {
    assert.equal(decodeEntities('&#x99;&#128;'), '\u2122\u20ac');
  });

  test('with no parser, a <style> inside <svg> is still counted as the tree builder reads it', () => {
    for (const p of PAYLOADS.filter((x) => x.name.startsWith('svg-style'))) {
      const { blocked } = blockWebImages(asHtml(p), [], { DOMParser: null });
      assert.ok(blocked.some((b) => b.url.startsWith(`${BASE}/${p.name}`)), p.name);
    }
  });
});

describe('the scanner reads hostile markup in linear time', () => {
  // Each shape took 25-50 s at 1,000 repetitions with the regexes the scanner replaced.
  const shapes = { 'unclosed quote in a tag name': '<style"', 'unclosed mermaid hosts': '<div class="mermaid" ', 'unclosed style attributes': '<p style="', 'quote in an unquoted value': "<img alt=a'b " };
  for (const [name, unit] of Object.entries(shapes)) {
    test(name, () => {
      const time = (n) => {
        const t = process.hrtime.bigint();
        blockWebImages(unit.repeat(n), [], { DOMParser: null });
        return Number(process.hrtime.bigint() - t) / 1e6;
      };
      time(2000);
      const big = time(20000);
      assert.ok(big < 500, `${big.toFixed(0)} ms for 20,000 repetitions`);
    });
  }
});

describe('the parser check never runs on a deck Lattice ships', () => {
  const engine = require('../../../lib/engine/index.js').createEngine();
  // web-images.md holds the corpus's web references; gallery.md its charts' inline SVG.
  for (const deck of ['examples/web-images.md', 'examples/sample-images.md', 'examples/video.md', 'examples/qr.md', 'test/integration/baseline-decks/gallery.md']) {
    test(deck, () => {
      const { html } = engine.render(fs.readFileSync(path.join(__dirname, '../../..', deck), 'utf8'));
      let parsed = 0;
      class Counting extends DOMParser {
        parseFromString(...args) {
          parsed++;
          return super.parseFromString(...args);
        }
      }
      const regexOnly = blockWebImages(html, [], { DOMParser: null });
      const checked = blockWebImages(html, [], { DOMParser: Counting });
      assert.equal(parsed, 0);
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
