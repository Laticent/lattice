/**
 * Unit: the inventory ledger prints exactly ONE ordinal per row.
 *
 * The ordinal hangs off the row's lead, the label the slot-label lift wraps it in
 * (`li > .lat-label:first-child::before`), so it tracks the title wherever the row puts
 * it — see the docblock on the rule itself. It hung off `li > strong:first-child` until W3
 * (bold is emphasis, never structure), and the `:first-child` there is what kept a row
 * written `- **Lead.** body with a **bold** word` from printing `01` twice. The label is
 * the engine's own element now, so an author's bold cannot be the lead at all; the
 * `:first-child` scope stays as the shape both arms agree on.
 *
 * The second arm is the complement: a row with no label (a renderer that skips the lift)
 * has nothing to hang off, so it keeps the row-anchored placement. The two arms must
 * complement on the SAME predicate, or a row satisfies neither and renders with no
 * ordinal at all.
 *
 * SOURCE-LEVEL, on purpose — the same posture as the sibling checks here.
 *
 * WHAT THIS DOES NOT PROVE: it checks the SELECTORS, not the rendered page; it reads only
 * `inventory.styles.css`; and it says nothing about WHERE either ordinal lands.
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

  test('the lead arm hangs off the engine label, scoped to :first-child', () => {
    const lead = rowBefores.filter((s) => !/:has\(/.test(s));
    assert.ok(lead.length > 0, 'no lead-anchored ordinal arm found');
    for (const sel of lead) {
      assert.match(
        sel,
        /> \.lat-label:first-child::before$/,
        `"${sel}" does not hang the ordinal off the row's label (\`> .lat-label:first-child\`).`,
      );
    }
  });

  test('the two arms complement on the same predicate', () => {
    const fallback = rowBefores.filter((s) => /:has\(/.test(s));
    assert.ok(fallback.length > 0, 'no row-anchored fallback arm found');
    for (const sel of fallback) {
      assert.match(
        sel,
        /li:not\(:has\(> \.lat-label:first-child\)\)::before$/,
        `"${sel}" does not complement the lead arm on \`> .lat-label:first-child\`. ` +
          'A row would then match neither arm and render with no ordinal at all.',
      );
    }
  });
});
