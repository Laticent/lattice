/**
 * Unit: lib/slot-label-lift.js — auto-wrap slot label in <strong>.
 *
 * Used by named-slot layouts (decision, compare-prose) so
 * authors can write `- Build` instead of `- **Build**` and still get
 * the corner-tag chrome. The function is pure HTML→HTML and runs
 * downstream of markdown-it parsing, so inputs reflect the parser's
 * canonical shape: a <p>-wrapped lead followed by a nested <ul>/<ol>.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { liftSlotLabel } = require('../../../lib/core/slot-label-lift');

describe('slot-label-lift', () => {
  // ── happy path ──────────────────────────────────────────────────────────

  test('lift: wraps plain p-wrapped lead in <strong>', () => {
    const input  = '<p>Build</p><ul><li>body</li></ul>';
    const output = liftSlotLabel(input);
    assert.equal(output, '<strong>Build</strong><ul><li>body</li></ul>');
  });

  test('lift: wraps lead text without <p> wrapper', () => {
    // markdown-it sometimes emits inline-only leads without a <p> wrapper
    // (e.g. when the markdown is `Build\n  - body` and the AST chooses
    // to keep them inline). Lift should still fire.
    const input  = 'Build<ul><li>body</li></ul>';
    const output = liftSlotLabel(input);
    assert.equal(output, '<strong>Build</strong><ul><li>body</li></ul>');
  });

  test('lift: works with <ol> body just like <ul>', () => {
    const input  = '<p>Step</p><ol><li>one</li></ol>';
    const output = liftSlotLabel(input);
    assert.equal(output, '<strong>Step</strong><ol><li>one</li></ol>');
  });

  // ── idempotency ─────────────────────────────────────────────────────────

  test('lift: leaves already-wrapped <strong> lead alone (idempotent)', () => {
    // Author wrote `- **Build**` already → markdown emits <strong>Build</strong>
    // wrapped in <p>. Lift should NOT double-wrap.
    const input  = '<p><strong>Build</strong></p><ul><li>body</li></ul>';
    const output = liftSlotLabel(input);
    assert.equal(output, '<strong>Build</strong><ul><li>body</li></ul>');
  });

  test('lift: idempotent when already-wrapped without <p>', () => {
    const input  = '<strong>Build</strong><ul><li>body</li></ul>';
    const output = liftSlotLabel(input);
    assert.equal(output, '<strong>Build</strong><ul><li>body</li></ul>');
  });

  test('lift: running twice yields the same result', () => {
    const input  = '<p>Build</p><ul><li>body</li></ul>';
    const once   = liftSlotLabel(input);
    const twice  = liftSlotLabel(once);
    assert.equal(once, twice);
  });

  // ── no-op cases ─────────────────────────────────────────────────────────

  test('lift: returns input unchanged when there is no nested ul/ol body', () => {
    // No nested list = not a slot-label layout shape. Hands-off.
    const input  = '<p>Just a paragraph, no list</p>';
    assert.equal(liftSlotLabel(input), input);
  });

  test('lift: returns input unchanged when lead is empty (only <ul>)', () => {
    const input  = '<ul><li>just a body</li></ul>';
    assert.equal(liftSlotLabel(input), input);
  });

  test('lift: returns input unchanged when lead is whitespace-only', () => {
    const input  = '   \n  <ul><li>body</li></ul>';
    assert.equal(liftSlotLabel(input), input);
  });

  // ── inline markup inside lead ───────────────────────────────────────────

  test('lift: preserves inline <em> inside the lead', () => {
    const input  = '<p>Why <em>not</em> buy</p><ul><li>body</li></ul>';
    const output = liftSlotLabel(input);
    assert.equal(output, '<strong>Why <em>not</em> buy</strong><ul><li>body</li></ul>');
  });

  test('lift: preserves inline <code> inside the lead', () => {
    const input  = '<p>Build <code>v2</code></p><ul><li>body</li></ul>';
    const output = liftSlotLabel(input);
    assert.equal(output, '<strong>Build <code>v2</code></strong><ul><li>body</li></ul>');
  });

  // ── chipTail (actors actor-name pill) ───────────────────────────────────

  test('lift: chipTail keeps a trailing <code> chip outside the <strong>', () => {
    const input  = '<p>Owns the model <code>Head of Product</code></p><ul><li>body</li></ul>';
    const output = liftSlotLabel(input, { chipTail: true });
    assert.equal(output, '<strong>Owns the model</strong> <code>Head of Product</code><ul><li>body</li></ul>');
  });

  test('lift: chipTail leaves mid-lead <code> nested in the <strong>', () => {
    // Only a TRAILING code run is split off; code followed by text stays in.
    const input  = '<p>Build <code>v2</code> now</p><ul><li>body</li></ul>';
    const output = liftSlotLabel(input, { chipTail: true });
    assert.equal(output, '<strong>Build <code>v2</code> now</strong><ul><li>body</li></ul>');
  });

  test('lift: chipTail with no trailing code behaves like the default', () => {
    const input  = '<p>Owns the model</p><ul><li>body</li></ul>';
    assert.equal(
      liftSlotLabel(input, { chipTail: true }),
      liftSlotLabel(input),
    );
  });

  test('lift: chipTail is idempotent on already-authored `**label** `code``', () => {
    const input  = '<p><strong>Owns the model</strong> <code>Head of Product</code></p><ul><li>body</li></ul>';
    const output = liftSlotLabel(input, { chipTail: true });
    assert.equal(output, '<strong>Owns the model</strong> <code>Head of Product</code><ul><li>body</li></ul>');
  });

  test('lift: chipTail off (default) keeps a trailing chip inside the <strong>', () => {
    const input  = '<p>Owns the model <code>Head of Product</code></p><ul><li>body</li></ul>';
    const output = liftSlotLabel(input);
    assert.equal(output, '<strong>Owns the model <code>Head of Product</code></strong><ul><li>body</li></ul>');
  });

  test('lift: chipTail splits a RUN of trailing <code> chips (unrolled inner still matches)', () => {
    // The hardened `(?:[^<]|<(?!\/code>))*` inner must still match a multi-chip run —
    // each `<code>…</code>` unit is delimited unambiguously up to its own closing tag.
    const input  = '<p>Owns the model <code>PM</code> <code>Design</code></p><ul><li>body</li></ul>';
    const output = liftSlotLabel(input, { chipTail: true });
    assert.equal(output, '<strong>Owns the model</strong> <code>PM</code> <code>Design</code><ul><li>body</li></ul>');
  });

  test('lift: chipTail handles a chip whose text contains an escaped angle bracket', () => {
    // markdown-it escapes `<`/`>` to entities, so a chip body never holds a literal `<`;
    // the entity form must ride along inside the split-off chip untouched.
    const input  = '<p>Range <code>a &lt; b</code></p><ul><li>body</li></ul>';
    const output = liftSlotLabel(input, { chipTail: true });
    assert.equal(output, '<strong>Range</strong> <code>a &lt; b</code><ul><li>body</li></ul>');
  });

  test('lift: chipTail chip body with a LITERAL nested `<` tag is kept whole (unrolled `<(?!/code>)` fires)', () => {
    // The one input where the `<(?!\/code>)` alternative actually does work: a chip body
    // holding a raw `<` that does NOT begin the closing `</code>`. It must be consumed as
    // chip content, so the split runs to the FIRST real `</code>`, not an inner `<`.
    const input  = '<p>Owns <code>a <b>x</b> z</code></p><ul><li>body</li></ul>';
    const output = liftSlotLabel(input, { chipTail: true });
    assert.equal(output, '<strong>Owns</strong> <code>a <b>x</b> z</code><ul><li>body</li></ul>');
  });

  test('lift: chipTail on a long chip-free lead falls through to a plain wrap, fast', () => {
    // The tail regex removed the CodeQL-flagged nested quantifier (a lazy body under `+`).
    // Its outer `\s*(?:…)+$` could cost O(n²) only on a long PURE-whitespace prefix — but
    // the function trims `lead` before this match runs, so that prefix never reaches here.
    // A realistic long label (trimmed, no trailing chip) fails the tail match and plain-wraps.
    const lead   = 'word '.repeat(4000).trim(); // internal spaces only; no leading/trailing run
    const input  = `<p>${lead}</p><ul><li>body</li></ul>`;
    const output = liftSlotLabel(input, { chipTail: true });
    assert.equal(output, `<strong>${lead}</strong><ul><li>body</li></ul>`);
  });

  test('lift: multi-word lead with punctuation', () => {
    const input  = '<p>Why not delay?</p><ul><li>body</li></ul>';
    const output = liftSlotLabel(input);
    assert.equal(output, '<strong>Why not delay?</strong><ul><li>body</li></ul>');
  });

  // ── edge cases ──────────────────────────────────────────────────────────

  test('lift: trims leading/trailing whitespace inside the <p> wrapper', () => {
    const input  = '<p>  Build  </p><ul><li>body</li></ul>';
    const output = liftSlotLabel(input);
    assert.equal(output, '<strong>Build</strong><ul><li>body</li></ul>');
  });

  test('lift: handles <ol> with start attribute (counter-style cards)', () => {
    const input  = '<p>Step</p><ol start="2"><li>x</li></ol>';
    const output = liftSlotLabel(input);
    assert.equal(output, '<strong>Step</strong><ol start="2"><li>x</li></ol>');
  });

  test('lift: only the FIRST nested ul/ol triggers the split (greedy matters)', () => {
    // The regex captures from the start of the string up to the first
    // <ul> or <ol> opener. Anything after — even more lists — stays in
    // the body chunk, untouched.
    const input  = '<p>Build</p><ul><li>a</li></ul><ul><li>b</li></ul>';
    const output = liftSlotLabel(input);
    assert.equal(output, '<strong>Build</strong><ul><li>a</li></ul><ul><li>b</li></ul>');
  });

  test('lift: empty string input', () => {
    assert.equal(liftSlotLabel(''), '');
  });
});

/**
 * The REGISTRY, end to end. `liftSlotLabel` above is the split-panels helper;
 * these arms drive the real markdown-it plugin, which is the path a deck takes.
 *
 * What they pin is the promise the registry makes to authors: a layout on
 * SLOT_LAYOUTS supplies its own item header, so typing `**…**` for one is a
 * NO-OP. That is what lets a deck written the old way keep rendering while the
 * docs teach the plain lead — and it is only true while both shapes come out the
 * same, which no other test checks. `inventory`, `matrix-2x2` and `verdict-grid`
 * joined in #2113 precisely because dropping the asterisks used to leave them
 * with zero `<strong>` at all.
 */
