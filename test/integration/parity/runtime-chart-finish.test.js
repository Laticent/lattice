/**
 * Integration: the browser runtime stamps the chart finish on every section.
 *
 * `chart-finish:` is a look with no absent state (lib/core/resolve-chart-finish.js), so the
 * markdown-it path stamps the deck's finish, or the default, on every slide
 * (plugins.js `chart_finish_stamp`). lib/runtime/index.js is the same contract for surfaces the
 * engine never runs on (export-to-Marp, the marp-vscode webview), and HARD RULE #1 says the two
 * agree. This runs the ACTUAL bundled dist/lattice-runtime.js in jsdom, as
 * runtime-frontmatter-refire.test.js does, because the bootstrap IIFE is not requireable.
 *
 * What is pinned:
 *   · a BAKED front matter stamps its finish, with no fetch, and a slide's own token is left alone
 *   · a deck with no `chart-finish:` key, and a deck with no front matter at all, wear the default
 *     (the second is the case the deck-token pass cannot reach: it has no front matter to read)
 *   · the `.md` FETCH fallback never stamps the default first and swaps it: a `tone` deck is never
 *     seen wearing `pigment`, even for a frame
 *   · a live-edit that replaces the body gets the finish back from cache, with no second fetch
 *
 * HARD RULE #23: jsdom plus the real bundle exercises the runtime's own logic. It is not a claim
 * about marp-vscode or a real export opened in a browser.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { closeQuietly } = require(path.join(__dirname, '..', '..', 'helpers', 'jsdom-close'));
const { JSDOM } = require('jsdom');
const { frontMatterBlock } = require('../../../lib/core/deck-front-matter');

const RUNTIME_SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'dist', 'lattice-runtime.js'), 'utf8');

const deckSource = (extra) => ['---', 'theme: indaco', ...extra, '---', '', '## Title', '', 'Body.', ''].join('\n');
const section = (cls = '') => `<section${cls ? ` class="${cls}"` : ''}><h2>Title</h2><p>Body.</p></section>`;
const finishes = (el) => [...el.classList].filter((c) => /^chart-finish-(pigment|etch|tone)$/.test(c));

/** Boot the real runtime in jsdom over `body`; `fetchImpl` answers (or refuses) the `.md` fetch. */
async function boot({ body, url = 'file:///tmp/deck.html', fetchImpl, settleMs = 300 }) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${body}</body></html>`, {
    url, runScripts: 'dangerously', pretendToBeVisual: true,
  });
  const { window } = dom;
  const calls = { fetch: 0 };
  window.fetch = (...a) => { calls.fetch++; return fetchImpl ? fetchImpl(...a) : Promise.reject(new TypeError('Failed to fetch')); };
  // Every finish class that is EVER added to a section, so a swap (default, then the deck's) is
  // caught even when the final state is right.
  const seen = [];
  const observer = new window.MutationObserver((records) => {
    for (const r of records) {
      if (r.type !== 'attributes' || r.attributeName !== 'class') continue;
      for (const c of r.target.classList) if (/^chart-finish-/.test(c)) seen.push(c);
    }
  });
  observer.observe(window.document, { attributes: true, subtree: true, attributeFilter: ['class'] });
  const script = window.document.createElement('script');
  script.textContent = RUNTIME_SRC;
  window.document.body.appendChild(script);
  await new Promise((r) => setTimeout(r, settleMs));
  return { window, document: window.document, calls, seen: () => [...new Set(seen)] };
}

describe('runtime chart finish — every section wears one', () => {
  test('a baked deck finish lands on every section, and a slide that names its own keeps it', async () => {
    const baked = frontMatterBlock(deckSource(['chart-finish: tone']));
    assert.ok(baked, 'sanity: the fixture has front matter to bake');
    const { window, document, calls } = await boot({ body: `${section('bar')}${section('bar chart-finish-etch')}${section()}${baked}` });
    const [a, b, c] = [...document.querySelectorAll('section')];
    assert.deepEqual(finishes(a), ['chart-finish-tone']);
    assert.deepEqual(finishes(b), ['chart-finish-etch'], 'the slide\'s own token is not joined by the deck\'s');
    assert.deepEqual(finishes(c), ['chart-finish-tone'], 'a slide with no class at all is finished too');
    assert.equal(calls.fetch, 0, 'the baked block needs no network');
    closeQuietly(window);
  });

  test('a baked deck that names no finish wears the default on every section', async () => {
    const baked = frontMatterBlock(deckSource([]));
    const { window, document } = await boot({ body: `${section('bar')}${section('columns lat-pane-host')}${baked}` });
    for (const s of document.querySelectorAll('section')) assert.deepEqual(finishes(s), ['chart-finish-pigment']);
    for (const s of document.querySelectorAll('section')) assert.ok(s.classList.contains('chart-finish-muted'), 'and the default intensity');
    closeQuietly(window);
  });

  test('a baked `vivid` lands on every section, and a slide that names `muted` keeps it with the deck\'s finish', async () => {
    const baked = frontMatterBlock(deckSource(['chart-finish: etch vivid']));
    const { window, document } = await boot({ body: `${section('bar')}${section('bar chart-finish-muted')}${baked}` });
    const [a, b] = [...document.querySelectorAll('section')];
    assert.deepEqual(finishes(a), ['chart-finish-etch']);
    assert.ok(a.classList.contains('chart-finish-vivid'));
    assert.deepEqual(finishes(b), ['chart-finish-etch']);
    assert.ok(b.classList.contains('chart-finish-muted') && !b.classList.contains('chart-finish-vivid'));
    closeQuietly(window);
  });

  test('a retired or unknown word wears the default, as the engine path does', async () => {
    for (const word of ['off', 'etching', 'tonal']) {
      const baked = frontMatterBlock(deckSource([`chart-finish: ${word}`]));
      const { window, document } = await boot({ body: `${section('bar')}${baked}` });
      assert.deepEqual(finishes(document.querySelector('section')), ['chart-finish-pigment'], word);
      closeQuietly(window);
    }
  });

  test('a deck with NO front matter, fetched or not, wears the default — the case no deck-token pass can reach', async () => {
    // Fetch answers with a source that has no front matter at all.
    const fetched = await boot({
      body: `${section('bar')}${section('bar')}`,
      url: 'https://example.test/deck.html',
      fetchImpl: () => Promise.resolve({ ok: true, text: () => Promise.resolve('## Title\n\nBody.\n') }),
    });
    for (const s of fetched.document.querySelectorAll('section')) assert.deepEqual(finishes(s), ['chart-finish-pigment']);
    closeQuietly(fetched.window);
    // Fetch refused (a file:// open with nothing baked).
    const refused = await boot({ body: `${section('bar')}` });
    assert.deepEqual(finishes(refused.document.querySelector('section')), ['chart-finish-pigment']);
    closeQuietly(refused.window);
  });

  test('the fetch fallback waits for the deck: a `tone` deck is never seen wearing `pigment`', async () => {
    const { window, document, calls, seen } = await boot({
      body: `${section('bar')}${section('bar')}`,
      url: 'https://example.test/deck.html',
      fetchImpl: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true, text: () => Promise.resolve(deckSource(['chart-finish: tone'])) }), 80)),
      settleMs: 500,
    });
    assert.equal(calls.fetch, 1, 'one fetch of the source');
    for (const s of document.querySelectorAll('section')) assert.deepEqual(finishes(s), ['chart-finish-tone']);
    assert.deepEqual(seen(), ['chart-finish-tone', 'chart-finish-muted'], `a section wore ${seen().join(', ')} on the way`);
    for (const s of document.querySelectorAll('section')) assert.ok(s.classList.contains('chart-finish-muted'), 'and the default intensity');
    closeQuietly(window);
  });

  test('an author\'s own <section> inside a slide is content, not a slide, and is not stamped', async () => {
    // The engine path stamps slide tokens only. A raw nested <section> in a slide's HTML must not wear a
    // finish of its own, or the deck's word on the inner element could beat the slide's own token for the
    // charts inside it.
    const baked = frontMatterBlock(deckSource(['chart-finish: tone']));
    const nested = '<section class="bar chart-finish-etch"><h2>Title</h2><section class="aside"><p>Inner</p></section></section>';
    const { window, document } = await boot({ body: `${nested}${baked}` });
    const [outer, inner] = [...document.querySelectorAll('section')];
    assert.deepEqual(finishes(outer), ['chart-finish-etch'], 'the slide keeps its own');
    assert.deepEqual(finishes(inner), [], 'the nested section is not a slide');
    closeQuietly(window);
  });

  test('a live-edit that replaces the body gets the finish back from cache, with no second fetch', async () => {
    const baked = frontMatterBlock(deckSource(['chart-finish: etch']));
    const { window, document, calls } = await boot({ body: `${section('bar')}${baked}` });
    assert.deepEqual(finishes(document.querySelector('section')), ['chart-finish-etch']);
    document.body.innerHTML = `${section('bar')}${section('bar')}`;
    assert.deepEqual(finishes(document.querySelector('section')), [], 'sanity: the wipe removed the stamp');
    await new Promise((r) => setTimeout(r, 450));
    for (const s of document.querySelectorAll('section')) assert.deepEqual(finishes(s), ['chart-finish-etch']);
    assert.equal(calls.fetch, 0, 'no fetch, before or after the wipe');
    closeQuietly(window);
  });
});
