/**
 * Unit: the premise kernel's live-DOM adapter (lib/core/premise.js `applyToDom`)
 * and its parity with the HTML-string path.
 *
 * The DOM adapter is the route an Export-to-Marp bundle takes: marp-core renders
 * the deck and never runs Lattice's markdown-it plugins, so before the mirror
 * existed a premise slide came out of `npm run pdf` as a loose `<h2>` beside a
 * collapsed ordinal rail (#1256). Both adapters must produce the same
 * `.premise-claim` grouping from the same input.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const kernel = require('../../../lib/core/premise');
const adapter = require('../../../lib/transformers/premise');

const LEDGER = '<ol><li>Remember<ul><li>Recall facts.</li><li>How?</li></ul></li></ol>';
const INNER = `<h2>Growth is a change in thinking.</h2><p>Six cognitive verbs.</p>${LEDGER}`;

const dom = (inner, cls = 'premise') =>
  new JSDOM(`<article><section class="${cls}">${inner}</section></article>`).window.document;

describe('premise — applyToDom', () => {
  test('groups the h2 + lede into .premise-claim, leaving the ledger in place', () => {
    const doc = dom(INNER);
    kernel.applyToDom(doc);
    const section = doc.querySelector('section.premise');
    const claim = section.querySelector(':scope > .premise-claim');
    assert.ok(claim, 'a .premise-claim wrapper was created');
    assert.equal(claim.children.length, 2);
    assert.equal(claim.children[0].tagName, 'H2');
    assert.equal(claim.children[1].tagName, 'P');
    // The ledger is untouched and still a direct child, after the claim.
    assert.equal(section.children.length, 2);
    assert.equal(section.children[1].tagName, 'OL');
    assert.equal(section.querySelectorAll('ol > li').length, 1);
  });

  test('matches the HTML-string path byte for byte', () => {
    const doc = dom(INNER);
    kernel.applyToDom(doc);
    assert.equal(
      doc.querySelector('section.premise').innerHTML,
      kernel.transformPremiseSection(INNER),
    );
  });

  test('is idempotent — the runtime re-runs it on every preview pass', () => {
    const doc = dom(INNER);
    kernel.applyToDom(doc);
    const once = doc.querySelector('section.premise').innerHTML;
    kernel.applyToDom(doc);
    kernel.applyToDom(doc);
    assert.equal(doc.querySelector('section.premise').innerHTML, once);
  });

  test('leaves a non-premise section alone', () => {
    const doc = dom(INNER, 'content');
    kernel.applyToDom(doc);
    assert.equal(doc.querySelector('section.content').innerHTML, INNER);
  });

  test('no-ops without an h2, or when the h2 is not followed by a lede paragraph', () => {
    for (const inner of [`<p>Lede only.</p>${LEDGER}`, `<h2>Claim</h2>${LEDGER}`]) {
      const doc = dom(inner);
      kernel.applyToDom(doc);
      assert.equal(doc.querySelector('section.premise').innerHTML, inner);
    }
  });

  test('survives a null / non-DOM root', () => {
    assert.doesNotThrow(() => kernel.applyToDom(null));
    assert.doesNotThrow(() => kernel.applyToDom({}));
  });

  test('the registry adapter exposes applyToDom and delegates to the kernel', () => {
    assert.equal(typeof adapter.applyToDom, 'function');
    const doc = dom(INNER);
    adapter.applyToDom(doc);
    assert.ok(doc.querySelector('section.premise > .premise-claim'));
  });
});
