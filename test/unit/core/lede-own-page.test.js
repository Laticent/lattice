/**
 * Unit: every split cover the measured split saw overflow gives its subtitle and lede a page of their own
 * (lib/core/split-envelope.js `ledeOwnPage`; owner, 2026-11-16: "lede page, all"; fit-everywhere-model.md §25).
 *
 * Split-panel's builder honored the plan's `ledePage` since 2026-11-13; every other cover ignored it, so a cover
 * with a display title and a long lede ran into its footer at the phone step. Cases:
 *   MOVES     a cover with a subtitle and a lede: both leave the cover, in order, for a body page right after it
 *   NESTED    a lede holding its own <div> is moved whole (the close is found depth-aware)
 *   NOTHING   a cover with neither (split-panel's, already moved) comes back unchanged
 *   CAROUSEL  carouselize applies it when the recipe says `ledePage`, and not otherwise
 *
 * FALSIFIABLE: without the call in carouselize CAROUSEL keeps the lede on the cover; with a first-`</div>` close
 * NESTED cuts the lede short.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ledeOwnPage, coverSection } = require('../../../lib/core/split-envelope');
const { carouselize } = require('../../../lib/core/carousel');

const OPEN = '<section data-lattice-slide="3" class="table">';
const chrome = { header: '', footer: '' };
const cover = (body) => coverSection(OPEN, chrome, { heading: 'The heading', ...body }, 'table');
const body = '<section data-lattice-slide="3" data-split-role="body" class="table"><p>rows</p></section>';

test('MOVES: the subtitle and the lede leave the cover, in order, for a page right after it', () => {
  const [c, page, rest] = ledeOwnPage([cover({ subtitle: 'A subtitle.', lede: 'A long lede.' }), body], OPEN, chrome, 'table');
  assert.doesNotMatch(c, /split-feat-(sub|lede)/, 'the cover keeps neither');
  assert.match(c, /The heading/, 'the cover keeps its title');
  assert.match(page, /data-split-role="body"/);
  assert.match(page, /class="content lat-split-lede form split-lede-table/);
  assert.ok(page.indexOf('A subtitle.') < page.indexOf('A long lede.'), 'the subtitle, then the lede');
  assert.equal(rest, body, 'the body pages follow, untouched');
});

test('NESTED: a lede holding its own div is moved whole', () => {
  const [c, page] = ledeOwnPage([cover({ lede: 'Before <div class="x">inner</div> after.' }), body], OPEN, chrome, 'table');
  assert.match(page, /Before <div class="x">inner<\/div> after\./);
  assert.doesNotMatch(c, /after\./);
});

test('NOTHING: a cover with no subtitle or lede comes back as it was', () => {
  const parts = [cover({}), body];
  assert.deepEqual(ledeOwnPage(parts, OPEN, chrome, 'table'), parts);
  assert.deepEqual(ledeOwnPage([parts[0]], OPEN, chrome, 'table'), [parts[0]], 'a single page is not a run');
  const once = ledeOwnPage([cover({ subtitle: 'Sub.', lede: 'Lede.' }), body], OPEN, chrome, 'table');
  assert.deepEqual(ledeOwnPage(once, OPEN, chrome, 'table'), once, 'a run that has its lede page gets no second one');
});

test('CAROUSEL: carouselize gives the lede its page when the recipe says ledePage, and only then', () => {
  // A real premise slide, rendered by the engine and split by its own manifest recipe (cover-paginate).
  const { render } = require('../../../lib/engine');
  const { loadAll } = require('../../../lib/components');
  const md = '---\nmarp: true\nsize: square\n---\n\n<!-- _class: premise -->\n\n## A heading that makes a claim.\n\n'
    + 'A lede paragraph that the cover carries for the run.\n\n- First point\n  - Body one.\n- Second point\n  - Body two.\n- Third point\n  - Body three.\n';
  const m = render(md).html.match(/(<section[^>]*class="premise[^>]*>)([\s\S]*?)<\/section>/);
  const recipe = loadAll().find((x) => x.name === 'premise').split;
  const plain = carouselize(m[1], m[2], recipe, 1, 'premise');
  assert.match(plain[0], /split-feat-lede/, 'the case must carry a lede on its cover, or this proves nothing');
  const lifted = carouselize(m[1], m[2], { ...recipe, ledePage: true }, 1, 'premise');
  assert.equal(lifted.length, plain.length + 1, 'one page more');
  assert.doesNotMatch(lifted[0], /split-feat-lede/, 'the lede left the cover');
  assert.match(lifted[1], /lat-split-lede form split-lede-premise/);
  assert.match(lifted[1], /A lede paragraph that the cover carries/);
});
