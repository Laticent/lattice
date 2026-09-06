/**
 * Unit: the inventory ledger prints exactly ONE ordinal per row.
 *
 * The ordinal hangs off the row's bold lead (`li > strong:first-child::before`)
 * so it tracks the title wherever the row puts it — see the docblock on the rule
 * itself. That placement has a failure mode that is invisible on every deck we
 * ship, and it bit during development:
 *
 *   `- **Lead.** body with a **bold** word`
 *
 * puts TWO <strong> elements directly under the row. A bare `> strong::before`
 * matches both, and the row renders `01` beside the lead AND `01` again beside
 * the mid-sentence bold — measured on a probe deck. `:first-child` is what makes
 * the selector mean "the lead" rather than "any direct-child bold".
 *
 * The second arm is the complement: a row with no lead has nothing to hang off,
 * so it keeps the row-anchored placement. The two arms must complement on the
 * SAME predicate — if one says `strong:first-child` and the other says `strong`,
 * a row whose only strong is mid-sentence satisfies neither and renders with no
 * ordinal at all, which is the same defect wearing the opposite sign.
 *
 * SOURCE-LEVEL, on purpose — the same posture as the sibling checks here. No
 * committed deck contains a row with a mid-sentence bold, so the goldens cannot
 * see this: that is precisely why it needs its own pin rather than riding on
 * golden-diff.
 *
 * WHAT THIS DOES NOT PROVE, stated because a gate that reads broader than it is,
 * is worse than a narrow one:
 *
 *   · It checks the SELECTORS, not the rendered page. It asserts the two arms
 *     exist and complement on the same predicate; it does not re-derive that a
 *     row renders one numeral. `examples/split-envelope` carries the rendered
 *     evidence for the lead arm, and no committed deck exercises the other.
 *   · It reads only `inventory.styles.css`. A `::before` added in
 *     `base.modifiers.css`, in a theme, or in a second stylesheet is invisible.
 *   · It says nothing about WHERE either ordinal lands — only how many there are.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STYLES = path.resolve(
  __dirname,
  '../../../lib/components/inventory/inventory/inventory.styles.css',
);
// The ledger is the default look, scoped away from the three variant structures.
const LEDGER = 'section.inventory:not(.cards):not(.timeline):not(.editorial)';

describe('inventory ledger ordinal arms', () => {
  const css = fs.readFileSync(STYLES, 'utf8');
  // Every selector in the file that ends in `::before` and targets a ledger row.
  // Rules are read as [selector-list]{...}: comments are stripped first, then each
  // list is split on commas, because the two arms share one declaration block.
  const rowBefores = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g)]
    .flatMap(([, list]) => list.split(','))
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter((s) => s.endsWith('::before') && s.startsWith(LEDGER) && / > ul > li\b/.test(s));

  test('the lead arm is scoped to :first-child, not any direct-child strong', () => {
    const lead = rowBefores.filter((s) => !/:has\(/.test(s));
    assert.ok(lead.length > 0, 'no lead-anchored ordinal arm found');
    for (const sel of lead) {
      assert.match(
        sel,
        /> strong:first-child::before$/,
        `"${sel}" matches ANY direct-child <strong>, so a row written ` +
          '`- **Lead.** body with a **bold** word` prints the ordinal twice.',
      );
    }
  });

  test('the two arms complement on the same predicate', () => {
    const fallback = rowBefores.filter((s) => /:has\(/.test(s));
    assert.ok(fallback.length > 0, 'no row-anchored fallback arm found');
    for (const sel of fallback) {
      assert.match(
        sel,
        /li:not\(:has\(> strong:first-child\)\)::before$/,
        `"${sel}" does not complement the lead arm on \`> strong:first-child\`. ` +
          'A row whose only <strong> is mid-sentence would then match neither arm ' +
          'and render with no ordinal at all.',
      );
    }
  });
});
