/**
 * Unit: a code block's copy buttons (lib/core/code-copy.mjs; engineering/decisions/
 * 2026-10-15-code-plugin.md §9.7). Off by default: a block opts in with `@code{copy}`, a deck with
 * `code: copy`. The render writes only a `data-copy` marker; the buttons are drawn by script on a
 * reading surface, so no export carries them. The surface gate itself is driven in a real browser
 * (docs/e2e/code-copy.spec.ts); this file holds the marker, the buttons and the two payloads.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createEngine } = require('../../../lib/engine/index.js');

const load = () => import('../../../lib/core/code-copy.mjs');
const render = (md) => createEngine().render(md).html;
const FENCE = '```ts\nconst a = 1;\n// two\n```\n';

describe('the copy marker', () => {
  test('off by default; on for `@code{copy}` and for a deck\'s `code: copy`; `copy=off` opts one block out', () => {
    assert.doesNotMatch(render(`# A\n\n${FENCE}`), /data-copy/);
    assert.match(render(`# A\n\n\`@code{copy}\`\n${FENCE}`), /<pre class="lat-code" data-copy>/);
    const deck = render(`---\ncode: copy\n---\n\n# A\n\n${FENCE}\n---\n\n# B\n\n\`@code{copy=off}\`\n${FENCE}`);
    assert.equal((deck.match(/<pre[^>]*data-copy/g) || []).length, 1);
  });

  test('the render draws no button: the marker is all any export carries', () => {
    assert.doesNotMatch(render(`# A\n\n\`@code{copy}\`\n${FENCE}`), /lat-code-copy|<button/);
  });
});

describe('codeCopy — the buttons', () => {
  function page(html) {
    const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { pretendToBeVisual: true });
    return dom.window;
  }

  test('install draws two labeled buttons on each marked block, once', async () => {
    const { codeCopy } = await load();
    const win = page(render(`# A\n\n\`@code{copy}\`\n${FENCE}\n\n${FENCE}`));
    const api = codeCopy(win);
    assert.equal(api.install(), 1);
    assert.equal(api.install(), 0, 'a second pass adds nothing');
    const labels = [...win.document.querySelectorAll('pre[data-copy] .lat-code-copy-btn')].map((b) => b.getAttribute('aria-label'));
    assert.deepEqual(labels, ['Copy code', 'Copy as HTML']);
    assert.equal(win.document.querySelectorAll('.lat-code-copy svg path, .lat-code-copy svg rect').length > 0, true, 'drawn icons, no typed glyph');
    assert.equal(win.document.querySelector('.lat-code-copy').textContent, '', 'no text in the bar');
  });

  test('"Copy code" writes the block\'s source exactly, line numbers and title excluded', async () => {
    const { codeCopy } = await load();
    const win = page(render(`# A\n\n\`@code{copy, numbers, title=a.ts}\`\n${FENCE}`));
    const api = codeCopy(win);
    api.install();
    const writes = [];
    const nav = { clipboard: { writeText: async (t) => writes.push(t) } };
    assert.equal(await api.copy(win.document.querySelector('[data-kind="text"]'), nav), true);
    assert.deepEqual(writes, ['const a = 1;\n// two']);
    assert.equal(win.document.querySelector('[data-kind="text"]').getAttribute('aria-label'), 'Copied');
  });

  test('a diff block copies as written: the author\'s markers stay, the alignment space does not', async () => {
    const { codeCopy } = await load();
    const win = page(render('# A\n\n`@code{copy, diff}`\n```ts\n+const a = 1;\n-const b = 2;\nconst c = 3;\n d();\n```\n'));
    const api = codeCopy(win);
    api.install();
    const writes = [];
    const nav = { clipboard: { writeText: async (t) => writes.push(t) } };
    await api.copy(win.document.querySelector('[data-kind="text"]'), nav);
    assert.deepEqual(writes, ['+const a = 1;\n-const b = 2;\nconst c = 3;\n d();']);
  });

  test('a blank last line survives in line mode as in plain mode', async () => {
    const { codeCopy } = await load();
    const body = '```ts\nx\n\n```\n';
    for (const rec of ['copy', 'copy, numbers']) {
      const win = page(render(`# A\n\n\`@code{${rec}}\`\n${body}`));
      const api = codeCopy(win);
      api.install();
      const writes = [];
      await api.copy(win.document.querySelector('[data-kind="text"]'), { clipboard: { writeText: async (t) => writes.push(t) } });
      assert.deepEqual(writes, ['x\n'], rec);
    }
  });

  test('"Copy as HTML" writes styled HTML built from the code\'s text, plus the plain text', async () => {
    const { codeCopy } = await load();
    const win = page(render(`# A\n\n\`@code{copy}\`\n\`\`\`html\n<img src=x onerror="alert(1)">\n\`\`\`\n`));
    win.ClipboardItem = class { constructor(items) { this.items = items; } };
    win.Blob = class { constructor(parts, o) { this.text = parts.join(''); this.type = o.type; } };
    const api = codeCopy(win);
    api.install();
    let item = null;
    const nav = { clipboard: { write: async ([i]) => { item = i; } } };
    assert.equal(await api.copy(win.document.querySelector('[data-kind="html"]'), nav), true);
    const html = item.items['text/html'].text;
    assert.match(html, /^<pre style="[^"]*">/);
    assert.match(html, /&lt;img src=x onerror="alert\(1\)"&gt;/, 'same-styled runs join, so the text reads whole');
    assert.doesNotMatch(html, /<img/, 'the code is text in the copy, never markup');
    assert.doesNotMatch(html, /class=|data-/, 'nothing of the deck but its visible code travels');
    assert.equal(item.items['text/plain'].text, '<img src=x onerror="alert(1)">');
  });

  test('"Copy as HTML" keeps a diff line\'s band and a marked line\'s tint (followups.d/2710-p3)', async () => {
    const { codeCopy } = await load();
    // jsdom resolves no `color-mix()`, so the bands are given here as Chromium computes them: the
    // `color(srgb …)` form a pasted document cannot read, which the copy writes as rgba().
    const bands = '<style>.ln[data-diff="ins"]{background-color:color(srgb 0.2 0.6 0.4 / 0.14)}'
      + '.ln[data-diff="del"]{background-color:rgba(200, 40, 40, 0.14)}.ln.lat-mark{background-color:rgb(1, 2, 3)}</style>';
    const win = page(bands + render(`# A\n\n\`@code{copy, diff, mark=3}\`\n\`\`\`ts\n+const a = 1;\n-const b = 2;\n keep();\n\`\`\`\n`));
    win.ClipboardItem = class { constructor(items) { this.items = items; } };
    win.Blob = class { constructor(parts, o) { this.text = parts.join(''); this.type = o.type; } };
    const api = codeCopy(win);
    api.install();
    let item = null;
    await api.copy(win.document.querySelector('[data-kind="html"]'), { clipboard: { write: async ([i]) => { item = i; } } });
    const out = new JSDOM(item.items['text/html'].text).window.document;
    const rows = [...out.querySelectorAll('pre > span')].filter((s) => /min-width: 100%/.test(s.getAttribute('style')));
    assert.deepEqual(rows.map((r) => [r.textContent, r.style.backgroundColor]), [
      ['+const a = 1;', 'rgba(51, 153, 102, 0.14)'],
      ['-const b = 2;', 'rgba(200, 40, 40, 0.14)'],
      [' keep();', 'rgb(1, 2, 3)'],
    ]);
    assert.equal(out.querySelector('pre').textContent, '+const a = 1;\n-const b = 2;\n keep();', 'the text is unchanged');
    assert.equal([...rows[0].querySelectorAll('span')].some((s) => s.style.backgroundColor), false, 'the band is the row\'s, not repeated per run');
  });

  test('a page the clipboard API refuses copies by selection instead', async () => {
    const { codeCopy } = await load();
    const win = page(render(`# A\n\n\`@code{copy}\`\n${FENCE}`));
    let copied = null;
    win.document.execCommand = (cmd) => { copied = cmd === 'copy' ? win.getSelection().toString() : null; return true; };
    const api = codeCopy(win);
    api.install();
    const nav = { clipboard: { writeText: async () => { throw new Error('NotAllowedError'); } } };
    assert.equal(await api.copy(win.document.querySelector('[data-kind="text"]'), nav), true);
    assert.equal(copied, 'const a = 1;\n// two');
    assert.equal(win.document.querySelectorAll('body > div').length, 0, 'the scratch node is removed');
  });
});

describe('the HTML player ships the copy script only for a deck that asks', () => {
  test('playerJs inlines it behind the flag, and skips it while a video records', async () => {
    const { playerJs } = await import('../../../lib/export/player-core.mjs');
    const without = await playerJs();
    const withCopy = await playerJs('', null, false, undefined, null, null, false, true);
    assert.doesNotMatch(without, /codeCopy/);
    assert.match(withCopy, /var codeCopy=function codeCopy\(win\)/);
    assert.match(withCopy, /__lpRender/);
  });
});
