/**
 * Unit: the two lone-bare-member rules exclude the same members.
 *
 * `base.modifiers.css` § "A LONE BARE MEMBER" is ONE treatment written as TWO rules — one on the
 * `ul`/`ol` (drop the marker, reclaim the indent) and one on the `li` (step the type to
 * `--fs-emphasis`). Both must fire, or neither: half of it leaves a body-size fragment adrift in
 * a page-tall box, which is the defect the treatment exists to remove.
 *
 * They cannot be written identically. `:has()` may not nest inside `:has()`, so the `ul` rule has
 * to hoist its exclusion to a top-level `:not(:has(…))` while the `li` rule can carry it inline.
 * That freedom is what let them drift: the `ul` test was first written with a CHILD combinator
 * (`> li > :is(…)`) against the `li` test's DESCENDANT one, so they agreed on a block directly
 * inside the member and disagreed on anything deeper. The ordinary linked-image idiom
 * `[![icon](x.png)](url)` puts an `<img>` at depth two, and measured on a real render such a
 * member lost its marker without gaining its type step.
 *
 * So this asserts the one thing the shapes cannot show on their face: the SAME exclusion list, and
 * a descendant test on both sides. It reads the built bundle, because that is what ships.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const CSS = path.join(ROOT, 'dist/lattice.css');
const NATIVE = 'section.form.lat-split-native.lat-split-native.lat-split-native.lat-split-native';

/**
 * The two rules of the treatment, found by their DECLARATIONS rather than their selectors —
 * the selectors are the thing under test, so keying on them would beg the question. The `ul`
 * half is the one that drops the marker; the `li` half is the one that steps the type.
 */
function loneMemberRules(css) {
  const out = {};
  // Split on rule boundaries. A selector cannot contain `{` or `}`, so the text between the
  // previous `}` and the next `{` is the prelude, comments included; the last line of it is
  // the selector.
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = m[2];
    const prelude = m[1];
    // The selector is the prelude with any /* … */ comments removed.
    const selector = prelude.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (!selector.startsWith(NATIVE) || !selector.includes(':only-child')) continue;
    if (/list-style:\s*none/.test(body) && /padding-inline-start:\s*0/.test(body)) out.list = selector;
    if (/font-size:\s*var\(--fs-emphasis\)/.test(body)) out.item = selector;
  }
  return out;
}

describe('the lone-bare-member treatment is one rule in two shapes', () => {
  const css = fs.readFileSync(CSS, 'utf8');
  const rules = loneMemberRules(css);

  // The exclusion list as written inside whichever `:not(:has(…))` carries it, plus whatever
  // leads it — `> li ` on the list rule, nothing on the item rule.
  const exclusionOf = (selector) => {
    const m = selector.match(/:not\(:has\(([^)]*?):is\(([^)]*)\)\)\)/) || selector.match(/:not\(:has\(([^)]*)\)\)/);
    if (!m) return null;
    return m.length === 3
      ? { lead: m[1].trim(), list: m[2].split(',').map((x) => x.trim()).sort() }
      : { lead: '', list: m[1].split(',').map((x) => x.trim()).sort() };
  };

  test('the fixture is real — both halves of the treatment are in the bundle', () => {
    assert.ok(rules.list, 'no lone-member rule dropping the marker found in dist/lattice.css');
    assert.ok(rules.item, 'no lone-member rule stepping the type found in dist/lattice.css');
  });

  test('both exclude the SAME element list', () => {
    const a = { ex: exclusionOf(rules.list) };
    const b = { ex: exclusionOf(rules.item) };
    assert.ok(a.ex && b.ex, 'one of the two rules carries no exclusion at all');
    assert.deepEqual(a.ex.list, b.ex.list,
      'the two rules exclude different elements, so a member can match one and not the other:\n'
      + `  ${a.ex.list.join(' ')}\n  ${b.ex.list.join(' ')}`);
  });

  test('both test a DESCENDANT, so a block nested two deep excludes on both sides', () => {
    for (const r of [{ selector: rules.list, ex: exclusionOf(rules.list) },
                     { selector: rules.item, ex: exclusionOf(rules.item) }]) {
      // The `ul` rule's exclusion leads with `> li ` (child li, descendant block); the `li` rule's
      // leads with nothing (descendant of the li itself). Neither may end in a `>`, which is what
      // a child-combinator test looks like and what let them drift apart.
      assert.ok(!/>\s*$/.test(r.ex.lead),
        'a child combinator immediately before the exclusion list means this rule only sees a '
        + `block directly inside the member, while its partner sees any depth:\n  ${r.selector.slice(0, 200)}`);
    }
  });
});