describe('slot-label-lift · registered layouts', () => {
  const MarkdownIt = require('markdown-it');
  const { installSlidePipeline } = require('../../../lib/engine/slides');
  const { slotLabelLift } = require('../../../lib/integrations/markdown-it/plugins');
  const { SLOT_LAYOUTS } = require('../../../lib/core/slot-label-lift');

  const render = (src) => {
    const md = new MarkdownIt('commonmark', { html: true, breaks: true });
    md.enable(['table', 'strikethrough']);
    installSlidePipeline(md);
    md.use(slotLabelLift);
    return md.render(src);
  };
  const strongs = (html) =>
    [...html.matchAll(/<strong>([\s\S]*?)<\/strong>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());

  const NESTED = (cls) => `<!-- _class: ${cls} -->\n\n## Heading.\n\n- First label\n  - First body.\n- Second label\n  - Second body.\n`;
  const BOLDED = (cls) => `<!-- _class: ${cls} -->\n\n## Heading.\n\n- **First label**\n  - First body.\n- **Second label**\n  - Second body.\n`;

  for (const cls of ['inventory', 'matrix-2x2', 'verdict-grid', 'redline']) {
    test(`${cls}: a plain lead becomes the label`, () => {
      assert.deepEqual(strongs(render(NESTED(cls))), ['First label', 'Second label']);
    });

    test(`${cls}: typing the bold is a no-op`, () => {
      assert.deepEqual(strongs(render(BOLDED(cls))), strongs(render(NESTED(cls))));
    });
  }

  test('the label stops at the nested body — it does not swallow it', () => {
    // The regression this change fixed: a `redline` row authored inline had no
    // nested list to delimit the lead, so the lift took the whole line as the
    // label. The nested shape is what bounds it.
    const html = render('<!-- _class: redline -->\n\n## Heading.\n\n- Why this matters\n  - What the amendment changes, in one sentence.\n');
    assert.deepEqual(strongs(html), ['Why this matters']);
  });

  test('every layout the docs now teach a plain lead for is registered', () => {
    // Guards the direction of the change: a future edit that drops one of these
    // from the registry would silently take its header away, and the component's
    // own docs would still be telling authors not to type it.
    for (const cls of ['inventory', 'matrix-2x2', 'verdict-grid', 'redline']) {
      assert.ok(SLOT_LAYOUTS.includes(cls), `${cls} must stay on SLOT_LAYOUTS`);
    }
  });
});
