/**
 * Unit: the `q-and-a` pair row keeps a NON-ZERO column gap between the numeral and
 * the question.
 *
 * `--qa-col-gap` looks cosmetic and is not. The answer is given `flex-basis: 100%`
 * to claim its own flex line, but 100% merely EQUALS the line — it does not exceed
 * it. Wherever the numeral is not itself a flex item (`spine`, `tab`), the question
 * contributes a zero basis, so `answer + question` fits the line exactly and the
 * answer lands to the RIGHT of the question, squeezing it to 0px wide: one
 * character per line. Measured on both looks during #2097.
 *
 * The column gap is what makes the sum EXCEED the line, so the break is a fact
 * rather than an accident of how wide the numeral happens to be. Set it to zero and
 * two looks silently collapse.
 *
 * SOURCE-LEVEL, on purpose — the same posture as the sibling checks in this
 * directory. A rendered check needs a browser and a deck per look; the defect is
 * fully visible in the declaration, and the committed goldens already carry the
 * rendered evidence. This test exists because the goldens are the ONLY thing
 * pinning the value today: a golden diff says "these pages changed", not "you
 * removed the lever that guarantees the line break".
 *
 * WHAT THIS DOES NOT PROVE, stated because a gate that reads broader than it is, is
 * worse than a narrow one:
 *
 *   · It reads the DECLARATION, not the rendered line box. A non-zero gap is
 *     necessary for the break, not sufficient — a future rule that gave the question
 *     a real basis, or dropped the answer's `flex-basis: 100%`, would change the
 *     arithmetic without touching either thing asserted here.
 *   · It reads only `q-and-a.styles.css`. An override in `base.modifiers.css`, in a
 *     theme, or in a second stylesheet is invisible to it.
 *   · It does not resolve the token chain. `--sp-2xs` is asserted to be a token
 *     reference, not measured — a theme that redefined `--sp-2xs` to zero would pass
 *     here and still collapse the row.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STYLES = path.resolve(
  __dirname,
  '../../../lib/components/inventory/q-and-a/q-and-a.styles.css',
);

describe('q-and-a pair column gap', () => {
  const css = fs.readFileSync(STYLES, 'utf8');

  test('--qa-col-gap is declared and is not zero', () => {
    const decl = css.match(/--qa-col-gap:\s*([^;]+);/);
    assert.ok(decl, '--qa-col-gap is not declared in q-and-a.styles.css');

    const value = decl[1].trim();
    assert.doesNotMatch(
      value,
      /^0(?:[a-z%]*)$/i,
      `--qa-col-gap is "${value}" — a zero gap lets the answer share the question's ` +
        'flex line and squeeze it to 0px wide (see the docblock).',
    );
    assert.match(
      value,
      /^var\(--/,
      `--qa-col-gap is "${value}" — it should route to a spacing token, not a literal.`,
    );
  });

  test('the pair row spends it as a column-gap', () => {
    // A declared token nothing consumes would pass the assertion above while the row
    // ran with the initial `normal` gap, so the consumption is pinned too.
    assert.match(
      css,
      /column-gap:\s*var\(--qa-col-gap\)/,
      'no rule spends --qa-col-gap as a column-gap; the pair row needs it to force ' +
        'the answer onto its own flex line.',
    );
  });
});
