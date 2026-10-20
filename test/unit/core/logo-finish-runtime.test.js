/**
 * The deck logo on the RUNTIME path (the exported player / a served `.html`), run as the real bundle in
 * jsdom from a baked front-matter block — the surface the CLI cannot reach, because the engine has
 * already injected by then. The engine path is covered in test/unit/parsing/markdown-it-plugins.test.js;
 * this pins that the runtime reaches the same answer (HARD RULE #1: three paths, one result).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..', '..');
const { frontMatterBlock } = require(path.join(ROOT, 'lib/core/deck-front-matter.js'));
const BUNDLE = path.join(ROOT, 'dist', 'lattice-runtime.js');

function runtime(deckSource, markup) {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>${markup}${frontMatterBlock(deckSource)}</body></html>`,
    { url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
  );
  dom.window.fetch = () => Promise.reject(new Error('baked: no fetch expected'));
  const el = dom.window.document.createElement('script');
  el.textContent = fs.readFileSync(BUNDLE, 'utf8');
  dom.window.document.body.appendChild(el);
  return new Promise((r) => setTimeout(() => r(dom.window.document), 1000));
}

const sec = (n, cls = '') => `<section data-lattice-slide="${n}" class="${cls}"><h2>Slide ${n}</h2></section>`;
const DECK = (fm) => `---\ntheme: indaco\nlogo: lattice\n${fm}\n---\n\n## x\n`;

test('runtime: the title scope, `no-logo`, a tint and a per-slide color override reach the engine\'s answer', async () => {
  const markup = [sec(1, 'title'), sec(2), sec(3, 'title no-logo'), sec(4, 'title logo-ink')].join('');
  const doc = await runtime(DECK('logo-finish: bottom-center accent title'), markup);
  const [one, two, three, four] = [...doc.querySelectorAll('section')];
  const has = (s) => !!s.querySelector(':scope > img.deck-logo');
  assert.equal(has(one), true, 'the cover carries the mark');
  assert.equal(has(two), false, 'the `title` scope skips a plain slide');
  assert.equal(has(three), false, '`no-logo` removes it');
  assert.equal(has(four), true);
  // The tint: an svg beside the mark, a per-slide filter id, the inline vars on the SECTION.
  assert.ok(one.querySelector(':scope > svg.deck-logo-tint filter#deck-logo-tint-0'), 'slide 1 has its own filter');
  assert.match(one.getAttribute('style') || '', /--deck-logo-filter:\s*url\(#deck-logo-tint-0\)/);
  assert.ok(four.querySelector(':scope > svg.deck-logo-tint filter#deck-logo-tint-3'), 'the id is the slide position');
  assert.ok(four.classList.contains('logo-ink') && !four.classList.contains('logo-accent'), 'the slide\'s own color word evicts the deck\'s');
  assert.ok(one.classList.contains('logo-bottom-center') && one.classList.contains('logo-accent'), one.className);
});

test('runtime: an untinted deck injects the img and no svg or inline vars', async () => {
  const doc = await runtime(DECK('logo-finish: top-left'), sec(1, 'title') + sec(2));
  const [a, b] = [...doc.querySelectorAll('section')];
  assert.ok(a.querySelector(':scope > img.deck-logo') && b.querySelector(':scope > img.deck-logo'));
  assert.equal(doc.querySelectorAll('svg.deck-logo-tint').length, 0);
  assert.doesNotMatch(a.getAttribute('style') || '', /deck-logo-filter/);
});
