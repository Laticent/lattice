/**
 * THE EYEBROW POSITION IS SHADOWED BY THE INLINE DIRECTIVE GRAMMAR, AND THIS
 * KEEPS THAT HARMLESS RATHER THAN MERELY ASSERTED.
 *
 * The eyebrow kicker is a POSITION, not a register: a paragraph whose only child
 * is inline code, immediately before a heading or a list. The rule that promotes
 * it (`base.modifiers.css`) is
 *
 *     section p:has(> code:only-child):has(+ h1), … :has(+ ul), … :has(+ pre)
 *
 * — and `> code:only-child` names an ELEMENT. `{LABEL}` pills and `[x]` marks
 * replace that `<code>` with a `<span>`, so the paragraph stops matching and the
 * promotion silently drops: the author gets a pill alone on a line where they
 * wrote a kicker. Nothing throws, nothing lints, and the slide just looks wrong.
 *
 * WHY THIS IS A CENSUS AND NOT A FIXTURE. A fixture would assert that one crafted
 * pill fails to become an eyebrow — pinning the shadow, which is not the risk. The
 * risk is an AUTHOR writing one, in a deck, by accident. So this walks every deck
 * we ship and asserts none does. When #2066 landed the count was 1,273 spans and
 * zero collisions; a real eyebrow reads `Section 01` or
 * `H1 FY26 · 1,840 person-hours`, and none starts with a brace or is a bare marker.
 *
 * THE DECISION IT SPEAKS FOR is deliberate: the selector was NOT widened to accept
 * `.lat-pill`. Letting a pill be a kicker is a real capability (`{Q3 REVIEW}:c2` as
 * a colored eyebrow) and the eyebrow's mono-caps, letterspaced styling would fight
 * the pill chrome — a visual design task with a review pass, not a selector edit.
 * See `engineering/decisions/2026-05-11-inline-code-directives.md`
 * § AMENDMENT 2026-09-06.
 *
 * IT ASKS THE KERNEL, NOT A COPY OF THE GRAMMAR. `dispatches()` is the same
 * predicate both render paths use (HARD RULE #1), so widening or narrowing the
 * grammar moves this test with it. A re-implemented regex here would drift and
 * then certify a collision it no longer recognizes.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const { dispatches } = require(path.join(ROOT, 'lib/core/inline-code-directives.js'));
const { isLiteralFromSource } = require(path.join(ROOT, 'lib/core/resolve-inline-code.js'));

/** The decks we SHIP — the ones a reader sees and the ones we hold to our own bar. */
function shippedDecks() {
  const out = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(
    (f) =>
      f.startsWith('examples/') ||
      f.startsWith('kit/') ||
      f.endsWith('.gallery.md') ||
      f.startsWith('test/integration/baseline-decks/'),
  );
}

const FENCE = /^(```|~~~)/;
/** A paragraph that is EXACTLY one inline-code span — the eyebrow's own shape. */
const ONLY_CODE = /^`([^`]+)`$/;
/** What the eyebrow rule accepts as the next block: a heading, a list, or a fence. */
const PROMOTES_AFTER = /^(#{1,5}\s|[-*+]\s|\d+\.\s|```)/;

/** Every eyebrow-position span in a deck, with the line it sits on. */
function eyebrowSpans(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  // A deck that turns the grammar OFF has no shadow to warn about — the `<code>` survives
  // and the kicker promotes normally. Without this the census failed a CORRECT deck and
  // told its author to escape something that needs no escaping, which is worse than not
  // checking: both halves shipped in one PR and neither knew about the other.
  if (isLiteralFromSource(src)) return [];
  const lines = src.split('\n');
  const found = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    // A fence's CONTENT is not inline code, so no directive is ever read inside one.
    if (FENCE.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const m = ONLY_CODE.exec(line);
    if (!m) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j += 1;
    if (j >= lines.length || !PROMOTES_AFTER.test(lines[j].trim())) continue;
    found.push({ file, line: i + 1, text: m[1] });
  }
  return found;
}

test('no shipped deck writes an eyebrow the directive grammar would swallow', () => {
  const spans = shippedDecks().flatMap(eyebrowSpans);

  // ANTI-VACUITY, and it is the whole guard here: "zero collisions" is trivially
  // true of an empty list, so a scanner broken by a markdown change (a different
  // fence marker, a heading style) would certify nothing and pass forever. The
  // floor is deliberately far below the 1,273 measured at #2066 — this pins that
  // the walk still WORKS, not the exact corpus size, which moves every time a
  // deck is added.
  assert.ok(
    spans.length >= 200,
    `found only ${spans.length} eyebrow-position spans — the scanner is probably broken, not the decks fixed`,
  );

  const swallowed = spans.filter((s) => dispatches(s.text));
  assert.deepEqual(
    swallowed,
    [],
    'these eyebrow labels dispatch as a pill or a mark, so they render as themselves ' +
      'and LOSE the kicker promotion:\n' +
      swallowed.map((s) => `  ${s.file}:${s.line}  \`${s.text}\``).join('\n') +
      '\nEscape it (`\\{LABEL}` keeps the <code> and keeps the eyebrow) or pick a label ' +
      'that is not a directive.',
  );
});

test('the escape keeps an eyebrow an eyebrow', () => {
  // The remedy the failure message above offers has to actually work, or the test
  // is telling authors to do something that does not help. `escapedText` strips the
  // backslash and the element STAYS a `<code>` (verified in the rendered DOM:
  // `<p><code data-lat-escaped="">{DRAFT}</code></p>` before an `<h1>`), so the
  // selector still matches.
  assert.equal(dispatches('{DRAFT}'), true, 'precondition: the bare form would dispatch');
  assert.equal(dispatches('\\{DRAFT}'), false, 'the escaped form must not dispatch');
});
