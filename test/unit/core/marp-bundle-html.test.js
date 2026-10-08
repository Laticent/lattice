/**
 * lib/core/marp-bundle-html.js — the Export-to-Marp bundle's HTML allowlist and its engine plugin
 * (engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 13).
 *
 * The config is generated text, so these tests evaluate the SAME source the config ships
 * (`configSource`) rather than a copy. That real marp-core and marp-cli honor it is pinned in
 * test/integration/export/marp-bundle-author-script.test.js (the `allowlist` arm).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const { MARP_HTML_ALLOWLIST, URL_ATTRS, configSource } = require('../../../lib/core/marp-bundle-html');
const { RUNTIME_SCRIPT_SRCS, RUNTIME_SCRIPTS } = require('../../../lib/core/marp-bundle');

function load() {
  const ctx = {};
  vm.runInNewContext(`${configSource(RUNTIME_SCRIPT_SRCS)}\nthis.html = html; this.engine = engine;`, ctx);
  return ctx;
}

test('no tag that can run script or load a document of the deck\'s own is on the list', () => {
  for (const tag of ['script', 'frame', 'object', 'embed', 'base', 'meta', 'link', 'style', 'form', 'input',
    'button', 'textarea', 'foreignobject', 'image', 'animate', 'set', 'animatetransform', 'animatemotion', 'template',
    // MathML is on the list for baked equations (§ 15), but not the parts that link, load or switch
    // namespace: `maction`, `mglyph` (an image), `annotation-xml` (an HTML integration point).
    'maction', 'mglyph', 'annotation-xml', 'malignmark']) {
    assert.equal(MARP_HTML_ALLOWLIST[tag], undefined, tag);
  }
  for (const [tag, attrs] of Object.entries(MARP_HTML_ALLOWLIST)) {
    for (const a of attrs) assert.doesNotMatch(a, /^on|^srcdoc$|^formaction$|^action$/, `${tag}[${a}]`);
    // Every URL-valued attribute takes a filter, never a bare `true`.
    for (const a of attrs.filter((x) => /^(?:href|xlink:href|src|srcset|poster|cite)$/.test(x))) {
      assert.ok(URL_ATTRS[tag]?.[a], `${tag}[${a}] has a URL filter`);
    }
  }
});

test('a frame loads an https: page only, and an SVG <use> points inside the document only', () => {
  const { html } = load();
  assert.equal(html.iframe.src('https://www.youtube.com/embed/x'), 'https://www.youtube.com/embed/x');
  for (const bad of ['http://x.test/', 'javascript:x', 'data:text/html,x', '//x.test/', 'file:///etc/passwd']) assert.equal(html.iframe.src(bad), '', bad);
  assert.equal(html.use.href('#grad-1'), '#grad-1');
  for (const bad of ['https://x.test/s.svg#a', 'icons.svg#a', 'javascript:x']) assert.equal(html.use.href(bad), '', bad);
  assert.equal(html.img.srcset('a.png 1x, b.png 2x'), 'a.png 1x, b.png 2x');
  assert.equal(html.img.srcset('a.png 1x, javascript:x 2x'), '');
});

test('the tags and attributes the shipped decks write are on the list (measured 2026-10-07)', () => {
  // Every tag and attribute in the raw HTML of the 422 shipped `marp: true` decks, through the bundle.
  const measured = {
    b: [], br: [], circle: ['cx', 'cy', 'fill', 'id', 'r', 'stroke', 'stroke-width'], del: [], desc: [],
    div: ['class', 'data-dock', 'style'], ellipse: ['cx', 'cy', 'fill', 'rx', 'ry', 'stroke', 'stroke-width'], em: [],
    h2: [], i: [], ins: [], p: ['class'], path: ['d', 'fill', 'id', 'stroke', 'stroke-width'], polygon: ['fill', 'points'],
    rect: ['fill', 'height', 'id', 'rx', 'stroke', 'stroke-width', 'width', 'x', 'y'], span: ['class', 'style'], sup: [],
    svg: ['data-lattice-motion', 'fill', 'role', 'stroke-linecap', 'stroke-linejoin', 'stroke-width', 'viewbox', 'xmlns'],
    table: [], tbody: [], td: [], th: [], thead: [], title: [], tr: [], u: [],
  };
  for (const [tag, attrs] of Object.entries(measured)) {
    assert.ok(MARP_HTML_ALLOWLIST[tag], `<${tag}>`);
    for (const a of attrs) assert.ok(MARP_HTML_ALLOWLIST[tag].includes(a), `<${tag} ${a}>`);
  }
});

test('the generated config defines html and engine, naming no module', () => {
  const src = configSource(RUNTIME_SCRIPT_SRCS);
  assert.doesNotMatch(src, /require\(|import /);
  // A runtime file name with a "/" would end a regex literal; the source still evaluates.
  assert.doesNotThrow(() => vm.runInNewContext(configSource(['vendor/x.js']), {}));
  const { html, engine } = load();
  assert.equal(typeof engine, 'function');
  assert.equal(html.a.href('javascript:x'), '');
  assert.equal(html.div.class, true);
});

test('a URL attribute keeps a web, relative or image URL and drops one that can run', () => {
  const safeUrl = load().html.a.href;
  for (const ok of ['https://x.test/a', 'assets/a.png', '#slide-2', 'mailto:a@b.test', 'data:image/png;base64,AA']) {
    assert.equal(safeUrl(ok), ok);
  }
  for (const bad of ['javascript:alert(1)', ' JaVaScRiPt:x', 'java\tscript:x', 'vbscript:x', 'data:text/html,<b>',
    'data:image/svg+xml,<svg onload=x>', '\u0000javascript:x']) {
    assert.equal(safeUrl(bad), '', JSON.stringify(bad));
  }
});

// Each line comes back after `</title></svg>`, which ends an author's open <title> or <svg> in the browser
// and is ignored otherwise; the integration test's deck ends inside an open <svg><title> to pin that.
test('the engine passes the bundle\'s own trailing blocks byte for byte, and nothing that only resembles them', () => {
  const { engine } = load();
  const calls = [];
  const md = { renderer: { rules: { html_block: (tokens, idx) => { calls.push(tokens[idx].content); return 'SANITIZED'; } } } };
  const marp = { use(plugin) { plugin(md); return this; } };
  assert.equal(engine({ marp }), marp);
  const render = (content) => md.renderer.rules.html_block([{ content }], 0, {}, {}, {});
  // Every runtime tag the bundle appends, and both data blocks.
  for (const line of RUNTIME_SCRIPTS.split('\n').filter((l) => l.startsWith('<script'))) {
    assert.equal(render(`${line}\n`), `</title></svg>${line}\n`);
  }
  for (const block of ['<script type="application/lattice-front-matter">"marp: true"</script>\n',
    '<script type="application/lattice-export-settings">{"overflowMarker":"reader"}</script>\n']) {
    assert.equal(render(block), `</title></svg>${block}`);
  }
  assert.equal(calls.length, 0);
  for (const forged of [
    '<script>x()</script>\n',
    '<script src="https://evil.test/lattice-runtime-min.js"></script>\n',
    '<script src="lattice-runtime-min.js" onload="x()"></script>\n',
    '<script src="lattice-runtime-min.js"></script><script>x()</script>\n',
    '<script type="application/lattice-front-matter"></script><script>x()</script>\n',
    '<script type="module">x()</script>\n',
    '<script src="lattice-runtime-minXjs"></script>\n',
  ]) {
    assert.equal(render(forged), 'SANITIZED', forged);
  }
});

test('an author block that swallowed a runtime line (an unclosed <pre>) is sanitized; the runtime line still passes', () => {
  const { engine } = load();
  const seen = [];
  const md = { renderer: { rules: { html_block: (tokens, idx) => { seen.push(tokens[idx].content); return '[S]'; } } } };
  engine({ marp: { use(p) { p(md); return this; } } });
  const tokens = [{ content: '<pre>\ncode\n\n<!-- markdownlint-disable MD033 -->\n<script src="mermaid-v11-min.js"></script>\n' }];
  assert.equal(md.renderer.rules.html_block(tokens, 0), '[S]</title></svg><script src="mermaid-v11-min.js"></script>\n');
  assert.deepEqual(seen, ['<pre>\ncode\n\n<!-- markdownlint-disable MD033 -->\n']);
  assert.match(tokens[0].content, /mermaid/, 'the token is restored after the call');
});

test('the CLI line prints no control character a deck wrote into an attribute name', () => {
  const { formatRefusedHtml } = require('../../../lib/core/marp-bundle-html');
  const line = formatRefusedHtml({ tags: {}, attrs: { 'div[x\u001b[31my]': 1 } });
  assert.ok(!line.includes('\u001b'));
  assert.match(line, /div\[x\?\[31my\]/);
});


// The trailer's own comments are not the author's speaker notes. A stand-in for Marpit's comment token
// and collect rule drives the hook; marp-bundle-author-script.test.js runs real `marp --notes`.
test('the engine keeps the bundle\'s own comments out of the speaker notes, and only those', () => {
  const { engine } = load();
  const md = require('markdown-it')({ html: true });
  md.core.ruler.push('marpit_collect', () => {});
  engine({ marp: { use(p) { p(md); return this; } } });
  const hide = md.core.ruler.__rules__.find((r) => r.name === 'lattice_hide_notes');
  assert.ok(hide, 'registered before Marpit collects notes');
  assert.ok(md.core.ruler.__rules__.indexOf(hide) < md.core.ruler.__rules__.findIndex((r) => r.name === 'marpit_collect'));
  const tokens = [
    { type: 'marpit_comment', content: 'Lattice: ends any HTML block left open above', meta: {} },
    { type: 'marpit_comment', content: 'markdownlint-disable MD033', meta: {} },
    { type: 'inline', children: [{ type: 'marpit_comment', content: 'Lattice: generated snapshot', meta: null }] },
    { type: 'marpit_comment', content: 'Say the number slowly.', meta: {} },
    { type: 'marpit_comment', content: 'Recap. Lattice: the product, not the trailer.', meta: {} },
  ];
  hide.fn({ tokens });
  assert.equal(tokens[0].meta.marpitCommentParsed, 'lattice');
  assert.equal(tokens[1].meta.marpitCommentParsed, 'lattice');
  assert.equal(tokens[2].children[0].meta.marpitCommentParsed, 'lattice');
  assert.equal(tokens[3].meta.marpitCommentParsed, undefined, 'the author\'s own note stays a note');
  assert.equal(tokens[4].meta.marpitCommentParsed, undefined, '"Lattice:" mid-text is still the author\'s');
  // A Marpit without the collect rule must not break the render: the notes only show the trailer again.
  assert.doesNotThrow(() => engine({ marp: { use(p) { p(require('markdown-it')({ html: true })); return this; } } }));
});

// An HTML <title> left open at a slide break swallows the slides after it as text in a browser. The
// report reads the deck in document order, as the browser does.
test('the report flags a <title> left open across a slide break, and nothing else', () => {
  const { refusedHtml, formatRefusedHtml } = require('../../../lib/core/marp-bundle-html');
  for (const [deck, want, why] of [
    ['# A\n\ntext <title>x\n\n---\n\n# B\n', ['title'], 'open across a slide break'],
    ['# A\n\ntext <title/>x\n\n---\n\n# B\n', ['title'], 'self-closing is still open in HTML'],
    ['# A\n\nx <title>a\n\n---\n\n# B\n\n---\n\ny </title> z\n', ['title'], 'closed only two slides later'],
    ['# A\n\n</title> x <title>y\n', ['title'], 'a close before the open does not count'],
    ['<svg viewBox="0 0 1 1"><title>t</svg>\n\n---\n\n# B\n', [], 'an SVG title closes with its <svg>'],
    ['<svg><title>t</title></svg>\n', [], 'closed SVG title'],
    ['# A\n\na <title>t</title> b\n', [], 'balanced on one slide'],
    ['# A\n\n`<title>`\n\n```\n<title>\n```\n', [], 'quoted code is not markup'],
    ['# A\n\n<!-- <title> -->\n', [], 'nor is a comment'],
  ]) assert.deepEqual(refusedHtml(deck).unclosed, want, why);
  assert.match(formatRefusedHtml(refusedHtml('# A\n\ntext <title>x\n\n---\n\n# B\n')), /leaves a <title> open/);
  assert.equal(formatRefusedHtml(refusedHtml('# A\n')), '');
});
