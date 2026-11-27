/**
 * Unit: the `passage` carousel strategy (lib/core/carousel.js) on a real rendered citation-card
 * (fixtures/citation-card.rendered.html: a masthead, a cite, one quoted clause, a two-item gloss).
 * Its members are the passage's sentences, then the gloss list's items; a measured plan says how
 * many go on each page (owner, 2026-11-06, fit-everywhere-model.md §20).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { splitSections } = require('@laticent/markup');
const { carouselize, MEMBER_CLAIM_STRATEGIES } = require('../../../lib/core/carousel');

const fixture = fs.readFileSync(path.join(__dirname, 'fixtures/citation-card.rendered.html'), 'utf8');
const [section] = splitSections(fixture).filter((p) => p.type === 'section');
const split = (plan, inner = section.inner) => carouselize(section.openTag, inner, { strategy: 'passage', ...(plan ? { plan } : {}) }, Infinity, 'citation-card');
const roles = (parts) => parts.map((p) => (p.match(/data-split-role="([^"]+)"/) || [])[1]);
const text = (html) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
// A three-sentence passage in place of the fixture's one-sentence clause.
const threeSentences = section.inner.replace(/(<blockquote\b[^>]*>)[\s\S]*?(<\/blockquote>)/, '$1\n<p>The first rule binds. The second <em>rule widens</em> it. The third rule ends.</p>\n$2');

test('it joins the member-claim strategies, so the dispatcher leaves its passage and gloss alone', () => {
  assert.ok(MEMBER_CLAIM_STRATEGIES.has('passage'));
});

test('no measured plan, or a plan that miscounts the members, keeps the slide whole', () => {
  assert.equal(split(null), null);
  assert.equal(split([1, 1]), null, 'three members (one sentence, two items), not two');
  assert.equal(split([4]), null);
});

test('the gloss moves to its own page; the cite stays with the quote', () => {
  const parts = split([1, 2]);
  assert.deepEqual(roles(parts), ['cover', 'body', 'body']);
  const [, quote, gloss] = parts;
  assert.match(quote, /<blockquote/);
  assert.match(quote, /Cal\. Civ\. Code/);
  assert.doesNotMatch(quote, /<ul/);
  assert.doesNotMatch(gloss, /<blockquote/);
  assert.doesNotMatch(gloss, /Cal\. Civ\. Code/, 'a page of notes carries no cite');
  assert.ok((gloss.match(/<li\b/g) || []).length >= 2, 'both items, on one page');
  assert.match(gloss, /In plain English/);
  assert.match(gloss, /What we must do/);
});

test('one item a page keeps each item whole, nested list and all', () => {
  const parts = split([1, 1, 1]);
  assert.equal(parts.length, 4);
  assert.match(parts[2], /In plain English/);
  assert.doesNotMatch(parts[2], /What we must do/);
  assert.match(parts[3], /What we must do[\s\S]*household identifiers/);
});

test('a long quote continues at a sentence, and a page keeps its sentences in one paragraph', () => {
  const parts = carouselize(section.openTag, threeSentences, { strategy: 'passage', plan: [2, 3] }, Infinity, 'citation-card');
  assert.deepEqual(roles(parts), ['cover', 'body', 'body']);
  const [, first, second] = parts;
  assert.match(first, /<p>The first rule binds\. The second <em>rule widens<\/em> it\. <\/p>/);
  assert.doesNotMatch(first, /The third rule/);
  assert.doesNotMatch(first, /<ul/);
  assert.match(second, /<p>The third rule ends\.<\/p>/);
  assert.match(second, /Cal\. Civ\. Code/, 'the cite rides every page that carries the quote');
  assert.match(second, /In plain English[\s\S]*What we must do/);
});

test('every word lands on exactly one body page', () => {
  for (const plan of [[1, 2], [1, 1, 1], [3]]) {
    const parts = split(plan);
    const bodies = parts.filter((p) => /data-split-role="body"/.test(p)).map(text).join(' ');
    for (const phrase of ['Personal information', 'In plain English', 'household identifiers']) {
      assert.equal(bodies.split(phrase).length - 1, 1, `${phrase} once under ${JSON.stringify(plan)}`);
    }
  }
});

test('text above the quote prints once; only the cite repeats', () => {
  const inner = threeSentences.replace(/(<blockquote\b)/, '<p>Context for the reader.</p>\n$1');
  const parts = carouselize(section.openTag, inner, { strategy: 'passage', plan: [2, 3] }, Infinity, 'citation-card');
  const bodies = parts.filter((p) => /data-split-role="body"/.test(p));
  assert.equal(bodies.join('').split('Context for the reader').length - 1, 1);
  assert.match(bodies[1], /Cal\. Civ\. Code/);
});

test('a key insight after the gloss rides the last page, once', () => {
  const inner = section.inner.replace(/(<\/ul>)(\s*<\/div>)/, '$1\n<blockquote>\n<p><strong>Key insight.</strong> Scope is wider.</p>\n</blockquote>$2');
  const parts = split([1, 2], inner);
  assert.ok(parts, 'it splits');
  assert.equal(parts.join('').split('Scope is wider').length - 1, 1);
  assert.match(parts[parts.length - 1], /Scope is wider/);
});
