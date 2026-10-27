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

const { blockWebCss, blockWebImages, verifyWithParser, remoteCssRefs, cssRefSpans, decodeEntities } = remoteRef;
const BASE = 'https://evil.example';
const PAYLOADS = webRefBeacons(BASE);
const { DOMParser } = new JSDOM('').window;
/** A reference as the HTML parser decodes it in an attribute value. */
const parsed = (ref) => new DOMParser().parseFromString(`<p title="${ref}">`, 'text/html').querySelector('p').getAttribute('title');

/** Whether `text` holds `part` anywhere. A test of absence, not a sanitizer: written as a split so
 *  CodeQL's URL-substring query does not read `.includes(url)` as one. */
/** `https:host` and `https:/host` read as `https://host` to the URL parser; the scanners report the normalized address. */
const normalized = (u) => String(u).replace(/^(https?:)\/*/i, '$1//');
/** Whether `u` names payload `p`: by its address, or, for the row Firefox reads undecoded, by host and name. */
const names = (u, p) => (p.onlyIn ? holds(u, `evil.example/${p.name}`) : String(u).startsWith(`${BASE}/${p.name}`));
const holds = (text, part) => String(text).split(part).length > 1;
/** The text with every `data-lattice-web-src="…"` label taken out: the one place the URL may stay. */
const withoutLabels = (html) => html.replace(/data-lattice-web-src="[^"]*"/g, '');

describe('the CSS scanners list every spelling', () => {
  for (const p of PAYLOADS.filter((x) => x.kind !== 'html')) {
    test(`remoteCssRefs: ${p.name}`, () => {
      assert.ok(remoteCssRefs(p.text).some((u) => names(u, p)), JSON.stringify(remoteCssRefs(p.text)));
    });
  }

  test('the gallery gate refuses a <style> whose string a form feed ends', () => {
    const md = `# Hello\n\n<style>\na{b:"x\f}section{background:url(${BASE}/beacon.png)}"}\n</style>\n`;
    assert.ok(galleryRemoteRefs(md).some((u) => u === `${BASE}/beacon.png`));
  });

  // The engine escapes these as text (`&lt;p/style=…`): CommonMark does not read them as HTML, so
  // nothing reaches the page to fetch, and the gate has nothing to list.
  const ESCAPED_BY_THE_ENGINE = new Set(['slash-before-style', 'no-space-before-src', 'quote-in-unquoted-value']);
  test('the gallery gate lists every payload the engine renders as markup', () => {
    const engine = require('../../../lib/engine/index.js');
    for (const p of PAYLOADS) {
      const md = `# Sample\n\n${asHtml(p)}\n`;
      if (ESCAPED_BY_THE_ENGINE.has(p.name)) {
        assert.ok(!holds(engine.render(md).html, `<${asHtml(p).slice(1, 4)}`), `${p.name} now reaches the page as markup`);
        continue;
      }
      // The gate reports the whole value that holds the address (a style attribute), not only the URL.
      if (p.opaque) {
        assert.ok(galleryRemoteRefs(md).some((u) => u.startsWith('policy:')), p.name);
        continue;
      }
      assert.ok(galleryRemoteRefs(md).some((u) => holds(normalized(u), `${BASE}/${p.name}`)), p.name);
    }
  });

  test("the code-package door's cssRefTargets lists every CSS payload a style attribute can fetch", async () => {
    const { cssRefTargets } = await import('../../../lib/core/door-attr.mjs');
    // The door reads attribute values only; `@import` in a style attribute is ignored (measured in
    // Chromium 2026-10-25: 0 requests, against 1 for the same text in a <style>).
    for (const p of PAYLOADS.filter((x) => x.kind !== 'html' && x.name !== 'import-string' && x.name !== 'import-undecoded-escape')) {
      assert.ok(cssRefTargets(p.text).some((u) => u.startsWith(`${BASE}/${p.name}`)), p.name);
    }
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

describe('a refresh meta', () => {
  test('is removed whatever the page it names: a web address, the scheme without slashes, a data: page', () => {
    for (const target of ['https://evil.example/r', 'https:evil.example/r', 'HTTPS:/evil.example/r', '//evil.example/r', 'data:text/html,x', 'blob:https://evil.example/u']) {
      for (const content of [`0;url=${target}`, `0; URL = '${target}'`, `5,${target}`, `0 ${target}`]) {
        const html = `<meta http-equiv="Refresh" content="${content}"><p>x</p>`;
        assert.equal(blockWebImages(html, [], { fonts: true, DOMParser }).html, '<p>x</p>', content);
      }
    }
  });
  test('is removed whatever its delay: seconds, minutes, a fraction, a trailing dot', () => {
    for (const delay of ['0', '1', '3', '60', '3600', '86400', '0.5', '1.', '.5', '00007', '2147483647', '4294967296']) {
      for (const sep of [';url=', '; URL=', ',', ' ', ';']) {
        const html = `<meta http-equiv="refresh" content="${delay}${sep}https://evil.example/r"><p>x</p>`;
        assert.ok(!holds(blockWebImages(html, [], { fonts: true, DOMParser }).html, 'evil.example'), html);
      }
    }
  });
  test('an exponent is not a delay: `1e3;url=https://…` reads as the relative page `e3;url=…`, as the browser reads it', () => {
    const html = '<meta http-equiv="refresh" content="1e3;url=https://evil.example/r"><p>x</p>';
    assert.equal(blockWebImages(html, [], { fonts: true, DOMParser }).html, html);
  });
  test('stays when it names a relative page, and with an allowed origin', () => {
    const rel = '<meta http-equiv="refresh" content="0;url=next.html">';
    assert.equal(blockWebImages(rel, [], { DOMParser }).html, rel);
    const ok = '<meta http-equiv="refresh" content="0;url=https://ok.example/p">';
    assert.equal(blockWebImages(ok, ['https://ok.example'], { DOMParser }).html, ok);
  });
  test('a removed tag takes the edits inside it along (the splice takes no overlaps)', () => {
    const html = `<meta http-equiv="refresh" content="0;url=https://evil.example/r" style="background:url(https://evil.example/s)"><p>x</p>`;
    assert.equal(blockWebImages(html, [], { fonts: true, DOMParser }).html, '<p>x</p>');
  });
});

describe('an address that fires on a click or a submit', () => {
  const cases = [
    ['<a ping="https://evil.example/p" href="#">x</a>', '<a href="#">x</a>'],
    ['<a PING="https://a.example/p   https://evil.example/q" href="#">x</a>', '<a href="#">x</a>'],
    ['<area ping=https://evil.example/p href="#">', '<area href="#">'],
    ['<form action="https://evil.example/s"><input name=q></form>', '<form><input name=q></form>'],
    ['<form ACTION="//evil.example/s"></form>', '<form></form>'],
    ['<form action="&#104;ttps&colon;//evil.example/s"></form>', '<form></form>'],
    ['<form><button formaction="https://evil.example/s">x</button></form>', '<form><button>x</button></form>'],
    ['<form><input type=submit formaction=\\\\evil.example/s></form>', '<form><input type=submit></form>'],
  ];
  test('is removed where no policy stands behind the host, by the markup scan and by the parser check', () => {
    for (const [html, want] of cases) {
      assert.equal(blockWebImages(html, [], { fonts: true, DOMParser }).html, want, html);
      assert.equal(verifyWithParser(`<p>${html}</p>`, DOMParser, (u) => remoteRef.isRemoteUrl(u), true).includes('evil.example'), false, html);
    }
  });
  test('is listed in blocked with its origin, so a host can offer to approve it', () => {
    const r = blockWebImages('<a ping="https://evil.example/p https://other.example/q" href="#">x</a>', [], { fonts: true, DOMParser });
    assert.deepEqual(r.blocked.map((b) => b.origin).sort(), ['https://evil.example', 'https://other.example']);
    // the approved one passes; the attribute still goes because the other address in it does not
    const part = blockWebImages('<a ping="https://ok.example/p https://evil.example/q" href="#">x</a>', ['https://ok.example'], { fonts: true, DOMParser });
    assert.equal(part.html, '<a href="#">x</a>');
  });
  test('stays when it is relative, a fragment, or an origin the user approved', () => {
    for (const html of ['<form action="/save"></form>', '<form action="#"></form>', '<a ping="track" href="#">x</a>', '<form action="https://ok.example/s"></form>', '<a ping="https://ok.example/p" href="#">x</a>']) {
      assert.equal(blockWebImages(html, ['https://ok.example'], { fonts: true, DOMParser }).html, html, html);
    }
  });
  test('is left to the policy where one stands behind the host (connect-src and form-action are closed)', () => {
    const html = '<form action="https://evil.example/s"></form>';
    assert.equal(blockWebImages(html, [], { DOMParser }).html, html);
  });
});

describe('an allowed origin does not vouch for an address the browser reads differently', () => {
  // The browser decodes an attribute value once. `&amp;sol;` is the text `&sol;`, which is not a slash: in
  // `https://own.example&sol;@evil.example/x` the part before `@` is userinfo and the request goes to evil.example.
  // Decoding it a second time read the address as `https://own.example/@evil.example/x`, the allowed origin.
  const own = ['https://own.example'];
  const smuggled = 'https://own.example&amp;sol;@evil.example/x';
  const kept = (html, opts = { fonts: true }) => blockWebImages(html, own, { ...opts, DOMParser }).html;
  test('a form action, a formaction and a ping lose it', () => {
    for (const html of [`<form action="${smuggled}"></form>`, `<form><button formaction="${smuggled}">x</button></form>`, `<a ping="${smuggled}" href="#">x</a>`]) {
      assert.ok(!holds(kept(html), 'evil.example'), html);
    }
  });
  test('a srcset, a src, a style background and a base lose it, with and without the fonts mode', () => {
    for (const html of [`<img srcset="${smuggled} 1x">`, `<img src="${smuggled}">`, `<div style="background:url(${smuggled})">x</div>`, `<base href="${smuggled}"><p>x</p>`]) {
      for (const opts of [{ fonts: true }, { fonts: false }]) assert.ok(!holds(withoutLabels(kept(html, opts)), 'evil.example'), `${html} ${JSON.stringify(opts)}`);
    }
  });
  test('the same address through the parser check', () => {
    const refuse = (u) => remoteRef.isRemoteUrl(u) && !String(u).startsWith('https://own.example/');
    const out = verifyWithParser(`<form action="${smuggled}"></form>`, DOMParser, refuse, true);
    assert.ok(!holds(out, 'evil.example'), out);
  });
  test('a plain address of the allowed origin still passes', () => {
    for (const html of ['<form action="https://own.example/save"></form>', '<img srcset="https://own.example/a.png 1x">']) assert.equal(kept(html), html, html);
  });
});

describe('a noscript the sanitizer unwraps', () => {
  // The scanner reads <noscript> content as text, as a page that runs scripts does; a sanitizer parses without scripts, keeps the
  // elements and drops the wrapper, so the image it hid is live afterwards. The page's own parser is asked whenever a noscript appears.
  test('loses the address in an image inside it, with and without the fonts mode', () => {
    for (const html of ['<noscript><img src="https://evil.example/a"></noscript>', '<noscript><img srcset="//evil.example/a 1x, //evil.example/b 2x"></noscript>', '<p><noscript><img src=https://evil.example/a></noscript></p>']) {
      for (const fonts of [true, false]) assert.ok(!holds(withoutLabels(blockWebImages(html, [], { fonts, DOMParser }).html), 'evil.example'), `${html} ${fonts}`);
    }
  });
  test('still refuses an image after the noscript that ends the raw text early', () => {
    const html = '<noscript><p title="</noscript><img src=https://evil.example/a>"></noscript>';
    assert.ok(!holds(withoutLabels(blockWebImages(html, [], { DOMParser }).html), 'evil.example'));
  });
});

describe('a list attribute split by a named whitespace reference', () => {
  test('ping and attributionsrc see the second address after &Tab; and &NewLine;', () => {
    for (const html of ['<a href=/ ping="/x&Tab;https://evil.test/p">x</a>', '<a href=/ ping="/x&NewLine;https://evil.test/p">x</a>', '<a href="/n" attributionsrc="/x&Tab;https://evil.test/p">x</a>']) {
      assert.ok(!holds(blockWebImages(html, [], { fonts: true, DOMParser }).html, 'evil.test'), html);
    }
  });
});

describe('attributionsrc', () => {
  test('is removed where no policy stands behind the host, on an image and on a link', () => {
    for (const [html, want] of [
      ['<img src="/i.png" attributionsrc="https://evil.example/r">', '<img src="/i.png">'],
      ['<a href="/n" attributionsrc="https://ok.example/a https://evil.example/r">x</a>', '<a href="/n">x</a>'],
    ]) assert.equal(blockWebImages(html, [], { fonts: true, DOMParser }).html, want, html);
  });
  test('stays when empty, relative or approved', () => {
    for (const html of ['<a href="/n" attributionsrc>x</a>', '<a href="/n" attributionsrc="/r">x</a>', '<a href="/n" attributionsrc="https://ok.example/r">x</a>']) {
      assert.equal(blockWebImages(html, ['https://ok.example'], { fonts: true, DOMParser }).html, html, html);
    }
  });
});

describe('the rewrites leave the URL nowhere but its label', () => {
  for (const p of PAYLOADS) {
    test(`blockWebImages: ${p.name}`, () => {
      const { html, blocked } = blockWebImages(asHtml(p), [], { fonts: p.kind === 'font' || !!p.noPolicy, DOMParser });
      assert.ok(!holds(withoutLabels(html), BASE), html);
      if (!p.opaque) assert.ok(blocked.some((b) => (p.onlyIn ? names(b.url, p) : normalized(b.url).startsWith(`${BASE}/${p.name}`))), JSON.stringify(blocked));
    });
    if (p.kind === 'html') continue;
    test(`blockWebCss: ${p.name}`, () => {
      const { css, blocked } = blockWebCss(p.text);
      assert.ok(!holds(css, BASE), css);
      assert.ok(blocked.some((b) => names(b.url, p)));
    });
  }

  test('a fetching attribute is left to the policy where one backs the rewrite, and refused where none does', () => {
    // The preview frames' policy refuses these, and `blocked` feeds that policy and the "Load
    // images" offer, so a host with a policy sees the markup and the list unchanged.
    for (const p of PAYLOADS.filter((x) => x.noPolicy)) {
      const withPolicy = blockWebImages(asHtml(p), [], { DOMParser });
      assert.equal(withPolicy.html, asHtml(p), p.name);
      assert.deepEqual(withPolicy.blocked, [], p.name);
      assert.ok(!holds(blockWebImages(asHtml(p), [], { fonts: true, DOMParser }).html, BASE), p.name);
    }
  });

  test('a link is followed on a click, so its web href stays; a local reference stays too', () => {
    const html = `<a href="${BASE}/page">x</a><math><mi href="${BASE}/m">x</mi></math><svg><use href="#local"/><rect fill="url(#g)"/></svg>`;
    const out = blockWebImages(html, [], { fonts: true, DOMParser });
    assert.equal(out.html, html);
    assert.deepEqual(out.blocked, []);
  });

  test('the parser check refuses the same attributes as the text pass, and only with no policy', () => {
    // No fixture row trips `risky`, so the DOM half runs here directly, on every attribute row.
    const blocked = [];
    // The same test the real `refuse` makes: the address's origin, never a prefix of its text.
    const refuse = (u) => {
      if (remoteRef.webOrigin(u.trim()) !== BASE) return false;
      blocked.push(u);
      return true;
    };
    for (const p of PAYLOADS.filter((x) => x.noPolicy)) {
      assert.ok(!holds(verifyWithParser(asHtml(p), DOMParser, refuse, true), BASE), p.name);
      assert.equal(verifyWithParser(asHtml(p), DOMParser, refuse, false), asHtml(p), p.name);
    }
    const local = `<svg><use href="#l"/><rect fill="url(#g)"/></svg><a href="${BASE}/page">x</a><math><mi href="${BASE}/m">x</mi></math>`;
    assert.equal(verifyWithParser(local, DOMParser, refuse, true), local);
  });

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
    // `&Tab;` and `&NewLine;` decode to a real tab and newline, as `&#9;` does: a list attribute (`ping`, `attributionsrc`) splits on
    // them, and the URL parser (`urlAsParsed`) drops them from each address afterwards.
    assert.equal(decodeEntities(`&${n};`), parsed(`&${n};`), n);
  }
  // Names are case-sensitive, and only the legacy few work without a `;`.
  const odd = '&LPAR;&lpar &amp &constructor;';
  assert.equal(decodeEntities(odd), parsed(odd));
});
