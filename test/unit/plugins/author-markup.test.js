/**
 * What the plugin host refuses in an AUTHOR's raw HTML (lib/plugins/author-markup.js): the host's
 * own figure markers, and a raw-HTML drawn fence of a plugin the render did not load. Each arm runs
 * the real engine on the default set and on a narrowed one (`plugins: { defaults: [] }`, the host
 * `--default-plugins=none` and `setPluginDefaults([])` give), and judges the output with a real HTML
 * parser (jsdom), because the question is what a BROWSER reads, not what a regex sees.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const { createEngine } = require('../../../lib/engine');
const { refuseAuthorMarkup, HOST_MARKERS, BAKE_WRITTEN } = require('../../../lib/plugins/author-markup.js');

const full = createEngine();
const narrowed = createEngine({ plugins: { defaults: [] } });
const html = (engine, src) => engine.render(src).html;
const parse = (h) => new JSDOM(`<!doctype html><body>${h}`).window.document;
/** Every element the browser would read as carrying a host marker, whatever the source spelled. */
const markedElements = (doc) => HOST_MARKERS.flatMap((m) => [...doc.querySelectorAll(`[${m}]`)].map((el) => `${el.tagName.toLowerCase()}[${m}]`));
/** What the Mermaid pass selects (lib/plugins/mermaid/mermaid.hydrate.js FENCE_CODE_SELECTOR). */
const DRAWN = ':is(pre, marp-pre):not([data-lattice-off]) > code[class*="language-mermaid"]';

const RAW_MERMAID = '# Flow\n\n<pre><code class="language-mermaid">graph TD; A-->B</code></pre>\n';

describe('a raw-HTML drawn fence follows the render\'s admission', () => {
  test('narrowed: the author\'s block stays code — no pass selects it', () => {
    const doc = parse(html(narrowed, RAW_MERMAID));
    assert.equal(doc.querySelectorAll(DRAWN).length, 0);
    assert.match(doc.querySelector('pre code').textContent, /graph TD/);
  });
  test('default set: the same block is left exactly as written (Mermaid is loaded)', () => {
    assert.match(html(full, RAW_MERMAID), /<pre><code class="language-mermaid">/);
  });
  test('a deck that lists the plugin loads it, and the block is drawable', () => {
    assert.equal(parse(html(narrowed, `---\nplugins: [mermaid]\n---\n${RAW_MERMAID}`)).querySelectorAll(DRAWN).length, 1);
  });
  // Every shape the pass's selector would still draw if only the FIRST <code> of a block <pre> were
  // judged (HARD RULE #25 checker): a second <code>, `class` inside an earlier value, a <pre> inside
  // a paragraph, a one-line <marp-pre>, a renamed class.
  for (const [label, raw] of [
    ['a second <code>', '<pre><code class="x">a</code><code class="language-mermaid">graph TD; A-->B</code></pre>'],
    ['class inside an earlier value', `<pre><code title=' class="foo"' class="language-mermaid">graph TD; A-->B</code></pre>`],
    ['a <pre> mid-paragraph', 'a <pre><code class="language-mermaid">graph TD; A-->B</code></pre>'],
    ['a one-line <marp-pre>', '<marp-pre><code class="language-mermaid">graph TD; A-->B</code></marp-pre>'],
    ['a renamed class', '<pre><code class="hljs language-mermaid-source">graph TD; A-->B</code></pre>'],
    ['any case', '<pre><code class="LANGUAGE-MERMAID">graph TD; A-->B</code></pre>'],
  ]) {
    test(`narrowed: ${label} is not drawable`, () => {
      const doc = parse(html(narrowed, `# x\n\n${raw}\n`));
      assert.equal(doc.querySelectorAll(DRAWN).length + doc.querySelectorAll(DRAWN.toLowerCase().replace('language-mermaid', 'LANGUAGE-MERMAID')).length, 0);
    });
  }
  test('a custom element whose name starts like <pre> is left a custom element', () => {
    assert.match(html(narrowed, '# x\n\n<pre-x>\n<code class="language-js">x</code>\n</pre-x>\n'), /<pre-x>/);
  });
});

const FORGED = '# Forged\n\n<div data-lattice-hydrate="function-plot" data-lattice-config="eyJkYXRhIjpbXX0=" data-lattice-settle="pending" class="plot"></div>\n\n<pre data-lattice-off="mermaid"><code>x</code></pre>\n';

