/**
 * The scheme allowlist for URL-typed slide fields (lib/core/url-scheme.js): a background image and
 * the deck logo. Design note 2026-10-17-meta-record.md §5.7. Found by the red team on PR #2762:
 * `url(javascript:…)` and a remote URL both reached a real `background-image` with no check.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { urlVerdict, cssUrlVerdict } = require('../../../lib/core/url-scheme');
const { resolveLogoRef, deckLogoRefusal } = require('../../../lib/core/logo-builtins');
const { createEngine } = require('../../../lib/engine');

describe('urlVerdict', () => {
  const ok = ['img/a.png', '../a.png', '/a.png', 'a b.png', 'https://x.example/a.png', 'HTTPS://x.example/a.png', 'data:image/png;base64,AAAA', 'data:image/svg+xml,%3Csvg%3E', 'sample:logo-acme-mark.svg', 'asset:logo'];
  const bad = [
    ['javascript:alert(1)', /javascript/],
    ['JaVaScRiPt:alert(1)', /javascript/],
    ['java\tscript:alert(1)', /javascript/],
    ['\u0001 javascript:alert(1)', /javascript/],
    ['file:///etc/passwd', /file/],
    ['http://x.example/a.png', /http/],
    ['data:text/html,<b>x</b>', /image/],
    ['data:image/html,x', /image/],
    ['blob:https://x/1', /blob/],
    ['vbscript:x', /vbscript/],
    ['//evil.example/a.png', /protocol-relative/],
    ['\\\\evil.example\\a.png', /protocol-relative/],
    ['', /empty/],
  ];
  for (const u of ok) test(`allows ${JSON.stringify(u)}`, () => assert.equal(urlVerdict(u).ok, true));
  for (const [u, why] of bad) {
    test(`refuses ${JSON.stringify(u)}`, () => {
      const v = urlVerdict(u);
      assert.equal(v.ok, false);
      assert.match(v.reason, why);
    });
  }
});

describe('cssUrlVerdict', () => {
  test('finds a bad url in any position, quoted or not', () => {
    assert.equal(cssUrlVerdict('url(javascript:alert(1))').ok, false);
    assert.equal(cssUrlVerdict('url("file:///x")').ok, false);
    assert.equal(cssUrlVerdict("url('http://x/a.png')").ok, false);
    assert.equal(cssUrlVerdict('url( https://x.example/a.png )').ok, true);
  });
  test('a value with no url() names no URL', () => {
    assert.equal(cssUrlVerdict('linear-gradient(red, blue)').ok, true);
    assert.equal(cssUrlVerdict('none').ok, true);
  });
});

describe('the logo door', () => {
  test('a built-in name still resolves; a hostile scheme resolves to nothing', () => {
    assert.match(resolveLogoRef('lattice'), /^data:image\/svg\+xml,/);
    assert.equal(resolveLogoRef('javascript:alert(1)'), '');
    assert.equal(resolveLogoRef('file:///x.png'), '');
    assert.equal(resolveLogoRef('https://x.example/l.svg'), 'https://x.example/l.svg');
    assert.equal(resolveLogoRef('../l.svg'), '../l.svg');
    assert.equal(resolveLogoRef('sample:logo-acme-mark.svg'), 'sample:logo-acme-mark.svg');
  });
  test('deckLogoRefusal says why, and is silent for good values and built-ins', () => {
    assert.match(deckLogoRefusal('file:///x.png'), /file/);
    assert.equal(deckLogoRefusal('lattice'), null);
    assert.equal(deckLogoRefusal('https://x.example/l.svg'), null);
    assert.equal(deckLogoRefusal(''), null);
  });
});

describe('the engine, end to end', () => {
  const e = createEngine();
  const section = (md) => {
    const r = e.render(md);
    const style = /<section[^>]*style="([^"]*)"/.exec(r.html)?.[1] ?? '';
    return { r, bg: /(?:^|;)background-image:([^;]*)/.exec(style)?.[1] ?? null, ids: (r.diagnostics || []).filter((d) => d.id === 'meta/url-scheme') };
  };
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', '"data:text/html,<b>x</b>"', '"java\tscript:alert(1)"', 'http://x.example/a.png', '//evil.example/a.png']) {
    test(`_backgroundImage: url(${url}) is dropped with a diagnostic`, () => {
      const { bg, ids } = section(`<!-- _backgroundImage: url(${url}) -->\n# A`);
      assert.equal(bg, null);
      assert.equal(ids.length, 1);
    });
  }
  for (const url of ['https://x.example/a.png', 'data:image/png;base64,AAAA', 'img/a.png']) {
    test(`_backgroundImage: url(${url}) still renders`, () => {
      const { bg, ids } = section(`<!-- _backgroundImage: url(${url}) -->\n# A`);
      assert.match(bg, /^url\(/);
      assert.deepEqual(ids, []);
    });
  }
  test('a gradient still renders', () => {
    assert.equal(section('<!-- _backgroundImage: linear-gradient(red, blue) -->\n# A').bg, 'linear-gradient(red, blue)');
  });
  test('a hostile front-matter logo shows no logo and says why; a good one is untouched', () => {
    const bad = e.render('---\nlogo: javascript:alert(1)\n---\n# A');
    assert.ok(!bad.html.includes('deck-logo'));
    assert.equal(bad.diagnostics.filter((d) => d.id === 'meta/url-scheme').length, 1);
    const good = e.render('---\nlogo: https://x.example/l.svg\n---\n# A');
    assert.match(good.html, /class="deck-logo[^"]*" src="https:\/\/x\.example\/l\.svg"/);
  });
});
