/**
 * Unit: render().restyle() — the stylesheet for a deck already rendered, against the themes registered NOW.
 *
 * A host that registers a stylesheet after seeing the slides (the Playground's on-demand style loader scans
 * the rendered HTML, fetches the modules it needs, re-registers the `lattice` base, and needs the sheet that
 * base now composes) used to render the whole deck a second time to get it. `restyle()` recomputes only the
 * sheet: a few tens of milliseconds against a render of hundreds. The contract is that it equals what a fresh
 * render would have returned, for every deck shape the sheet depends on (a palette chain, a size, panes).
 *
 * It rides the result as a NON-ENUMERABLE property, so a result that is spread, JSON-serialized or
 * structured-cloned (a worker hop, a snapshot cache) is unchanged, and the host falls back to rendering again.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const latticeEngine = require('../../../lib/engine');
const playground = require('../../../lib/playground/index.js').default;

const ROOT = path.resolve(__dirname, '../../..');
const LAYOUT = fs.existsSync(path.join(ROOT, 'dist/lattice-min.css')) ? fs.readFileSync(path.join(ROOT, 'dist/lattice-min.css'), 'utf8') : null;
const PALETTE = fs.existsSync(path.join(ROOT, 'dist/themes/indaco-min.css')) ? fs.readFileSync(path.join(ROOT, 'dist/themes/indaco-min.css'), 'utf8') : null;
const skip = !LAYOUT || !PALETTE ? 'dist is not built' : false;

const SMALL = ':root{--x:1}section{color:red}';
const DECK = '---\ntheme: indaco\n---\n\n# One\n\n---\n\n<!-- _class: cols-2 -->\n\n## Two\n\n- a\n- b\n';
const PANES = '---\ntheme: indaco\n---\n\n<!-- _class: panes -->\n\n## Panes\n\n<lat-pane>\n\nleft\n\n</lat-pane>\n\n<lat-pane>\n\nright\n\n</lat-pane>\n';

function freshEngine(base) {
  const engine = latticeEngine.createEngine({});
  engine.addThemes([{ name: 'lattice', css: base }, { name: 'indaco', css: PALETTE }]);
  return engine;
}

describe('render().restyle()', { skip }, () => {
  for (const [label, deck] of [['a plain deck', DECK], ['a deck with panes', PANES]]) {
    test(`${label}: equals a fresh render's sheet after the base changes`, () => {
      const engine = freshEngine(SMALL);
      const first = engine.render(deck, 'indaco');
      assert.equal(typeof first.restyle, 'function');
      engine.addThemes([{ name: 'lattice', css: LAYOUT }]);
      const again = first.restyle();
      assert.equal(again, engine.render(deck, 'indaco').css);
      assert.notEqual(again, first.css, 'the base changed, so the sheet must');
    });
  }

  test('is not enumerable: a spread, JSON and structuredClone of the result do not carry it', () => {
    const out = freshEngine(LAYOUT).render(DECK, 'indaco');
    assert.equal(Object.keys(out).includes('restyle'), false);
    assert.equal('restyle' in { ...out }, false);
    assert.equal('restyle' in JSON.parse(JSON.stringify(out)), false);
    assert.doesNotThrow(() => structuredClone(out));
  });

  test('the playground facade passes it through, still not enumerable', () => {
    playground.addThemes([{ name: 'lattice', css: SMALL }, { name: 'indaco', css: PALETTE }]);
    const out = playground.render(DECK, 'indaco');
    assert.equal(typeof out.restyle, 'function');
    assert.equal(Object.keys(out).includes('restyle'), false);
    playground.addThemes([{ name: 'lattice', css: LAYOUT }]);
    assert.equal(out.restyle(), playground.render(DECK, 'indaco').css);
  });
});
