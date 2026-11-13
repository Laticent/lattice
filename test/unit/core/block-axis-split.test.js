/**
 * Unit: the `block` axis — a prose slide splits between its top-level blocks on a measured plan
 * (lib/core/split-envelope.js `blockSpans`, `deriveAxis`, `splitEnvelope`; owner, 2026-11-13,
 * engineering/decisions/2026-10-28-fit-everywhere-model.md §23). Rendered through the real engine,
 * so the section shapes are the ones it emits.
 *
 * FALSIFIABLE: without the `block` branch in `deriveAxis`, a paragraph-only content slide derives no
 * axis and never splits; without `beatsOnly`, one paragraph and a key insight stay whole; without the
 * measured-only guard, `fit: heal` would cut paragraphs by a count that means nothing for prose.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine');
const { splitSections } = require('@laticent/markup');
const { blockSpans, deriveAxis, splitEnvelope, chromeOf } = require('../../../lib/core/split-envelope');
const { planSlide } = require('@laticent/fluido');

const sectionOf = (body) => {
  const { html } = createEngine().render(`---\ntheme: indaco\n---\n\n<!-- _class: content -->\n\n${body}\n`, 'indaco');
  const [s] = splitSections(html).filter((p) => p.type === 'section');
  return s;
};
const bodies = (parts) => parts.filter((x) => /\sdata-split-role="body"/.test(x));

describe('the block axis: a prose slide splits between its blocks', () => {
  const three = sectionOf('## Three paragraphs.\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.');

  test('the members are the stage blocks; the heading is not one', () => {
    assert.equal(blockSpans(three.inner).length, 3);
    assert.equal(deriveAxis(three.inner, ['item']), 'block');
  });

  test('a measured plan cuts between the blocks, each once, in order', () => {
    const parts = splitEnvelope(three.openTag, three.inner, chromeOf(three.inner), { axis: 'block', per: [2, 1] });
    const body = bodies(parts);
    assert.equal(body.length, 2);
    assert.match(body[0], /First paragraph[\s\S]*Second paragraph/);
    assert.doesNotMatch(body[0], /Third paragraph/);
    assert.match(body[1], /Third paragraph/);
    assert.doesNotMatch(body[1], /First paragraph|Second paragraph/);
  });

  test('no measured plan, no cut: paragraphs have no count a page', () => {
    assert.equal(splitEnvelope(three.openTag, three.inner, chromeOf(three.inner), { axis: 'block', per: 1 }), null);
  });

  test('a plan that does not place every block is refused', () => {
    assert.equal(splitEnvelope(three.openTag, three.inner, chromeOf(three.inner), { axis: 'block', per: [1, 1] }), null);
  });

  test('one block and a key insight split so the insight leaves the page; one block alone does not', () => {
    const withBeat = sectionOf('## One paragraph.\n\nThe only paragraph.\n\n> The insight that rides it.');
    const parts = splitEnvelope(withBeat.openTag, withBeat.inner, chromeOf(withBeat.inner), { axis: 'block', per: [1] });
    assert.ok(parts && parts.length >= 2, `expected a cover and pages, got ${parts && parts.length}`);
    const alone = sectionOf('## One paragraph.\n\nThe only paragraph.');
    assert.equal(splitEnvelope(alone.openTag, alone.inner, chromeOf(alone.inner), { axis: 'block', per: [1] }), null);
  });

  test('a content slide with a list keeps its item seam', () => {
    const list = sectionOf('## A list.\n\nA lead line.\n\n- one\n- two\n- three');
    assert.equal(deriveAxis(list.inner, ['item']), 'item');
  });
});

describe('Fluido: one member paginates only on a measured plan', () => {
  const facts = { enrolled: true, recipe: null, reSplit: false, seam: 'block', members: 1 };
  test('unmeasured, one member stays whole', () => {
    assert.equal(planSlide(facts).kind, 'whole');
  });
  test('measured, one member paginates', () => {
    assert.equal(planSlide({ ...facts, measured: true }).kind, 'paginate');
  });
  test('measured, no member stays whole', () => {
    assert.equal(planSlide({ ...facts, members: 0, measured: true }).kind, 'whole');
  });
});

describe('the block axis: what the maker-checker review found', () => {
  test('loose text between two blocks rides the page before the cut, never dropped', () => {
    const s = sectionOf('## Loose text.\n\n<div>block one</div>\nstray text after the div\n\nSecond paragraph.\n\nThird paragraph.');
    const n = blockSpans(s.inner).length;
    const plan = n === 3 ? [1, 2] : [n - 1, 1];
    const parts = splitEnvelope(s.openTag, s.inner, chromeOf(s.inner), { axis: 'block', per: plan });
    assert.ok(parts, `no split for ${n} blocks`);
    assert.equal(bodies(parts).join('').split('stray text after the div').length - 1, 1, 'the loose text is on exactly one page');
  });

  test('a one-item list is one block, so the slide still has a prose seam', () => {
    const s = sectionOf('## One item.\n\nA lead.\n\n- only item\n\nA tail paragraph.');
    assert.equal(deriveAxis(s.inner, ['item']), 'block');
  });

  test('an inline svg in a paragraph (a math root sign) does not make the slide a figure', () => {
    const s = sectionOf('## Math.\n\nFirst <svg viewBox="0 0 10 10"></svg> paragraph.\n\nSecond paragraph.');
    assert.equal(deriveAxis(s.inner, ['item']), 'block');
  });

  test('a prose run\'s pages report their blocks as members, so the run carries its pointer', () => {
    const { membersIn } = require('../../../lib/core/relationship');
    const s = sectionOf('## Members.\n\nOne.\n\nTwo.');
    assert.equal(membersIn(s.inner, 'block').length, 2);
  });
});
