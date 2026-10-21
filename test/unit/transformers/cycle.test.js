/**
 * Unit tests for the cycle connector transform (lib/components/progression/cycle/
 * cycle.transform.js, wired by lib/transformers/cycle.js).
 *
 * The connector is a real `span.cycle-link` SVG between stages, not a `li::after`:
 * a pseudo-element has no box the layout can reserve, and at the hall venue it
 * outgrew its gap and painted over the next card. These tests pin the markup, the
 * `ul > li` stage count the engine relies on, idempotence, the split-page skip, and
 * that the string and DOM arms agree.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const cycle = require('../../../lib/transformers/cycle');

const STAGES = `
  <ul>
    <li>Plan<ul><li>Decide.</li></ul></li>
    <li>Do<ul><li>Act.</li></ul></li>
    <li>Check<ul><li>Measure.</li></ul></li>
  </ul>`;
const slide = (cls, body = STAGES) => `<section class="${cls}"><h2>Loop</h2>${body}</section>`;

const count = (s, needle) => s.split(needle).length - 1;

describe('cycle connector — string arm', () => {
  test('puts one cycle-link between each pair of stages, never after the last', () => {
    const out = cycle.applyToHtml(slide('cycle'));
    assert.equal(count(out, 'class="cycle-link"'), 2);
    assert.match(out, /<\/li>\s*<span class="cycle-link"[^>]*><svg[^>]*><path[^>]*\/><\/svg><\/span>\s*<li>Do/);
    assert.doesNotMatch(out, /<span class="cycle-link"[^>]*>.*<\/span>\s*<\/ul>/s);
  });

  test('leaves the stage count alone — links are not list items', () => {
    const out = cycle.applyToHtml(slide('cycle'));
    assert.equal(count(out, '<li>Plan') + count(out, '<li>Do') + count(out, '<li>Check'), 3);
    assert.equal(count(out, '<li class="cycle-link"'), 0);
  });

  test('does not touch the nested body lists', () => {
    const out = cycle.applyToHtml(slide('cycle'));
    assert.match(out, /<ul><li>Decide\.<\/li><\/ul>/);
  });

  test('carries no palette — the stroke color comes from the stylesheet', () => {
    const out = cycle.applyToHtml(slide('cycle'));
    assert.doesNotMatch(out, /#[0-9a-f]{3,8}\b|stroke=|fill=/i);
  });

  test('is idempotent', () => {
    const once = cycle.applyToHtml(slide('cycle'));
    assert.equal(cycle.applyToHtml(once), once);
  });

  test('skips other components, a lone stage, and a split page', () => {
    const other = slide('list-steps');
    assert.equal(cycle.applyToHtml(other), other);
    const lone = slide('cycle', '<ul><li>Only</li></ul>');
    assert.equal(cycle.applyToHtml(lone), lone);
    const split = slide('cycle lat-split-native');
    assert.equal(cycle.applyToHtml(split), split);
  });

  test('leaves an ordered list alone (the stage CSS is ul-only)', () => {
    const ol = slide('cycle', '<ol><li>A</li><li>B</li></ol>');
    assert.equal(cycle.applyToHtml(ol), ol);
  });

  test('finds the list inside the stage cell the masthead lift builds', () => {
    const out = cycle.applyToHtml(slide('cycle form', `<div class="cell-stage">${STAGES}</div>`));
    assert.equal(count(out, 'class="cycle-link"'), 2);
  });
});

describe('cycle connector — DOM arm', () => {
  const makeDoc = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;

  test('inserts the same connectors, in the same places, as the string arm', () => {
    const doc = makeDoc(slide('cycle'));
    cycle.applyToDom(doc);
    const kids = [...doc.querySelectorAll('section.cycle > ul > *')].map((e) => e.className || e.tagName);
    assert.deepEqual(kids, ['LI', 'cycle-link', 'LI', 'cycle-link', 'LI']);
    assert.ok(doc.querySelector('.cycle-link > svg path'));
  });

  test('is idempotent and skips split pages', () => {
    const doc = makeDoc(slide('cycle'));
    cycle.applyToDom(doc);
    cycle.applyToDom(doc);
    assert.equal(doc.querySelectorAll('.cycle-link').length, 2);
    const split = makeDoc(slide('cycle lat-split-native'));
    cycle.applyToDom(split);
    assert.equal(split.querySelectorAll('.cycle-link').length, 0);
  });

  test('string and DOM arms serialize to the same connector markup', () => {
    const doc = makeDoc(cycle.applyToHtml(slide('cycle')));
    const domDoc = makeDoc(slide('cycle'));
    cycle.applyToDom(domDoc);
    const grab = (d) => [...d.querySelectorAll('.cycle-link')].map((e) => e.outerHTML);
    assert.deepEqual(grab(domDoc), grab(doc));
  });
});
