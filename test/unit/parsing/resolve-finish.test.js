/**
 * Unit: the `finish:` register resolver (lib/core/resolve-finish.js).
 *
 * Pure mapping from the deck front-matter `finish:` value to the CSS class
 * tokens the three render paths append to every section. No render — just the
 * register table + the front-matter reader.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  FINISH_REGISTER,
  FINISH_NAMES,
  readFrontMatterFinish,
  isKnownFinish,
  finishClasses,
  finishClassesFromSource,
  isFinishVariantClass,
  sectionIsFinish,
  normalizeSectionFinishClasses,
} = require('../../../lib/core/resolve-finish');

describe('resolve-finish', () => {
  test('finish is BACKDROP-only — the rendering mode (boardroom/sketch) moved to `style:`', () => {
    // Clean break: these are no longer finishes; they resolve to no classes here
    // (and the deck-lint flags them as unknown finish values).
    assert.equal(finishClasses('sketch'), '', 'sketch is a mode, not a finish');
    assert.equal(finishClasses('boardroom'), '', 'boardroom is a mode, not a finish');
    assert.equal(finishClasses('sketch-clean'), '');
    assert.ok(!isKnownFinish('sketch'));
    assert.ok(!isKnownFinish('boardroom'));
  });

  test('none is the no-backdrop baseline', () => {
    assert.equal(finishClasses('none'), '', 'none is the no-class baseline');
    assert.ok(isKnownFinish('none'));
  });

  test('finish presets map to the finish base class + their preset variant', () => {
    assert.equal(finishClasses('atrium'), 'finish finish-atrium');
    assert.equal(finishClasses('meridian'), 'finish finish-meridian');
    assert.equal(finishClasses('strata'), 'finish finish-strata');
    assert.equal(finishClasses('halo'), 'finish finish-halo');
    assert.equal(finishClasses('ledger'), 'finish finish-ledger');
    assert.equal(finishClasses('nimbus'), 'finish finish-nimbus');
    assert.equal(finishClasses('loom'), 'finish finish-loom');
    assert.equal(finishClasses('savile'), 'finish finish-savile');
    assert.equal(finishClasses('gallery'), 'finish finish-gallery');
    assert.equal(finishClasses('canopy'), 'finish finish-canopy');
    // every finish preset carries the base `finish` token (the compositor hook)
    for (const name of ['atrium', 'meridian', 'strata', 'halo', 'ledger', 'nimbus', 'loom', 'savile', 'gallery', 'canopy']) {
      assert.ok(
        finishClasses(name).split(/\s+/).includes('finish'),
        `${name} must include the base finish class`,
      );
    }
  });

  test('none / omitted / unrecognized all resolve to no classes', () => {
    assert.equal(finishClasses('none'), '');
    assert.equal(finishClasses(''), '');
    assert.equal(finishClasses('   '), '');
    assert.equal(finishClasses('atriumm'), '', 'typo → no classes (deck-lint flags it)');
    assert.equal(finishClasses(undefined), '');
    assert.equal(finishClasses(null), '');
  });

  test('value is case- and whitespace-insensitive', () => {
    assert.equal(finishClasses('  Atrium  '), 'finish finish-atrium');
    assert.equal(finishClasses('MERIDIAN'), 'finish finish-meridian');
  });

  test('isKnownFinish recognizes the register names only', () => {
    assert.ok(isKnownFinish('atrium'));
    assert.ok(isKnownFinish('gallery'));
    assert.ok(isKnownFinish('none'));
    assert.ok(!isKnownFinish('sketch'), 'sketch is a mode now, not a finish');
    assert.ok(!isKnownFinish('atriumm'));
    assert.ok(!isKnownFinish(''));
    assert.ok(!isKnownFinish(undefined));
  });

  test('FINISH_NAMES lists exactly the registered names (backdrops + none)', () => {
    assert.deepEqual(
      [...FINISH_NAMES].sort(),
      ['atrium', 'canopy', 'gallery', 'halo', 'ledger', 'loom', 'meridian', 'nimbus', 'none', 'savile', 'strata'],
    );
  });

  test('readFrontMatterFinish extracts the value from the front-matter block only', () => {
    const md = '---\nmarp: true\ntheme: carta\nfinish: atrium\n---\n\n# H\n\n`finish: not-this` in body\n';
    assert.equal(readFrontMatterFinish(md), 'atrium');
    assert.equal(finishClassesFromSource(md), 'finish finish-atrium');
  });

  // The catalog rot-guard (decision doc: "finish→primitive map is a single gated
  // source of truth — every finish resolves to a live class, every shipped
  // finish preset class is reachable from a finish"). FINISH_REGISTER is that
  // source; this test is the gate keeping it in sync with base.finish.css.
  test('every finish preset class resolves to a real CSS rule, and vice versa', () => {
    const css = fs.readFileSync(
      path.join(__dirname, '../../../lib/base/base.finish.css'),
      'utf8',
    );
    // The finish-* preset classes the register maps to.
    const registered = new Set();
    for (const tokens of Object.values(FINISH_REGISTER)) {
      for (const cls of tokens.split(/\s+/).filter(Boolean)) {
        if (cls.startsWith('finish-')) registered.add(cls);
      }
    }
    // The finish-* classes the CSS actually defines (section.finish-x rules).
    const defined = new Set(
      [...css.matchAll(/section\.(finish-[\w-]+)\b/g)].map((m) => m[1]),
    );
    // Every registered class must have a rule.
    for (const cls of registered) {
      assert.ok(defined.has(cls), `finish maps to .${cls} but base.finish.css has no rule`);
    }
    // Every defined class must be reachable from a finish, EXCEPT the documented
    // per-slide-only escape `finish-none` (not a deck finish).
    const escapes = new Set(['finish-none']);
    for (const cls of defined) {
      if (escapes.has(cls)) continue;
      assert.ok(registered.has(cls), `.${cls} defined but unreachable from any finish (rot)`);
    }
  });

  test('a per-slide finish-<name> variant implies the bare `finish` compositor class', () => {
    // A finish applied to a single slide (`<!-- _class: title finish-oct -->`, built-in
    // or saved) must activate the compositor on its own.
    assert.equal(isFinishVariantClass('finish-atrium'), true);
    assert.equal(isFinishVariantClass('finish-oct'), true, 'a saved finish class is a variant');
    assert.equal(isFinishVariantClass('finish-none'), false, 'the per-slide opt-out is NOT a variant');
    assert.equal(isFinishVariantClass('finish-preview'), false, 'the specimen is NOT a variant');
    assert.equal(isFinishVariantClass('finish'), false);
    assert.equal(isFinishVariantClass('title'), false);

    assert.equal(sectionIsFinish(['title', 'finish-oct']), true);
    assert.equal(sectionIsFinish(['finish']), true);
    assert.equal(sectionIsFinish(['title', 'finish-none']), false);
    assert.equal(sectionIsFinish(['title']), false);

    // Normalization adds the bare class exactly once, only when a variant is present.
    assert.deepEqual(normalizeSectionFinishClasses(['title', 'finish-oct']), ['title', 'finish-oct', 'finish']);
    assert.deepEqual(normalizeSectionFinishClasses(['finish', 'finish-atrium']), ['finish', 'finish-atrium'], 'no dup when finish already present');
    assert.deepEqual(normalizeSectionFinishClasses(['title']), ['title'], 'a non-finish slide is untouched');
    assert.deepEqual(normalizeSectionFinishClasses(['finish-none']), ['finish-none'], 'the opt-out does not gain a compositor');
  });

  test('readFrontMatterFinish accepts quotes and returns null when absent', () => {
    assert.equal(readFrontMatterFinish('---\nfinish: "meridian"\n---\n'), 'meridian');
    assert.equal(readFrontMatterFinish("---\nfinish: 'none'\n---\n"), 'none');
    assert.equal(readFrontMatterFinish('---\ntheme: carta\n---\n'), null);
    assert.equal(readFrontMatterFinish(''), null);
    assert.equal(readFrontMatterFinish('# no front matter'), null);
  });
});
