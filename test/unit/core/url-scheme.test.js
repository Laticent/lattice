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
  test('a palette-blind gradient may still read a token', () => {
    assert.equal(section('<!-- _backgroundImage: linear-gradient(var(--accent), red) -->\n# A').bg, 'linear-gradient(var(--accent), red)');
  });
  test('a value cannot build a URL from another value: image-set(var(--header)) is the string-to-URL route', () => {
    for (const v of ['image-set(var(--header) 1x)', 'image-set(attr(x) 1x)', '-webkit-image-set(var(--header) 1x)', 'src(var(--header))', 'cross-fade(var(--header), red)']) {
      const { bg, ids } = section(`---\nheader: http://127.0.0.1:1/b\n---\n<!-- _backgroundImage: ${v} -->\n# A`);
      assert.equal(bg, null, v);
      assert.equal(ids.length, 1, v);
    }
  });
  test('a value the declaration sink refuses is dropped WITH a diagnostic, not in silence', () => {
    for (const v of ['url(\\66 ile:///etc/passwd)', 'image-set("http://evil/x" 1x)']) {
      const { bg, ids } = section(`<!-- _backgroundImage: ${v} -->\n# A`);
      assert.equal(bg, null, v);
      assert.equal(ids.length, 1, v);
    }
  });
  test('![bg] follows the same list, on an image slide and on every other slide', () => {
    const lift = (u) => e.render(`<!-- _class: image -->\n\n![bg](${u})\n\n## T\n`).html;
    const plain = (u) => e.render(`## T\n\n![bg](${u})\n`);
    for (const u of ['http://evil/x.png', '//evil/x.png', 'blob:x', 'ftp://e/x', 'javascript:alert(1)', 'file:///etc/x']) {
      assert.doesNotMatch(lift(u), /lattice-bg|evil|blob:x|ftp:|javascript:|file:/, `image slide: ${u}`);
      const r = plain(u);
      assert.doesNotMatch(r.html, /background-image:url\(&quot;(?:http|\/\/|blob|ftp|javascript|file)/, `plain slide: ${u}`);
      // markdown-it's own link check already refuses javascript: and file: on this path, so no image token
      // reaches the engine to be reported; the rest are reported.
      if (!/^(javascript|file):/.test(u)) assert.equal((r.diagnostics || []).filter((d) => d.id === 'meta/url-scheme').length, 1, `diagnostic: ${u}`);
    }
    assert.match(lift('https://x.example/a.png'), /lattice-bg/);
    assert.match(lift('img/a.png'), /lattice-bg/);
    assert.match(plain('https://x.example/a.png').html, /background-image:url\(&quot;https:/);
    assert.match(plain('img/a.png').html, /background-image:url\(&quot;img\/a\.png/);
    assert.deepEqual((plain('sample:logo-acme-mark.svg').diagnostics || []).filter((d) => d.id === 'meta/url-scheme'), []);
  });
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
