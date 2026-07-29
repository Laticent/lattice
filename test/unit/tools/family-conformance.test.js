/**
 * Unit: `descopeFamily` — the one piece of the family-tier conformance pass that is pure,
 * and the piece that decides whether the pass measures anything at all.
 *
 * The conformance pass (`tools/check-family-tiers.js --conformance`) answers, per
 * (component × @size), whether a `[data-family]` rule MATCHED and whether it CHANGED a
 * computed value. The second half needs a baseline: the same element, in the `wide`
 * render, where no family rule can apply. `descopeFamily` produces the selector that
 * finds it — the component's own selector with the family predicate stripped off.
 *
 * WHY THIS IS PINNED. The first cut of the pass had no de-scoping, and compared the
 * family-scoped selector's matches at `tall` against its matches at `wide`. At `wide` the
 * section carries no `data-family` attribute at all, so that selector matches NOTHING —
 * every property therefore read as "different from a baseline that does not exist", and
 * all 33 components reported `fires`. A green that could not have gone red. Caught by
 * prototyping the pass against a real render before trusting its output, and this file is
 * the guard so it cannot come back.
 *
 * `descopeFamily` is not exported (the tool is a script, not a module), so the source is
 * read and the function extracted. That is deliberate: exporting it would mean loading a
 * file whose module scope launches a browser and renders five decks.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'tools', 'check-family-tiers.js'), 'utf8');

// Lift the function out by source. If it is renamed or removed, this throws with a clear
// message rather than silently testing nothing.
const descopeFamily = (() => {
  const at = SRC.indexOf('function descopeFamily(');
  assert.ok(at > 0, 'descopeFamily is gone from tools/check-family-tiers.js — the conformance pass cannot measure effect without it');
  // Balance braces from the function head to its close.
  let depth = 0, end = at;
  for (let i = SRC.indexOf('{', at); i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (!depth) { end = i + 1; break; } }
  }
  // eslint-disable-next-line no-new-func
  return new Function(`${SRC.slice(at, end)}; return descopeFamily;`)();
})();

describe('tools: descopeFamily — the wide-baseline selector', () => {
  test('strips the house `:where([data-family=…])` idiom, including a multi-family list', () => {
    // The real selector from inventory's family reflow, and the shape most components use.
    assert.equal(
      descopeFamily('section.inventory.editorial:where([data-family="tall"], [data-family="strip"]) > .cell-stage'),
      'section.inventory.editorial > .cell-stage',
    );
  });

  test('strips a bare inline `[data-family="…"]`', () => {
    assert.equal(descopeFamily('section[data-family="tall"] .inv-pairs'), 'section .inv-pairs');
  });

  test('handles single quotes, no quotes, and the bare attribute', () => {
    for (const s of ['[data-family=\'tall\']', '[data-family=tall]', '[data-family]']) {
      assert.equal(descopeFamily(`section.x${s} > ul`), 'section.x > ul');
    }
  });

  test('leaves a selector with no family predicate untouched', () => {
    // The pass filters to family-scoped rules before calling this, but a caller that
    // stopped filtering must not get a silently mangled selector back.
    assert.equal(descopeFamily('section.stats > .cell-stage > ol'), 'section.stats > .cell-stage > ol');
  });

  test('returns null when the selector was ONLY the family predicate', () => {
    // There is no element to compare against, so the effect test has to be SKIPPED rather
    // than answered with a guess. Returning a bare `> .x` or an empty string would make
    // querySelectorAll throw, or worse, match something unrelated.
    assert.equal(descopeFamily('[data-family="tall"]'), null);
    assert.equal(descopeFamily(':where([data-family="tall"], [data-family="strip"])'), null);
  });

  test('returns null rather than a selector starting with a combinator', () => {
    // `[data-family="tall"] > .cell-stage` de-scopes to `> .cell-stage`, which is not a
    // valid standalone selector — querySelectorAll would throw inside the page and the
    // whole sweep would report nothing for that rule.
    assert.equal(descopeFamily('[data-family="tall"] > .cell-stage'), null);
  });

  test('the house scope is zero-specificity, so removing it cannot change the baseline cascade', () => {
    // This is the assumption the whole effect test rests on: `:where()` contributes no
    // specificity, so the de-scoped selector reads the SAME cascade the component gets at
    // `wide`. If components started scoping with `:is()` (which DOES carry specificity),
    // stripping it could change which rule wins and the baseline would silently measure a
    // different declaration than the one under test.
    //
    // So assert the real stylesheets still use `:where`, over the actual component CSS
    // rather than over a fixture — a doc comment cannot fail, and this must.
    const cssDir = path.join(__dirname, '..', '..', '..', 'lib', 'components');
    const offenders = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) { walk(f); continue; }
        if (!f.endsWith('.css')) continue;
        const css = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        if (/:is\(\s*\[data-family/.test(css)) offenders.push(path.relative(cssDir, f));
      }
    };
    walk(cssDir);
    assert.deepEqual(offenders, [],
      'a component scopes a family rule with `:is([data-family…])`, which carries specificity — '
      + 'descopeFamily strips it and the conformance baseline would then read a different cascade. '
      + 'Use `:where(…)` (zero specificity), or teach descopeFamily to account for it.');

    assert.equal(descopeFamily('a:where([data-family="tall"]) b'), 'a b');
  });
});
