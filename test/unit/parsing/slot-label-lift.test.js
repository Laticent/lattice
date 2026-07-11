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
