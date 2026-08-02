/**
 * Unit: the DEFAULT COMPONENT rule (lib/core/resolve-component.js) and its two
 * render-path applications.
 *
 * A slide that names no component used to render unstyled — none of the
 * component CSS matched, so it came out as raw markdown defaults on a Lattice
 * canvas (#1292). `content`, the catch-all prose layout, is now the fallback.
 *
 * The load-bearing claim here is that the component-name vocabulary is the REAL
 * one. The rule reads it from stage-catalog.generated.js (the only browser-safe
 * copy — the manifests themselves sit behind `fs`), so the first test pins that
 * generated set 1:1 against `loadAll()`. If a component is added, renamed, or
 * removed without regenerating, this fails rather than silently mis-classifying
 * a real component as "no component" and stamping `content` over the top of it.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  COMPONENT_NAMES,
  DEFAULT_COMPONENT,
  isComponentToken,
  hasComponent,
  withDefaultComponent,
} = require('../../../lib/core/resolve-component');
const { loadAll } = require('../../../lib/components');

describe('resolve-component — the name vocabulary', () => {
  test('is exactly the component manifest set (drift guard)', () => {
    const fromManifests = loadAll().map((m) => m.name).sort();
    assert.deepEqual([...COMPONENT_NAMES], fromManifests);
  });

  test('the default is a real, shipped component', () => {
    assert.equal(DEFAULT_COMPONENT, 'content');
    assert.ok(isComponentToken(DEFAULT_COMPONENT));
  });

  test('modifiers, variants and register tokens are NOT components', () => {
    for (const t of ['dark', 'light', 'numbered', 'lifted', 'flat', 'finish-atrium', 'sketch', 'spectrum-off', 'stamp-seal', 'tone-pass', 'head-center', 'rule-full']) {
      assert.equal(isComponentToken(t), false, `${t} must not read as a component`);
    }
  });
});

describe('resolve-component — withDefaultComponent', () => {
  test('an empty class list gets the catch-all', () => {
    assert.deepEqual(withDefaultComponent([]), ['content']);
  });

  test('a list of only modifiers gets the catch-all — a modifier is not a layout', () => {
    assert.deepEqual(withDefaultComponent(['dark', 'numbered']), ['dark', 'numbered', 'content']);
  });

  test('a list that already names a component is left exactly alone', () => {
    const cur = ['kpi', 'dark'];
    assert.equal(withDefaultComponent(cur), cur, 'same array instance — callers skip the write');
  });

  test('the catch-all is never doubled on a slide that named it explicitly', () => {
    const cur = ['content'];
    assert.equal(withDefaultComponent(cur), cur);
  });

  test('appends, never reorders — authored token order survives', () => {
    assert.deepEqual(withDefaultComponent(['tone-pass', 'dark']), ['tone-pass', 'dark', 'content']);
  });

  test('hasComponent agrees with the append decision', () => {
    assert.equal(hasComponent(['quote']), true);
    assert.equal(hasComponent(['dark']), false);
    assert.equal(hasComponent([]), false);
  });
});
