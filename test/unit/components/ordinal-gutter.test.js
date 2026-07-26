/**
 * Unit: an absolutely-positioned ORDINAL must reserve its own room.
 *
 * A component that numbers its rows with a counter `::before` has two choices. Make the
 * ordinal a FLEX ITEM (list, list-tabular, list-criteria, authority-chain, agenda,
 * regulatory-update) and the row's own layout keeps the text clear of it — nothing to get
 * wrong. Or position it ABSOLUTELY, which `inventory` must do because its row stacks a
 * block `<strong>` title over its body prose and an in-flow ordinal would break that
 * stack. An absolute ordinal is out of flow, so it pushes nothing: the row has to reserve
 * the room itself, and the two sizes have to agree.
 *
 * They didn't. `inventory` sized the gutter in CONTAINER units (`padding-left: 5cqi`) and
 * the numeral in TYPE units (`font-size: var(--fs-h3)`). Those track different things, so
 * the pairing only held at some widths — in a landscape box 5cqi is ~96px and cleared the
 * 34px numeral, but in a PORTRAIT box it collapses to 50px while `01` still renders 69px,
 * and the ordinal sat 19px inside the title on every portrait inventory slide. It shipped
 * that way because the component's own demo and gallery are landscape.
 *
 * The fix is structural — one custom property sizes the ordinal's box, and the row's
 * gutter is that plus a gap — so the two CANNOT drift apart again. This test pins that
 * structure. It is a SOURCE check, not a geometric one: measuring the real overlap needs a
 * browser at a portrait size, and the rendered-invariant tier frames every component at
 * 1280×720, the one orientation where this bug does not reproduce. So it guards the exact
 * regression (re-hardcoding one side in units the other doesn't share) and claims nothing
 * more. See engineering/decisions/2026-07-22-structure-derived-split-patterns.md.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const INVENTORY_CSS = path.join(ROOT, 'lib', 'components', 'inventory', 'inventory', 'inventory.styles.css');

describe('components: an absolutely-positioned ordinal reserves its own gutter', () => {
  const css = fs.readFileSync(INVENTORY_CSS, 'utf8');
  // The ledger variant's three rules, keyed on their distinctive declarations.
  const ruleFor = (needle) => {
    const at = css.indexOf(needle);
    assert.ok(at >= 0, `inventory.styles.css no longer contains ${needle}`);
    const open = css.lastIndexOf('{', at);
    const close = css.indexOf('}', at);
    return css.slice(open, close);
  };

  test('the ordinal box and the row gutter both derive from ONE custom property', () => {
    const before = ruleFor('content: counter(r, decimal-leading-zero)');
    const row = ruleFor('counter-increment: r');
    assert.match(before, /position:\s*absolute/, 'the ledger ordinal is the absolute case this guards');
    assert.match(before, /width:\s*var\(--inv-ord-w\)/, 'the ordinal must declare its own box width');
    assert.match(row, /padding:[^;]*var\(--inv-ord-w\)/, "the row's gutter must be derived from that same width");
  });

  test('neither side re-hardcodes a length in units the other does not share', () => {
    const before = ruleFor('content: counter(r, decimal-leading-zero)');
    const row = ruleFor('counter-increment: r');
    // The original defect, exactly: a container-relative gutter against a type-relative
    // numeral. Any bare `cqi`/`cqw`/`%`/`px` length in the row's padding-left re-opens it.
    const padding = (row.match(/padding:\s*([^;]+);/) || ['', ''])[1];
    assert.doesNotMatch(padding, /\d\s*(cqi|cqw|cqmin|cqmax|%)/, `the row gutter must not be container-relative: "${padding}"`);
    assert.doesNotMatch(before, /width:\s*\d/, 'the ordinal box must not re-hardcode a raw width');
  });

  test('--inv-ord-w is defined on the list, and scales with the ordinal type size', () => {
    const list = ruleFor('--inv-ord-w');
    assert.match(list, /--inv-ord-w:\s*calc\(var\(--fs-h3\)/, 'the ordinal box must track the type size it is set in');
    const before = ruleFor('content: counter(r, decimal-leading-zero)');
    assert.match(before, /font-size:\s*var\(--fs-h3\)/, '…which must be the size the ordinal actually renders at');
  });
});