describe('an author cannot write the host\'s figure markers', () => {
  for (const [label, engine] of [['default set', full], ['narrowed', narrowed]]) {
    test(`${label}: a forged pending figure and admission marker reach no element`, () => {
      assert.deepEqual(markedElements(parse(html(engine, FORGED))), []);
    });
  }
  // Every shape that desynchronized a tag-walking refusal from the browser's tokenizer (HARD RULE
  // #25 checker), plus the plain spellings. The engine's output is parsed as a browser parses it.
  for (const [label, raw] of [
    ['plain', '<div data-lattice-hydrate="mermaid">x</div>'],
    ['inline', 'A <span data-lattice-off="math">y</span> z'],
    ['glued to a quote', '<div class="a"data-lattice-hydrate="m"id="b">x</div>'],
    ['upper case', '<p DATA-LATTICE-SETTLE=pending>t</p>'],
    ['slash separator', '<img/data-lattice-settle src="a.png">'],
    ['quote desync', '<div x="<b title=" data-lattice-hydrate=mermaid data-lattice-config=e30 ">x</div>'],
    ['quote inside a name', '<div a"b data-lattice-hydrate=m>x</div>'],
    ['comment opener in a value', '<div title="<!--" data-lattice-hydrate="m">x</div>'],
    ['script opener in a value', '<div title="<script>" data-lattice-hydrate="m">x</div>'],
    ['early comment end', '<!--> <div data-lattice-hydrate="m">x</div> -->'],
    ['bang comment end', '<!-- --!> <div data-lattice-hydrate="m">x</div> -->'],
    ['script end tag with an attribute', '<script></script x><div data-lattice-hydrate="m">x</div>'],
    ['> inside a script\'s value', '<script title=">" data-lattice-hydrate="m"></script>'],
    ['svg', '<svg><g data-lattice-settle="pending"></g></svg>'],
  ]) {
    test(`${label}: no element carries a host marker`, () => {
      for (const engine of [full, narrowed]) assert.deepEqual(markedElements(parse(html(engine, `# x\n\n${raw}\n`))), []);
    });
  }
  test('a longer name that merely STARTS with a marker\'s is not the marker', () => {
    assert.equal(refuseAuthorMarkup('<i data-lattice-offset="2">'), '<i data-lattice-offset="2">');
  });
  test('author vocabulary in the same prefix is kept: a motion asset still animates', () => {
    const svg = '<svg viewBox="0 0 10 10" data-lattice-motion="m1"><rect id="m1-a" width="1" height="1"></rect></svg>';
    assert.match(html(full, `# m\n\n${svg}\n`), /data-lattice-motion="m1"/);
  });
  test('what a bake writes into the Markdown survives: a baked figure keeps its marker', () => {
    // The CLI bake draws a figure INTO the source and stamps it (lib/plugins/mermaid/mermaid.bake.js);
    // the engine then reads that as raw HTML. Refusing the marker erased it from every baked diagram.
    const baked = '# d\n\n<div class="mermaid-svg" data-lattice-figure="mermaid"><svg viewBox="0 0 1 1"></svg></div>\n';
    for (const engine of [full, narrowed]) assert.equal(parse(html(engine, baked)).querySelectorAll('[data-lattice-figure="mermaid"]').length, 1);
  });
  test('every marker a bake writes is exempt, and none is refused', () => {
    const root = path.join(__dirname, '../../../lib/plugins');
    const written = new Set();
    for (const dir of fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const f = path.join(root, dir.name, `${dir.name}.bake.js`);
      if (!fs.existsSync(f)) continue;
      const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const m of src.matchAll(/data-lattice-[a-z-]+/g)) written.add(m[0]);
    }
    assert.ok(written.size >= 1, 'read no marker from any bake — the census is not reading anything');
    for (const a of written) {
      assert.ok(BAKE_WRITTEN.includes(a), `a bake writes ${a} into the Markdown; the engine would refuse it as author markup — add it to BAKE_WRITTEN with the reason`);
      assert.ok(!HOST_MARKERS.includes(a), `${a} is both refused and bake-written`);
    }
  });
  test('the list is the host\'s channel: every marker the host writes is on it', () => {
    const root = path.join(__dirname, '../../../lib/plugins');
    const written = new Set();
    for (const f of ['host.js', 'host-browser.mjs']) {
      const src = fs.readFileSync(path.join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const m of src.matchAll(/data-lattice-[a-z-]+/g)) written.add(m[0]);
    }
    assert.ok(written.size >= 4, `read too few markers from the host (${[...written]}) — the census is not reading anything`);
    for (const a of written) assert.ok(HOST_MARKERS.includes(a) || BAKE_WRITTEN.includes(a), `the host writes ${a}, which an author could forge: add it to HOST_MARKERS`);
  });
  test('the engine\'s OWN markers are untouched: a fenced function plot still hydrates', () => {
    const out = html(full, '# p\n\n```functionplot\n{"data":[{"fn":"x"}]}\n```\n');
    assert.match(out, /data-lattice-hydrate="function-plot"/);
  });
  test('linear on hostile input (the shapes that were quadratic)', () => {
    const t0 = process.hrtime.bigint();
    refuseAuthorMarkup('<script '.repeat(40000), [['mermaid', 'mermaid']]);
    refuseAuthorMarkup('<pre '.repeat(40000), [['mermaid', 'mermaid']]);
    refuseAuthorMarkup(`<div data-lattice-x ${'<a '.repeat(20000)}`);
    refuseAuthorMarkup(`<div ${'data-lattice-off=1 '.repeat(20000)}>`);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 500, `took ${ms.toFixed(0)} ms`);
  });
});
