/**
 * CENSUS: every `list-tabular` rule that grid-PLACES a trailing `code` owes the inline
 * pill the same cell.
 *
 * WHY A CENSUS AND NOT AN EXAMPLE. `{LABEL}` decodes to a `<span>`, and every placement
 * rule in the component selects `code` — the ELEMENT. A span therefore gets no definite
 * placement and auto-places into the first free cell. Measured before the fix: on
 * `1. Row one \`META\` and \`{PILL}\``, the code took column 4 and the pill landed in
 * column 2, shoving the row name out to x=0 in the counter column; on `def` the pill
 * landed at the name's own x.
 *
 * The failure mode this guards is a NEW variant: someone adds `list-tabular flag`, gives
 * its `code` a column, and the pill silently stops being placed on that variant only.
 * An example test would not notice, because it would not have a `flag` fixture.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'lib', 'components', 'inventory', 'list-tabular', 'list-tabular.styles.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, ''); // comments quote selectors; match only live rules

/** Variant compound of a selector, e.g. `.def`, `.spec.stacked`, or '' for the base. */
function variantOf(selector) {
  const head = selector.split('ol')[0];
  const classes = [...head.matchAll(/\.([a-z][\w-]*)/g)]
    .map((m) => m[1])
    .filter((c) => c !== 'list-tabular');
  return classes.sort().join('.');
}

describe('list-tabular — an inline pill is placed wherever a trailing code is', () => {
  const rules = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, sel, body]) => ({
    sel: sel.trim().replace(/\s+/g, ' '),
    body,
  }));

  const placesCode = rules.filter(
    (r) => /li > code(?![\w-])/.test(r.sel) && /grid-column\s*:/.test(r.body),
  );
  const placesPill = rules.filter(
    (r) => /li > \.lat-pill(?![\w-])/.test(r.sel) && /grid-column\s*:/.test(r.body),
  );

  test('the census is not vacuous — the component really does place codes', () => {
    assert.ok(placesCode.length >= 4, `only ${placesCode.length} code-placing rules found`);
    assert.ok(placesPill.length >= 3, `only ${placesPill.length} pill-placing rules found`);
  });

  test('every variant that places a code also places a pill', () => {
    const codeVariants = new Set(placesCode.map((r) => variantOf(r.sel)));
    const pillVariants = new Set(placesPill.map((r) => variantOf(r.sel)));

    // `spec` is the ONE declared exemption, and it is a real limit rather than an
    // oversight: it addresses its two codes by `:first-of-type` / `:nth-of-type(2)`,
    // element-type counters that cannot see a span at all. A spec row whose KEY is a
    // pill is not expressible; its trailing chip falls to the base rule, which is the
    // common shape. Documented in base.docs.md.
    const EXEMPT = new Set(['spec']);

    const missing = [...codeVariants].filter((v) => !pillVariants.has(v) && !EXEMPT.has(v));
    assert.deepEqual(missing, [], `variant(s) place a code but not a pill: ${missing.join(', ')}`);

    // and the exemption must not rot — if spec ever gains a pill rule, drop it here.
    for (const v of EXEMPT) {
      assert.ok(codeVariants.has(v), `stale exemption: no ${v} rule places a code any more`);
    }
  });

  test('a placed pill is anchored in its cell, never left to stretch', () => {
    for (const r of placesPill) {
      assert.match(r.body, /justify-self\s*:/, `${r.sel} places a pill without anchoring it`);
    }
  });
});
