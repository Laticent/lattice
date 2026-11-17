/**
 * Unit: a lede longer than one page continues on the next (lib/core/split-envelope.js `ledeGroups`; owner, 2026-11-17,
 * D1 "continue at a sentence break"; fit-everywhere-model.md §25):
 *   ONE        a page count of 1 (or none) keeps every element on one page
 *   SENTENCE   one paragraph cut at a sentence break into two well-formed paragraphs, its open tag on both
 *   ELEMENTS   several paragraphs break between paragraphs, balanced by length, never inside one when a seam is near
 *   ORDER      every word appears once, in order, across the pages
 *   NO-SEAM    a lone one-sentence paragraph has nowhere to break, so it stays one page
 *
 * FALSIFIABLE: cutting at characters rather than sentence starts splits mid-sentence (SENTENCE); joining pieces of one
 * paragraph across pages, or cutting a paragraph where no page breaks, breaks ORDER or ELEMENTS.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ledeGroups } = require('../../../lib/core/split-envelope');

const text = (pages) => pages.flat().join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

test('ONE: one page, or no count, keeps the lede whole', () => {
  const outers = ['<p>One. Two.</p>', '<p>Three.</p>'];
  assert.deepEqual(ledeGroups(outers, 1), [outers]);
  assert.deepEqual(ledeGroups(outers, 0), [outers]);
});

test('SENTENCE: one paragraph is cut at a sentence break, both halves well formed', () => {
  const p = '<p class="lede">The first sentence is here. The second follows it. A third is <strong>bold and long</strong>. The fourth ends.</p>';
  const pages = ledeGroups([p], 2);
  assert.equal(pages.length, 2);
  for (const page of pages) {
    assert.equal(page.length, 1);
    assert.match(page[0], /^<p class="lede">[\s\S]*<\/p>$/);
  }
  assert.match(pages[1][0], /^<p class="lede">\s*[A-Z]/, 'the second page starts a sentence');
});

test('ELEMENTS: several paragraphs break between paragraphs, balanced by length', () => {
  const outers = ['<p>A first paragraph that is long enough to weigh.</p>', '<p>Short.</p>', '<p>A third paragraph, about as long as the first.</p>'];
  const pages = ledeGroups(outers, 2);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages.flat(), outers, 'whole paragraphs, in order: no paragraph cut when a seam between them is near');
  // Half the text is 50 characters; the break after the first paragraph lands at 48, after the second at 54.
  assert.deepEqual(pages, [outers.slice(0, 1), outers.slice(1)]);
});

test('ORDER: every word once, in order', () => {
  const outers = ['<p>Alpha one. Beta two. Gamma three.</p>', '<p>Delta four. Epsilon five.</p>'];
  for (const k of [2, 3]) assert.equal(text(ledeGroups(outers, k)), text([outers]));
});

test('NO-SEAM: a lone one-sentence paragraph stays one page', () => {
  const outers = ['<p>A single sentence with no break in it</p>'];
  assert.deepEqual(ledeGroups(outers, 2), [outers]);
});
