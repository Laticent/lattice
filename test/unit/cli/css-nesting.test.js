/**
 * Unit: tools/build-css.js — sources written with native CSS nesting (NESTED_SOURCES).
 *
 * Covers:
 *   1. every nested source reaches the bundle FLAT: no `&`, no style rule inside a style rule
 *   2. the lowered rules, once distributed, carry no leading `:is()` (the bundle ships them split)
 *   3. guard G6: a selector-list parent whose arms differ in specificity refuses the build
 *   4. the guard passes the equal-arm shape the nested sources use
 *
 * Decision note: engineering/decisions/2026-11-19-nesting-spike.md.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const csstree = require('css-tree');
const { NESTED_SOURCES, lowerNesting, assertEqualIsArms, bundle } = require('../../../tools/build-css');
const { distributeLeadingIs, leadingIsArms, splitSelectorList } = require('../../../lib/core/leading-is');

const ROOT = path.join(__dirname, '..', '..', '..');

/** Every style rule's selector list, and whether any style rule sits inside another. */
function styleRules(css) {
  const ast = csstree.parse(css, { parseValue: false, parseRulePrelude: false, parseAtrulePrelude: false });
  const preludes = [];
  let nested = 0;
  csstree.walk(ast, {
    visit: 'Rule',
    enter(rule) {
      preludes.push(csstree.generate(rule.prelude));
      rule.block.children.forEach((child) => { if (child.type === 'Rule') nested += 1; });
    },
  });
  return { preludes, nested };
}

describe('build-css: native CSS nesting in sources', () => {
  test('the list names at least one source, and each exists', () => {
    assert.ok(NESTED_SOURCES.size > 0);
    for (const rel of NESTED_SOURCES) assert.ok(fs.existsSync(path.join(ROOT, rel)), rel);
  });

  for (const rel of NESTED_SOURCES) {
    test(`${rel} is written nested and ships flat`, () => {
      const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      assert.match(source, /^\s*&/m, 'the source is expected to use nesting; drop it from NESTED_SOURCES if it no longer does');
      const lowered = lowerNesting(source, rel);
      const { preludes, nested } = styleRules(lowered);
      assert.equal(nested, 0, 'a style rule is still nested inside another after lowering');
      assert.ok(preludes.length > 100, `expected the reflow rules, got ${preludes.length}`);
      for (const p of preludes) assert.doesNotMatch(p, /&/, `a selector still carries &: ${p.slice(0, 120)}`);
    });

    test(`${rel}: distributed, no selector keeps a leading :is()`, () => {
      const lowered = distributeLeadingIs(lowerNesting(fs.readFileSync(path.join(ROOT, rel), 'utf8'), rel));
      for (const p of styleRules(lowered).preludes) {
        for (const sel of splitSelectorList(p)) assert.equal(leadingIsArms(sel.trim()), null, sel.trim().slice(0, 120));
      }
    });
  }

  test('the bundle carries no nesting `&` from any nested source', () => {
    for (const p of styleRules(bundle()).preludes) assert.doesNotMatch(p, /(^|[\s,>+~(])&/, p.slice(0, 120));
  });

  test('G6: unequal arms under a list parent refuse the build', () => {
    const css = '.a, .b.c { & > .x { color: red; } }';
    assert.throws(() => lowerNesting(css, 'fixture.css'), /differ in specificity \(0,1,0 vs 0,2,0\)/);
  });

  test('G6: equal arms, including a zero-weight :where(), pass', () => {
    const css = 'section > :where(.s) > table.t, section > table.t { &:not(.h) > tbody { color: red; } }';
    const lowered = lowerNesting(css, 'fixture.css');
    assert.match(lowered, /^:is\(/m);
    assert.doesNotThrow(() => assertEqualIsArms(lowered, 'fixture.css'));
  });
});
