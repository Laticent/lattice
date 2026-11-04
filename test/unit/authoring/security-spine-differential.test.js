/**
 * THE SECURITY SPINE'S ACCEPTANCE TEST (engineering/decisions/2026-11-03-security-findings-spine.md §Phasing, S2):
 * on a seeded deck, the LINTER warns on exactly what the RENDERER blocks, each run alone.
 *
 *   - The linter reads the SOURCE (lint-core's security rules, and the video plugin's `video-web-poster`).
 *   - The renderer reads its OUTPUT: the engine renders the deck, `blockWebImages` refuses every web address (with
 *     `fonts`, the host with no content-security policy behind it, so every refusal is counted), and the slide
 *     sanitizer strips what runs.
 *
 * Neither reads the other's result. Compared as ADDRESSES (the exact text each refuses), each once: the engine draws a
 * deck-wide background on every slide, and lint reports its one line once. The stripped constructs are compared as
 * counts per construct: what the sanitizer removed from the render against what lint warned on.
 *
 * A case lint cannot see is not seeded here and is listed in the note's "S2, as built" instead (an address at the
 * site's own origin, which the Studio allows and lint cannot know).
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../../lib/authoring/lint-core');
const engine = require('../../../lib/engine/index.js');
const { blockWebImages } = require('../../../lib/core/remote-ref.js');
const POLICY = require('../../../lib/core/content-policy.js');

const SECURITY_RULES = new Set(['web-image', 'web-request', 'stripped-markup', 'style-ends-early', 'markup-unsure', 'video-web-poster']);
const vocab = { names: new Set(['video']), modifiers: new Set() };
const F = '```';

// Every source construct the renderer blocks, one or more spellings each, and the near misses it does not.
const SEEDED = `---
marp: true
theme: indaco
plugins: [video]
backgroundImage: url(https://fm-bg.example/a.png)
color: url(https://fm-color.example/a.png)
header: "![h1](https://first-header.example/1.png)"
header: "![h2](https://last-header.example/2.png)"
---

## Raw HTML media

<img src="https://img.example/1.png" alt="x">

<img src=https&#58;//entity.example/e.png alt="">

<picture><source srcset="https://set.example/a.png 1x, local.png 2x"><img src="ok.png" alt=""></picture>

<video src="https://vid.example/v.mp4" poster="https://poster.example/p.jpg"></video>

Text with <img src="//inline.example/i.png" alt=""> inline, and <img src="relative.png" alt=""> beside it.

---

## Styles

<div style="background:url('https://style.example/s.png')">x</div>

<div style="background:u\\72l(https://escape.example/e.png)">y</div>

<style>
section { background: url(https://block.example/b.png); }
@import "https://imp.example/i.css";
a[href="https://selector.example/"] { color: red; }
</style>

<svg width="10" height="10"><image href="https://svgimg.example/i.png"/><rect fill="url(https://paint.example/p.svg#a)"/><a href="#x"><set attributeName="href" to="https://smil.example/s"/></a></svg>

---

<!-- _backgroundImage: url(https://dir-bg.example/d.png) -->

<!-- _backgroundColor: url(https://dir-color.example/c.png) -->

## Click and script

<a href="https://link-ok.example/" ping="https://ping.example/p">link</a>

<link rel="stylesheet" href="https://link.example/l.css">

<script>alert(1)</script>

<script src="../dist/lattice-runtime.js"></script>

<div onclick="x()">click</div>

<a href="javascript:alert(1)">js</a>

<p style="width: expression(alert(1))">old</p>

---

## Diagrams and navigation

<svg viewBox="0 0 10 10"><defs><style>.cls-1{fill:url(https://svg-style.example/s.png)}</style></defs><rect class="cls-1" width="10" height="10"/></svg>

${F}mermaid
flowchart LR
  A["<img src='https://merm.example/m.png'>"] --> B
${F}

<meta http-equiv="refresh" content="0; url=https://refresh.example/">

---

<!-- _class: video -->

## A clip

\`@video{"https://www.youtube.com/watch?v=dQw4w9WgXcQ", poster="https://video-poster.example/p.jpg"}\`

---

## Near misses: none of these loads or runs

[a link](https://plain-link.example/) and \`<img src="https://code-span.example/a.png">\`

${F}html
<img src="https://fenced.example/a.png"><script>alert(2)</script>
${F}

<!-- <img src="https://comment.example/a.png"> -->

<img src="sample:logo-acme-mark.svg" alt=""> <img src="data:image/png;base64,AAAA" alt="">
`;

const linted = () => core.lintTextWith(SEEDED, vocab).filter((f) => SECURITY_RULES.has(f.rule));

describe('security spine S2: the linter warns on exactly what the renderer blocks', () => {
  test('the same web addresses, each consumer run alone', () => {
    const { blocked } = blockWebImages(engine.render(SEEDED, 'indaco').html, [], { fonts: true, DOMParser: null });
    const rendered = [...new Set(blocked.map((b) => b.url))].sort();
    const lint = [...new Set(linted().filter((f) => f.rule !== 'stripped-markup' && f.rule !== 'markup-unsure').map((f) => f.address))].sort();
    assert.deepEqual(lint, rendered);
    // The seed is not vacuous: every family is in it, and no near miss is.
    for (const u of ['https://svg-style.example/s.png', 'https://dir-color.example/c.png', 'https://fm-color.example/a.png', 'https://img.example/1.png', 'https://entity.example/e.png', 'https://escape.example/e.png', 'https://smil.example/s', 'https://merm.example/m.png', 'https://refresh.example/', 'https://ping.example/p', 'https://video-poster.example/p.jpg', 'https://dir-bg.example/d.png', 'https://fm-bg.example/a.png']) {
      assert.ok(rendered.includes(u), `the renderer should block ${u}`);
    }
    for (const near of ['plain-link', 'code-span', 'fenced', 'comment', 'selector', 'link-ok']) assert.ok(!rendered.some((u) => u.includes(near)), `${near} is not a fetch`);
  });

  test('the duplicated front-matter header: both read the last, as the engine does', () => {
    const { blocked } = blockWebImages(engine.render(SEEDED, 'indaco').html, [], { fonts: true, DOMParser: null });
    const headers = core.lintTextWith(SEEDED, vocab).filter((f) => f.rule === 'web-image' && f.slide === 0 && /header/.test(f.message)).map((f) => f.address);
    assert.deepEqual(headers, ['https://last-header.example/2.png']);
    assert.ok(blocked.some((b) => b.url === 'https://last-header.example/2.png'));
    assert.ok(!blocked.some((b) => b.url.includes('first-header')));
  });

  test('the same stripped constructs: what the sanitizer removed from the render, against what lint warned on', async () => {
    const [{ createSlideSanitizer }, DOMPurify, { JSDOM }] = await Promise.all([
      import('../../../lib/core/sanitize-slide-html.mjs'),
      import('dompurify').then((m) => m.default ?? m),
      import('jsdom'),
    ]);
    const win = new JSDOM('').window;
    const sanitize = createSlideSanitizer(DOMPurify, win);
    const html = blockWebImages(engine.render(SEEDED, 'indaco').html, [], { fonts: true, DOMParser: null }).html;
    // The constructs, counted in a parsed document by the table's own predicates.
    const count = (markup) => {
      const doc = new win.DOMParser().parseFromString(`<!doctype html><body>${markup}`, 'text/html');
      const n = new Map();
      const add = (k) => n.set(k, (n.get(k) || 0) + 1);
      for (const el of doc.body.querySelectorAll('*')) {
        const tag = el.localName;
        // Lattice's own vendored build is not the author's mistake (lint-core `findWebMarkup`): counted apart.
        if (tag === 'script' && !el.textContent.trim() && POLICY.isVendoredScript(el.getAttribute('src') || '')) add('vendored');
        else if (POLICY.ACTIVE_STRIPPED_TAGS.has(tag)) add(`<${tag}>`);
        for (const a of el.attributes) {
          if (POLICY.isEventHandlerAttr(a.name)) add(a.name);
          else if (a.name === 'style' && POLICY.STYLE_SCRIPT_RE.test(a.value)) add('style:script');
          else if ((POLICY.FETCH_ATTRS.has(a.name) || a.name === 'href') && POLICY.isScriptUrl(a.value.trim())) add(`${a.name}:script`);
        }
      }
      return n;
    };
    const before = count(html);
    const after = count(sanitize(html));
    const removed = Object.fromEntries([...before].filter(([k]) => k !== 'vendored').map(([k, v]) => [k, v - (after.get(k) || 0)]).filter(([, v]) => v > 0));
    const lint = {};
    for (const f of linted().filter((x) => x.rule === 'stripped-markup')) lint[f.construct] = (lint[f.construct] || 0) + 1;
    assert.deepEqual(lint, removed);
    assert.deepEqual(Object.keys(removed).sort(), ['<script>', 'href:script', 'onclick', 'style:script']);
    // The vendored script is stripped too, and lint stays quiet on it by design.
    assert.equal(before.get('vendored'), 1);
    assert.equal(after.get('vendored') || 0, 0);
  });

  test('every security finding is a warning: the renderer already blocks (D2)', () => {
    const all = linted();
    assert.ok(all.length > 20);
    for (const f of all) assert.equal(f.severity, 'warning', `${f.rule}: ${f.line}`);
  });
});

describe('security spine S2: the rules the renderer has no address for', () => {
  const rules = (src) => core.lintTextWith(src, vocab).filter((f) => SECURITY_RULES.has(f.rule));

  test('style-ends-early: a `</style` in the front matter\'s style:, which the export pastes into its stylesheet', () => {
    const got = rules('---\nmarp: true\nstyle: |\n  section { color: red; }\n  </style><img src=x>\n---\n\n# A\n');
    assert.deepEqual(got.map((f) => [f.rule, f.slide, f.line]), [['style-ends-early', 0, '</style><img src=x>']]);
  });

  test('a web address in the front matter\'s style: is a web-image', () => {
    const got = rules('---\nmarp: true\nstyle: "section { background: url(https://fm-style.example/a.png) }"\n---\n\n# A\n');
    assert.deepEqual(got.map((f) => [f.rule, f.address]), [['web-image', 'https://fm-style.example/a.png']]);
  });

  test('markup-unsure: markup a browser may build differently, where the preview asks the browser', () => {
    const got = rules('---\nmarp: true\n---\n\n# A\n\n<svg><desc><p>held</p></desc></svg>\n');
    assert.equal(got.length, 1);
    assert.equal(got[0].rule, 'markup-unsure');
    assert.match(got[0].message, /integration-point|foreign-content/);
  });

  test('silent on a clean deck with comments, a local image and a `<style>` block of deck CSS', () => {
    assert.deepEqual(rules('---\nmarp: true\n---\n\n<!-- _class: lead -->\n\n<style>\nsection { color: var(--text); }\n</style>\n\n<img src="logo.png" alt="">\n'), []);
    // a design tool's logo export: a `<style>` inside `<svg>` with no web address is not unsure and not a web image
    assert.deepEqual(rules('---\nmarp: true\n---\n\n<svg viewBox="0 0 10 10"><defs><style>.cls-1{fill:#e30613}</style></defs><rect class="cls-1" width="10" height="10"/></svg>\n'), []);
  });
});
