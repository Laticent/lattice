/**
 * The FENCE half of the code door, the parts that need no browser (plugin-system §9 decisions 3
 * and 10): finding a plugin's fences in the engine's HTML (lib/packages/code-door-fence.mjs), what
 * a renderer is handed, the capture and substitute hooks through the REAL engine, the gate for a
 * plugin's one script (code-shape.mjs `refusePluginCode`), and consent under `plugin/<name>`.
 * The door run through the real sandbox is test/integration/export/plugin-fence-door.test.js.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fenceBlocks, claimedFences, fenceInput, fenceKey, fenceMarkup, inlineSpans, inlineInput, inlineMarkup, inlinePlaceholder, MAX_INLINE_CHARS, fenceId, fenceNamespace, pluginNameConflicts, replaceFences, withFenceNote, captureFences, substituteFences, decodeFenceBody, MAX_FENCE_CHARS, MAX_FENCES_PER_PASS } = require('../../../lib/packages/code-door-fence.mjs');
const { rebuiltAlternatives, rebuiltBy, GENERIC } = require('../../../lib/transformers/rebuilt-classes.js');
const { refusePluginCode, workerScript, PLUGIN_DATA_CONTRIBUTIONS, pluginConsentText, FENCE_NAME_RE } = require('../../../lib/packages/code-shape.mjs');
const { ENGINE_CLAIMS, untrustedCodePackages } = require('../../../lib/packages/code-door.js');
const { codeDigest, pluginDigest, isTrusted, grantTrust } = require('../../../lib/packages/trust.js');
const crypto = require('node:crypto');
const engine = require('../../../lib/engine');

const pre = (lang, text) => `<pre><code class="language-${lang}">${text}</code></pre>`;
const names = (...n) => new Set(n);

describe('finding a fence in the engine’s HTML', () => {
  test('a plain block of a name the door runs is a fence, with its text as the author wrote it', () => {
    const html = `<section>${pre('gantt', 'a &lt; b &amp;amp; c &quot;d&quot;\n')}</section>`;
    const [b] = fenceBlocks(html, names('gantt'));
    assert.equal(b.name, 'gantt');
    assert.equal(b.body, 'a < b &amp; c "d"\n', 'markdown-it escapes four characters, and those four come back');
    assert.equal(html.slice(b.start, b.end), pre('gantt', 'a &lt; b &amp;amp; c &quot;d&quot;\n'));
  });

  test('another language, a highlighted block, a block with a tag inside, and a bare <pre> are left alone', () => {
    const html = [
      pre('js', 'x'),
      '<pre><code class="language-gantt"><span class="hljs-k">a</span></code></pre>',
      '<pre class="x"><code class="hljs">no language</code></pre>',
      '<pre>just text</pre>',
      '<pre> <code class="language-gantt">a gap between them</code></pre>',
    ].join('\n');
    assert.deepEqual(fenceBlocks(html, names('gantt')), []);
  });

  test('a fence quoted inside a comment or a <style> is not a fence', () => {
    const html = `<!-- ${pre('gantt', 'in a comment')} --><style>${pre('gantt', 'in css')}</style>${pre('gantt', 'real')}`;
    assert.deepEqual(fenceBlocks(html, names('gantt')).map((b) => b.body), ['real']);
  });

  test('a fence of a plugin the deck did not load (data-lattice-off) stays the code block it is', () => {
    const html = `<pre data-lattice-off="gantt-plugin"><code class="language-gantt">x</code></pre>${pre('gantt', 'y')}`;
    assert.deepEqual(fenceBlocks(html, names('gantt')).map((b) => b.body), ['y']);
  });

  test('every fence of every name, in document order', () => {
    const html = pre('gantt', '1') + pre('map', '2') + pre('gantt', '3');
    assert.deepEqual(fenceBlocks(html, names('gantt', 'map')).map((b) => `${b.name}:${b.body}`), ['gantt:1', 'map:2', 'gantt:3']);
    assert.deepEqual(fenceBlocks(html, names()), [], 'no names, no fences');
  });

  test('a class list that holds the language among others still finds it', () => {
    assert.equal(fenceBlocks('<pre><code class="hljs language-gantt">x</code></pre>', names('gantt')).length, 1);
  });

  test('it is linear: many fences and a long run of unclosed <pre><code are both fast', () => {
    const many = pre('gantt', 'row\n').repeat(20000);
    let t = Date.now();
    assert.equal(fenceBlocks(many, names('gantt')).length, 20000);
    assert.ok(Date.now() - t < 2000, `20,000 fences took ${Date.now() - t} ms`);
    const hostile = '<pre><code class="language-gantt">'.repeat(20000);
    t = Date.now();
    assert.deepEqual(fenceBlocks(hostile, names('gantt')), []);
    assert.ok(Date.now() - t < 2000, `20,000 unclosed openers took ${Date.now() - t} ms`);
  });

  test('decodeFenceBody reads `&amp;lt;` as the author’s `&lt;`', () => {
    assert.equal(decodeFenceBody('&amp;lt;'), '&lt;');
  });
});

describe('what a renderer is handed', () => {
  const claim = { pkg: 'gantt-plugin', fence: 'gantt', id: 'lp-gantt-plugin-0123abcd-0', body: 'a\nb', slide: 0, block: '<pre>…</pre>', start: 1, end: 2, i: 0 };

  test('the fence’s text and one id, and nothing else', () => {
    assert.deepEqual(fenceInput(claim), { body: 'a\nb', id: 'lp-gantt-plugin-0123abcd-0' });
  });

  test('an id starts with the plugin’s `lp-` namespace, names the fence’s TEXT and not its place, and counts repeats', () => {
    const seen = new Map();
    const a = fenceId('gantt-plugin', '', 'rows', seen);
    const b = fenceId('gantt-plugin', '', 'rows', seen);
    const c = fenceId('gantt-plugin', '', 'other', seen);
    assert.match(a, /^lp-gantt-plugin-[0-9a-f]{8}-0$/);
    assert.equal(fenceNamespace('gantt-plugin'), 'lp-gantt-plugin');
    assert.equal(b, a.replace(/-0$/, '-1'), 'the same text again is the next one');
    assert.notEqual(c.slice(0, -2), a.slice(0, -2), 'other text, other name');
    assert.equal(fenceId('gantt-plugin', '', 'rows', new Map()), a, 'a fresh render gives the same id, wherever the fence sits');
  });

  test('an id holds only id-safe characters whatever the render prefix is', () => {
    assert.match(fenceId('gantt-plugin', 'lat r1"<>', 'x', new Map()), /^lp-gantt-plugin-[A-Za-z0-9_-]+$/);
  });

  test('a fence’s key changes with the plugin, its code’s digest, its id and its text', () => {
    const k = fenceKey(claim, 'sha');
    assert.notEqual(k, fenceKey({ ...claim, pkg: 'other' }, 'sha'));
    assert.notEqual(k, fenceKey(claim, 'sha2'));
    assert.notEqual(k, fenceKey({ ...claim, id: 'x' }, 'sha'));
    assert.notEqual(k, fenceKey({ ...claim, body: 'c' }, 'sha'));
  });

  test('the root element is the door’s, naming the plugin, and the name is escaped', () => {
    assert.equal(fenceMarkup('gantt-plugin', '<b>x</b>'), '<div data-lattice-plugin="gantt-plugin"><b>x</b></div>');
    assert.doesNotMatch(fenceMarkup('a"><script>', ''), /<script/i);
  });

  test('a failure keeps the code block and says why, on one escaped line', () => {
    const out = withFenceNote(pre('gantt', 'x'), 'gantt-plugin', 'it threw <b>\nboom');
    assert.ok(out.startsWith(pre('gantt', 'x')), 'the author’s block is still there');
    assert.match(out, /<p data-package-error="gantt-plugin" role="note">The plugin “gantt-plugin” did not draw this block: it threw &lt;b&gt;\?boom<\/p>$/);
  });
});

describe('the inline door: `@kind{…}` spans (2026-10-14-plugin-inline-door.md §4.4)', () => {
  const md = '---\ntheme: indaco\n---\n\n## One\n\n- Build `@gantt-bar{Design, 2}` then `@gantt-bar{Ship, 3}`\n- Escaped `\\@gantt-bar{x}`, prose `@gantt-bar{a} b`, a mention `@ada`\n\n```gantt\nA 1\n```\n\n```md\n`@gantt-bar{in a fence}`\n```\n\n---\n\n<!-- _class: tally -->\n\n## Claimed\n\n- `@gantt-bar{C}`\n';
  const fences = new Map([['gantt', 'gantt-plugin']]);
  const kinds = new Map([['gantt-bar', 'gantt-plugin']]);
  const slides = { names: ['tally'], engineClaims: ENGINE_CLAIMS };
  const render = (src, door) => engine.createEngine().render(src, 'indaco', { codeFences: door }).html;

  test('the scanner takes a plain code span outside <pre>, decoded, and only a whole `@kind{…}`', () => {
    const html = '<p><code>@k{a &amp; b}</code> <code data-lat-escaped>@k{x}</code> <code>@k{a} b</code> <code>@other{x}</code></p><pre><code>@k{in pre}</code></pre><p><code data-lattice-off="p">@k{off}</code><code><b>@k{x}</b></code></p>';
    assert.deepEqual(inlineSpans(html, ['k']).map((x) => [x.kind, x.text]), [['k', '@k{a & b}']]);
    assert.deepEqual(inlineSpans(html, []), []);
  });

  test('capture claims spans and fences in document order, on one budget, and leaves a claimed slide alone', () => {
    const cap = captureFences(fences, { ...slides, kinds });
    render(md, cap);
    assert.deepEqual(cap.claims.map((c) => [c.pkg, c.inline ?? `fence:${c.fence}`, c.slide, c.body]), [
      ['gantt-plugin', 'gantt-bar', 0, '@gantt-bar{Design, 2}'],
      ['gantt-plugin', 'gantt-bar', 0, '@gantt-bar{Ship, 3}'],
      ['gantt-plugin', 'fence:gantt', 0, 'A 1\n'],
    ]);
    assert.equal(new Set(cap.claims.map((c) => c.id)).size, 3);
  });

  test('substitute puts each result in its span, and a span with no result keeps its code', () => {
    const cap = captureFences(fences, { ...slides, kinds });
    render(md, cap);
    const digestOf = new Map([['gantt-plugin', 'sha']]);
    const results = new Map(cap.claims.filter((c) => c.inline).slice(0, 1).map((c) => [fenceKey(c, 'sha'), inlineMarkup(c.pkg, c.inline, '<b>bar</b>')]));
    const out = render(md, substituteFences(fences, results, digestOf, { ...slides, kinds }));
    assert.match(out, /Build <span data-lattice-plugin="gantt-plugin" data-kind="gantt-bar"><b>bar<\/b><\/span> then <code>@gantt-bar\{Ship, 3\}<\/code>/);
    assert.doesNotMatch(out, /data-package-error="gantt-plugin" role="note">[^<]*span/, 'a span with no result carries no block note');
  });

  test('an escaped span of a door kind is finished as the literal, backslash off, and is never run', () => {
    const cap = captureFences(fences, { ...slides, kinds });
    render(md, cap);
    assert.equal(cap.claims.some((c) => c.escaped), false, 'the doors never see an escape');
    assert.equal(cap.escapes, 1);
    const out = render(md, substituteFences(fences, new Map(), new Map([['gantt-plugin', 'sha']]), { ...slides, kinds }));
    assert.match(out, /Escaped <code data-lat-escaped="">@gantt-bar\{x\}<\/code>/);
    // A deck whose only span is an escape still gets the second render's finish.
    const only = '---\ntheme: indaco\n---\n\n## E\n\n- `\\@gantt-bar{x}`\n';
    const c2 = captureFences(fences, { ...slides, kinds });
    render(only, c2);
    assert.deepEqual([c2.claims.length, c2.escapes], [0, 1]);
  });

  test('a span is a call only when its record closes the span: prose about a kind is not one', () => {
    assert.deepEqual(inlineSpans('<p><code>@k{a} and {b}</code> <code>@k{"a}"}</code> <code>@k{a{b}c}</code></p>', ['k']).map((x) => x.text), ['@k{"a}"}', '@k{a{b}c}']);
  });

  test('a span and a fence never share a memo key; the input says which kind it is', () => {
    const c = { pkg: 'p', id: 'i', body: 'x' };
    assert.notEqual(fenceKey({ ...c, inline: 'k' }, 's'), fenceKey(c, 's'));
    assert.notEqual(fenceKey({ ...c, inline: 'k' }, 's'), fenceKey({ ...c, inline: 'j' }, 's'));
    assert.deepEqual(inlineInput({ inline: 'k', body: '@k{x}', id: 'i' }, { who: 'x' }), { type: 'inline', kind: 'k', text: '@k{x}', record: '{x}', fields: { who: 'x' }, id: 'i' });
    assert.deepEqual(inlineInput({ inline: 'k', body: '@k{x}', id: 'i' }), { type: 'inline', kind: 'k', text: '@k{x}', record: '{x}', fields: null, id: 'i' });
  });

  test('a span past the cap is reported, not claimed', () => {
    const long = `---\ntheme: indaco\n---\n\n## L\n\n- \`@gantt-bar{${'x'.repeat(MAX_INLINE_CHARS)}}\`\n`;
    const cap = captureFences(fences, { ...slides, kinds });
    render(long, cap);
    assert.equal(cap.claims.length, 0);
    assert.deepEqual(cap.tooLong, [{ pkg: 'gantt-plugin', slide: 0, inline: 'gantt-bar' }]);
  });

  test('the root and the placeholder are spans: a word stays in its line, and the placeholder carries no author text', () => {
    assert.equal(inlineMarkup('p', 'k', '<b>x</b>'), '<span data-lattice-plugin="p" data-kind="k"><b>x</b></span>');
    assert.doesNotMatch(inlineMarkup('a"><script>', 'k', ''), /<script/i);
    const ph = inlinePlaceholder('gantt-plugin', 'gantt-bar', { size: 'lg' });
    assert.match(ph, /^<span data-lattice-plugin-off="gantt-plugin" data-placement="chip" data-inline data-size="lg" role="note"/);
    assert.match(inlinePlaceholder('p', 'k', { size: 'huge' }), /data-size="sm"/);
    assert.doesNotMatch(ph, /<div/);
  });
});

describe('through the real engine: capture, then substitute', () => {
  const md = '---\ntheme: indaco\n---\n\n## One\n\n```gantt\nA 1\n```\n\n---\n\n## Two\n\n```js\nconst x = 1;\n```\n\n```gantt\nB <2>\n```\n\n---\n\n<!-- _class: tally -->\n\n## Claimed\n\n```gantt\nC 3\n```\n';
  const fences = new Map([['gantt', 'gantt-plugin']]);
  const slides = { names: ['tally'], engineClaims: ENGINE_CLAIMS };
  const render = (src, door) => engine.createEngine().render(src, 'indaco', { codeFences: door }).html;

  test('a render with no door is byte-identical to one with a capture door', () => {
    assert.equal(render(md, captureFences(fences, slides)), engine.createEngine().render(md, 'indaco').html);
  });

  test('capture finds each fence with its slide and id; the claimed slide’s fence is the package’s', () => {
    const cap = captureFences(fences, slides);
    render(md, cap);
    assert.deepEqual(cap.claims.map((c) => [c.pkg, c.fence, c.slide, c.body]), [
      ['gantt-plugin', 'gantt', 0, 'A 1\n'],
      ['gantt-plugin', 'gantt', 1, 'B <2>\n'],
    ]);
    assert.equal(new Set(cap.claims.map((c) => c.id)).size, 2);
  });

  test('inserting a slide before a fence does not change its id, so its remembered result still holds', () => {
    const idsOf = (src) => {
      const cap = captureFences(fences, slides);
      render(src, cap);
      return cap.claims.map((c) => c.id);
    };
    const before = idsOf(md);
    const after = idsOf(md.replace('## One', '## Zero\n\n---\n\n## One'));
    assert.deepEqual(after, before);
  });

  test('substitute puts each result at its fence and leaves every other block alone', () => {
    const cap = captureFences(fences, slides);
    render(md, cap);
    const results = new Map(cap.claims.map((c) => [fenceKey(c, 'SHA'), fenceMarkup(c.pkg, `<p>drawn ${c.id}</p>`)]));
    const html = render(md, substituteFences(fences, results, new Map([['gantt-plugin', 'SHA']]), slides));
    for (const c of cap.claims) assert.match(html, new RegExp(`<div data-lattice-plugin="gantt-plugin"><p>drawn ${c.id}</p></div>`));
    assert.match(html, /language-js/, 'a js fence is still code');
    assert.equal((html.match(/language-gantt/g) || []).length, 1, 'only the claimed slide’s fence is left, untouched');
  });

  test('a fence the first render never saw keeps its block with a note, never a stranger’s output', () => {
    const html = render(md, substituteFences(fences, new Map(), new Map([['gantt-plugin', 'SHA']]), slides));
    assert.match(html, /language-gantt[\s\S]*?data-package-error="gantt-plugin"[\s\S]*?changed between the two renders/);
  });

  test('the door leaves a fence’s text plain, so a grammar that knows the name cannot decide whether the plugin draws it', () => {
    // `tex` is a highlight.js language: with a grammar, a body with TeX in it came back as <span>s and was skipped.
    const src = '---\ntheme: indaco\n---\n\n## T\n\n```tex\n\\frac{a}{b} % c\n```\n\n```tex\nplain\n```\n';
    const none = captureFences(new Map(), slides);
    assert.match(render(src, none), /hljs-/, 'without the door, the grammar colors the first block');
    const cap = captureFences(new Map([['tex', 'tex-plugin']]), slides);
    render(src, cap);
    assert.equal(cap.claims.length, 2, 'with it, both blocks are the plugin’s');
  });

  test('a fence on a slide a shipped pass rebuilds from its text is NOT claimed: it stays code, and the door says why', () => {
    // `video` turns a bullet into a poster and a link, in the engine's pass AND in the runtime's DOM pass over
    // the finished page; the door's last slot cannot stop the second, so the door does not draw there.
    for (const [classes, pass] of [['video', 'video'], ['contact', 'contact'], ['wifi', 'wifi'], ['closing qr', 'qr-general'], ['team-profile', 'team-profile']]) {
      const src = `---\ntheme: indaco\n---\n\n<!-- _class: ${classes} -->\n\n## Slide\n\n- https://www.youtube.com/watch?v=dQw4w9WgXcQ\n\n\`\`\`gantt\nx\n\`\`\`\n`;
      const cap = captureFences(fences, { ...slides, rebuilt: rebuiltBy });
      const html = render(src, cap);
      assert.equal(cap.claims.length, 0, `${classes}: no claim`);
      assert.deepEqual(cap.shadowed.map((x) => [x.slide, x.pass]), [[0, pass]], `${classes}: named the pass`);
      assert.match(html, /language-gantt/, `${classes}: the block is still code`);
    }
  });

  test('ANY raw <section> nested in a slide denies it: every way of writing class=video, and ones that are not video, fail closed', () => {
    const tags = ['<section class="video">', "<section class='video'>", '<SECTION CLASS=video>', '<section class=video>', '<section class=video id=x>', '<section title="a>b" class="video">', '<section data-class="x" class="video">', '<section class="&#118;ideo">', '<section\nclass = "video"\n>', '<section>'];
    for (const tag of tags) {
      const src = `---\ntheme: indaco\n---\n\n## A\n\n${tag}\n\n\`\`\`gantt\nSECRET\n\`\`\`\n\n</section>\n`;
      const cap = captureFences(fences, { ...slides, rebuilt: rebuiltBy });
      const html = render(src, cap);
      assert.equal(cap.claims.length, 0, `${JSON.stringify(tag)}: no claim`);
      assert.equal(cap.shadowed.length, 1, `${JSON.stringify(tag)}: and the door says why`);
      assert.match(html, /language-gantt/, `${JSON.stringify(tag)}: the block is still code`);
    }
  });

  test('selector parsing: commas inside (…) and […] and attribute dots do not split or add classes', () => {
    // The registry holds none of these shapes today; the parser must still read them right the day one is registered.
    const { parseAlternatives } = require('../../../lib/transformers/rebuilt-classes');
    assert.deepEqual(parseAlternatives('section.video:not(.a, .b)'), [['video']]);
    assert.deepEqual(parseAlternatives('section.video[data-x="a.b"]'), [['video']]);
    assert.deepEqual(parseAlternatives('[data-x="a,b"], section.wifi'), [['wifi']]);
  });

  test('an ordinary slide, a layout class and a modifier that no pass rebuilds still get their fences drawn', () => {
    for (const classes of ['content', 'closing', 'split-panel', 'dark', 'content dark']) {
      const src = `---\ntheme: indaco\n---\n\n<!-- _class: ${classes} -->\n\n## Slide\n\n\`\`\`gantt\nx\n\`\`\`\n`;
      const cap = captureFences(fences, { ...slides, rebuilt: rebuiltBy });
      render(src, cap);
      assert.equal(cap.claims.length, 1, `${classes}: claimed`);
      assert.equal(cap.shadowed.length, 0, classes);
    }
  });

  test('the rebuilt-slide list is read off the registry: a pass added tomorrow denies its slides today', () => {
    const alt = rebuiltAlternatives();
    for (const c of ['video', 'contact', 'wifi', 'team-profile', 'bar', 'logo-wall', 'scene']) assert.ok(alt.some((a) => a.classes.includes(c)), `${c} is denied`);
    assert.ok(alt.some((a) => a.pass === 'qr-general' && a.classes.join('.') === 'closing.qr'), 'a compound selector denies only the compound');
    assert.equal(rebuiltBy(['closing']), null);
    assert.equal(rebuiltBy(['closing', 'qr']), 'qr-general');
    for (const g of GENERIC) assert.equal(rebuiltBy(g.split(' ')), null, `generic ${g} denies nothing`);
    // Every registry transformer that names a class is in the list, unless it is one of the generic ones.
    const { TRANSFORMERS } = require('../../../lib/transformers/registry.js');
    for (const t of TRANSFORMERS) {
      const named = String(t.selector || '').split(',').some((s) => /\.[A-Za-z]/.test(s.trim().split(/\s/)[0].replace(/:not\([^)]*\)/g, '')));
      if (!named) continue;
      assert.ok(alt.some((a) => a.pass === t.name) || ['masthead-lift', 'image-adaptive', 'image-scrim', 'split-panels'].includes(t.name), `${t.name} names a slide class and is neither denied nor generic`);
    }
  });

  test('two panes of one slide, each with a fence, get two ids; the same text twice gets two', () => {
    const src = '---\ntheme: indaco\n---\n\n## Host\n\n<!-- panes: 50/50 -->\n<!-- pane: bullets -->\n\n```gantt\nsame\n```\n\n<!-- pane: bullets -->\n\n```gantt\nsame\n```\n';
    const cap = captureFences(fences, slides);
    render(src, cap);
    assert.equal(cap.claims.length, 2);
    assert.equal(new Set(cap.claims.map((c) => c.id)).size, 2, `ids: ${cap.claims.map((c) => c.id)}`);
    assert.deepEqual([...new Set(cap.claims.map((c) => c.slide))], [0], 'a pane’s fence is at its host slide’s position');
    // The second render agrees with the first: every fence finds its result, none a "changed" note.
    const results = new Map(cap.claims.map((c) => [fenceKey(c, 'SHA'), fenceMarkup(c.pkg, `<p>${c.id}</p>`)]));
    const html = render(src, substituteFences(fences, results, new Map([['gantt-plugin', 'SHA']]), slides));
    assert.doesNotMatch(html, /changed between the two renders/);
    for (const c of cap.claims) assert.ok(html.includes(`<p>${c.id}</p>`));
  });

  test('a fence too long to hand over is named and stays a code block', () => {
    const big = `---\ntheme: indaco\n---\n\n## Big\n\n\`\`\`gantt\n${'x'.repeat(MAX_FENCE_CHARS + 1)}\n\`\`\`\n`;
    const cap = captureFences(fences, slides);
    render(big, cap);
    assert.equal(cap.claims.length, 0);
    assert.deepEqual(cap.tooLong, [{ pkg: 'gantt-plugin', slide: 0 }]);
  });

  test('a fence whose text would end its own block in HTML round-trips exactly', () => {
    const nasty = '</code></pre><script>alert(1)</script>&amp;&lt;';
    const src = `---\ntheme: indaco\n---\n\n## Nasty\n\n\`\`\`\`gantt\n${nasty}\n\`\`\`\`\n`;
    const cap = captureFences(fences, slides);
    render(src, cap);
    assert.equal(cap.claims.length, 1);
    assert.equal(cap.claims[0].body, `${nasty}\n`);
  });

  test('replaceFences applies several fences of one section in order', () => {
    const html = `<section>${pre('gantt', '1')}<p>x</p>${pre('gantt', '2')}</section>`;
    const { claims } = claimedFences(html, { fences, slideIndex: (n) => n });
    assert.equal(replaceFences(html, claims, ['<A>', '<BB>']), '<section><A><p>x</p><BB></section>');
  });
});

describe('a deck that asks for too much', () => {
  const fences = new Map([['gantt', 'gantt-plugin']]);
  const many = (n) => `<section>${pre('gantt', 'row\n').repeat(n)}</section>`;

  test('one pass claims at most MAX_FENCES_PER_PASS, counts the rest, and the same ones in both renders', () => {
    const r = claimedFences(many(MAX_FENCES_PER_PASS + 50), { fences, slideIndex: (n) => n });
    assert.equal(r.claims.length, MAX_FENCES_PER_PASS);
    assert.equal(r.tooMany, 50);
    assert.equal(new Set(r.claims.map((c) => c.id)).size, MAX_FENCES_PER_PASS, 'every claim has its own id');
  });

  test('the allowance is spent down across every call of ONE render: a deck of pane slides cannot claim thousands', () => {
    const calls = Array.from({ length: 8 }, (_, k) => many(150).replace('<section>', `<section data-call="${k}">`));
    const cap = captureFences(fences, { names: [], engineClaims: [] });
    for (const html of calls) cap.run(html, { slideIndex: (n) => n, idPrefix: '' });
    assert.equal(cap.claims.length, MAX_FENCES_PER_PASS, '8 calls of 150 fences claim 400, not 1,200');
    assert.equal(cap.tooMany, 8 * 150 - MAX_FENCES_PER_PASS);
    // The second render makes the same calls and gets the same allowance, so the same fences.
    const results = new Map(cap.claims.map((c) => [fenceKey(c, 'SHA'), fenceMarkup(c.pkg, '<i/>')]));
    const sub = substituteFences(fences, results, new Map([['gantt-plugin', 'SHA']]), { names: [], engineClaims: [] });
    const drawn = calls.map((html) => sub.run(html, { slideIndex: (n) => n, idPrefix: '' }).split('data-lattice-plugin').length - 1);
    assert.equal(drawn.reduce((a, b) => a + b, 0), MAX_FENCES_PER_PASS);
    assert.deepEqual(drawn, [150, 150, 100, 0, 0, 0, 0, 0]);
  });

  test('claiming and splicing thousands of fences in one slide is linear, not quadratic', () => {
    const html = many(20000);
    const t0 = Date.now();
    const found = fenceBlocks(html, new Set(['gantt']));
    const claims = found.map((b) => ({ i: 0, start: b.start, end: b.end }));
    const out = replaceFences(`<section>${html.slice(9, -10)}</section>`, claims.map((c) => ({ ...c, i: 0 })), claims.map(() => '<x/>'));
    assert.ok(out.length < html.length);
    assert.ok(Date.now() - t0 < 3000, `20,000 fences found and spliced in ${Date.now() - t0} ms (it was 50 s)`);
  });

  test('a key is small however large the plugin’s code is: it holds the digest, not the code', () => {
    const claim = { pkg: 'p', id: 'p-1', body: 'x' };
    assert.ok(fenceKey(claim, crypto.createHash('sha256').update('x'.repeat(1_000_000)).digest('hex')).length < 200);
  });
});

describe('the gate for a plugin’s one script', () => {
  const code = 'function render(f){return "<p>"+f.body+"</p>"}\nexport { render as default };';
  const plugin = (over = {}, manifest = {}) => ({
    type: 'plugin',
    name: 'gantt-plugin',
    manifest: { name: 'gantt-plugin', type: 'plugin', contributes: { fences: { gantt: { body: 'text' } }, styles: true }, ...manifest },
    roles: { 'render.js': 'gantt-plugin.render.js' },
    files: { 'gantt-plugin.render.js': code },
    ...over,
  });

  test('accepts one fence, its CSS and its render.js in the export form', () => {
    assert.equal(refusePluginCode(plugin()), null);
  });

  test('refuses anything that is not a plugin, by name', () => {
    assert.match(refusePluginCode({ ...plugin(), type: 'component' }), /component package, not a plugin/);
  });

  test('refuses the contribution points that run code outside the sandbox, naming each', () => {
    const why = refusePluginCode(plugin({}, { contributes: { fences: { gantt: {} }, syntax: {}, hydrate: {}, bake: {} } }));
    assert.match(why, /syntax, hydrate, bake/);
    assert.deepEqual([...PLUGIN_DATA_CONTRIBUTIONS], ['fences', 'inline', 'styles', 'diagnostics']);
  });

  test('refuses `embedded`: a plugin that arrives as data never loads on every render with no off switch', () => {
    assert.match(refusePluginCode(plugin({}, { embedded: true })), /declares `embedded`, which only a plugin in this repository may hold/);
    assert.match(refusePluginCode(plugin({}, { embedded: false })), /declares `embedded`/, 'even false: the key is the repository\'s alone');
  });

  test('refuses render.exec (hydrate "pass", a bake), payload and vendor by rule, not by prose', () => {
    assert.match(refusePluginCode(plugin({}, { render: { parity: 'equivalent', degradesTo: 'source', exec: { hydrate: 'pass' } } })), /render\.exec/);
    assert.match(refusePluginCode(plugin({}, { render: { parity: 'equivalent', degradesTo: 'source', exec: { bake: 'subprocess' } } })), /render\.exec/);
    assert.match(refusePluginCode(plugin({}, { payload: { vendored: 'x' } })), /declares payload/);
    assert.match(refusePluginCode(plugin({}, { vendor: [] })), /declares vendor/);
    assert.equal(refusePluginCode(plugin({}, { render: { parity: 'equivalent', degradesTo: 'source' } })), null, 'a render block with no exec is fine');
    assert.equal(refusePluginCode(plugin({}, { render: { parity: 'equivalent', degradesTo: 'source', exec: {} } })), null, 'an empty exec runs nothing');
  });

  test('refuses a renderer holding a lone surrogate: two files could share a consent digest in a browser', () => {
    const bad = `// \ud800\n${code}`;
    assert.match(refusePluginCode(plugin({ files: { 'gantt-plugin.render.js': bad } })), /lone UTF-16 surrogate/);
    assert.equal(refusePluginCode(plugin({ files: { 'gantt-plugin.render.js': `// \ud83d\ude00\n${code}` } })), null, 'a paired surrogate (an emoji) is fine');
  });

  test('refuses a fence name the schema does not allow, NUL and markup included', () => {
    for (const bad of ['a\u0000x', 'Gantt <b>', 'Gantt', '1gantt', 'a b', '']) {
      assert.match(refusePluginCode(plugin({}, { contributes: { fences: { [bad]: {} } } })) ?? '', /fence name|declares/, JSON.stringify(bad));
    }
    assert.ok(FENCE_NAME_RE.test('gantt') && FENCE_NAME_RE.test('org-chart2') && !FENCE_NAME_RE.test('a\u0000x'));
  });

  test('two plugin names where one is a hyphen-prefix of the other overlap in id and class space', () => {
    assert.deepEqual(pluginNameConflicts(['a', 'a-b', 'c']), [['a', 'a-b']]);
    assert.deepEqual(pluginNameConflicts(['ab', 'a']), [], 'a plain prefix is not an overlap: only `a-…` is');
  });

  test('refuses nothing to draw and two fences: the renderer has no way to be told which fence it was handed', () => {
    assert.match(refusePluginCode(plugin({}, { contributes: { styles: true } })), /no fence and no inline kind/);
    assert.match(refusePluginCode(plugin({}, { contributes: { fences: { a: {}, b: {} } } })), /declares 2 fences/);
  });

  test('takes inline kinds (the inline door), with a fence or alone, and refuses a sigil, a bad name or a bad slot', () => {
    assert.equal(refusePluginCode(plugin({}, { contributes: { fences: { gantt: {} }, inline: { 'gantt-bar': {} } } })), null);
    assert.equal(refusePluginCode(plugin({}, { contributes: { inline: { mention: { slot: { label: 'a mention', positional: [{ name: 'who', type: 'text' }] }, placeholder: { size: 'sm' }, title: 'Mention' } } } })), null);
    assert.match(refusePluginCode(plugin({}, { contributes: { inline: { mention: { sigil: '%' } } } })), /declares a sigil.*`@mention\{…\}`/);
    assert.match(refusePluginCode(plugin({}, { contributes: { inline: { Mention: {} } } })), /inline kind "Mention" is not lower-case/);
    assert.match(refusePluginCode(plugin({}, { contributes: { inline: { mention: { slot: [] } } } })), /slot is not an object/);
    assert.match(refusePluginCode(plugin({}, { contributes: { inline: { mention: { exec: 'x' } } } })), /declares exec, which an inline kind does not take/);
    assert.match(refusePluginCode(plugin({}, { contributes: { inline: ['mention'] } })), /contributes\.inline is not an object/);
    const many = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`k${i}`, {}]));
    assert.match(refusePluginCode(plugin({}, { contributes: { inline: many } })), /17 inline kinds.*16 at most/);
  });

  test('a slot is bounded before anything compiles it (the red team: a hostile slot hung the host)', () => {
    const big = { positional: [{ name: 'v', type: 'text' }], params: { w: { type: 'oneOf', values: Array.from({ length: 2000 }, (_, i) => `a${i}`) } } };
    assert.match(refusePluginCode(plugin({}, { contributes: { inline: { slow: { slot: big } } } })), /slot holds [\d,]+ names and values, past the 1,000/);
    const sigils = { positional: [{ name: 'v', type: 'text' }], params: {}, sigils: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String.fromCharCode(97 + i), 'v'])) };
    assert.match(refusePluginCode(plugin({}, { contributes: { inline: { s: { slot: sigils } } } })), /9 sigils, past the 8/);
    let deep = { v: 1 };
    for (let i = 0; i < 10; i++) deep = { n: deep };
    assert.match(refusePluginCode(plugin({}, { contributes: { inline: { d: { slot: deep } } } })), /nests deeper than 6 levels/);
  });

  test('the consent text pins each kind\'s slot, in canonical JSON, so a slot swapped under an approval asks again', () => {
    const a = pluginConsentText('C', '', [{ name: 'k', slot: { b: 1, a: [1, 2] } }]);
    assert.equal(a, pluginConsentText('C', '', [{ name: 'k', slot: { a: [1, 2], b: 1 } }]), 'key order does not matter');
    assert.notEqual(a, pluginConsentText('C', '', [{ name: 'k', slot: { a: [1, 3], b: 1 } }]));
    assert.notEqual(a, pluginConsentText('C', '', ['k']));
  });

  test('the consent text pins the kinds only when there are some, so a fence-only approval keeps its digest', () => {
    assert.equal(pluginConsentText('C', 'gantt'), 'lattice-plugin-fence:5:gantt\u0000C');
    assert.equal(pluginConsentText('C', 'gantt', []), pluginConsentText('C', 'gantt'));
    assert.notEqual(pluginConsentText('C', 'gantt', ['bar']), pluginConsentText('C', 'gantt'));
    assert.equal(pluginConsentText('C', 'gantt', ['b', 'a']), pluginConsentText('C', 'gantt', ['a', 'b']), 'order does not matter');
    assert.notEqual(pluginConsentText('C', 'gantt', ['a,b']), pluginConsentText('C', 'gantt', ['a', 'b']), 'lengths keep the split unambiguous');
    assert.notEqual(pluginConsentText('C', '', ['bar']), pluginConsentText('C', 'bar'), 'a kind is not a fence');
  });

  test('refuses a script that is not <name>.render.js, a fences list that is an array, and a package with no files', () => {
    assert.match(refusePluginCode(plugin({ roles: { 'render.js': 'evil.js' }, files: { 'evil.js': code } })), /a plugin's one script is gantt-plugin\.render\.js/);
    assert.match(refusePluginCode(plugin({}, { contributes: { fences: ['gantt'] } })), /contributes\.fences is not an object of fences/);
    assert.match(refusePluginCode(plugin({}, { contributes: { fences: 'gantt', inline: { k: {} } } })), /contributes\.fences is not an object of fences/, 'a malformed fences value is refused even beside a kind (the checker)');
    assert.match(refusePluginCode({ type: 'plugin', name: 'x', manifest: {} }), /carries no files/);
  });

  test('refuses a missing render.js, a second script, an oversize one and one not in the export form', () => {
    assert.match(refusePluginCode(plugin({ roles: {} })), /no render\.js/);
    assert.match(refusePluginCode(plugin({ files: { 'gantt-plugin.render.js': code, 'extra.mjs': 'x' } })), /script other than gantt-plugin\.render\.js \(extra\.mjs\)/);
    assert.match(refusePluginCode(plugin({ files: { 'gantt-plugin.render.js': `${code}\n//${'x'.repeat(1_000_001)}` } })), /past the 1,000,000/);
    assert.match(refusePluginCode(plugin({ files: { 'gantt-plugin.render.js': 'export default function(){}' } })), /does not end in `export \{ name as default \}`/);
  });
});

describe('the worker for a fence renderer', () => {
  const code = 'function render(f){return f.body}\nexport { render as default };';

  test('slide mode is the same bytes it was before fences existed (a digest taken from the commit before)', () => {
    const slideCode = 'function t(s){return s.html}\nexport { t as default };';
    assert.equal(crypto.createHash('sha256').update(workerScript(slideCode)).digest('hex'), '1e607320d2fe78abf3dc49aaae6d3f603b45ebf2f04713c3625093e69b488eea');
    assert.equal(workerScript(slideCode), workerScript(slideCode, { fence: false }));
  });

  test('fence mode hands the renderer { body, id } frozen, and refuses anything else', () => {
    const script = workerScript(code, { fence: true });
    assert.notEqual(script, workerScript(code));
    assert.match(script, /a fence is a text body and an id/);
    assert.match(script, /__freeze\(\{type:"fence",body:f\.body,id:f\.id\}\)/);
    assert.doesNotMatch(script, /facts|baseUrl|idPrefix/, 'a fence renderer is never handed a slide');
  });

  test('the same handler takes an inline span as { type, kind, text, record, fields, id }, fields frozen all the way down', () => {
    const script = workerScript(code, { fence: true });
    assert.match(script, /an inline span is a kind, its text and an id/);
    assert.match(script, /__freeze\(\{type:"inline",kind:f\.kind,text:f\.text,record:typeof f\.record==="string"\?f\.record:"",fields:f\.fields&&typeof f\.fields==="object"\?deepFreeze\(f\.fields\):null,id:f\.id\}\)/);
  });
});

describe('the CLI door refuses a plugin whose fence is a code language', () => {
  test('a `python` plugin is not run and the door says why', () => {
    const { renderWithCodePackages } = require('../../../lib/packages/code-door.js');
    const warn = [];
    const e = engine.createEngine();
    const md = '---\ntheme: indaco\n---\n\n## P\n\n```python\nprint(1)\n```\n';
    const r = renderWithCodePackages((hook, more) => e.render(md, 'indaco', { codePackages: hook, ...more }), { packages: [], plugins: [{ name: 'py-plugin', fence: 'python', code: 'function render(){return "<p>x</p>"}\nexport { render as default };' }], warn: (l) => warn.push(l) });
    assert.ok(warn.some((l) => /plugin py-plugin is not run: `python` is a code language the engine highlights/.test(l)), warn.join('\n'));
    assert.match(r.rendered.html, /hljs/, 'the block is still highlighted');
  });
});

describe('consent under plugin/<name>', () => {
  const pkg = (fence = 'gantt', code = 'export { x as default };') => ({ roles: { 'render.js': 'r.js' }, manifest: { contributes: { fences: { [fence]: {} } } }, files: { 'r.js': code } });

  test('a plugin’s digest covers its render.js AND the fence it owns, and nothing the renderer cannot change', () => {
    assert.match(codeDigest(pkg()), /^[0-9a-f]{64}$/);
    assert.equal(codeDigest(pkg()), pluginDigest('export { x as default };', 'gantt'));
    assert.notEqual(codeDigest(pkg('gantt')), codeDigest(pkg('map')), 'editing the manifest’s fence alone asks again');
    assert.notEqual(codeDigest(pkg('gantt', 'a')), codeDigest(pkg('gantt', 'b')));
    assert.equal(pluginConsentText('c', 'f'), 'lattice-plugin-fence:1:f\u0000c');
    assert.notEqual(pluginDigest('C', 'a\u0000x'), pluginDigest('x\u0000C', 'a'), 'a NUL in the fence cannot move the split between fence and code');
    assert.notEqual(pluginDigest(Buffer.from('\uFEFFcode'), 'g'), pluginDigest('code', 'g'), 'bytes are hashed as they are: a leading BOM is part of the file');
    assert.notEqual(pluginDigest(Buffer.from([0x63, 0xff]), 'g'), pluginDigest(Buffer.from([0x63, 0xfe]), 'g'), 'two files with different invalid bytes do not share a digest');
    assert.notEqual(codeDigest({ roles: { 'transform.js': 't.js' }, files: { 't.js': 'same' } }), codeDigest(pkg('gantt', 'same')), 'a component and a plugin with the same text do not share a digest');
  });

  test('an approval of a component named x grants nothing to a plugin named x, and the reverse', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-fence-trust-')), 'trust.json');
    const sha = codeDigest(pkg());
    grantTrust('component', 'x', sha, { file });
    assert.equal(isTrusted('component', 'x', sha, file), true);
    assert.equal(isTrusted('plugin', 'x', sha, file), false);
    grantTrust('plugin', 'y', sha, { file });
    assert.equal(isTrusted('component', 'y', sha, file), false);
  });

  test('the door lists a plugin whose code is not approved, by its type', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-fence-trust-')), 'trust.json');
    const sha = codeDigest(pkg());
    assert.deepEqual(untrustedCodePackages([{ name: 'x', type: 'plugin', sha256: sha }], { file }), [{ name: 'x', type: 'plugin', sha256: sha }]);
    grantTrust('plugin', 'x', sha, { file });
    assert.deepEqual(untrustedCodePackages([{ name: 'x', type: 'plugin', sha256: sha }], { file }), []);
    assert.equal(untrustedCodePackages([{ name: 'x', sha256: sha }], { file }).length, 1, 'a component of that name is still unapproved');
  });
});
