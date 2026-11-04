// The card reflow contract (lib/base/base.card-reflow.css): every component whose content
// area the shared sheet makes a width container must (1) drop columns inside a container query,
// (2) mark its narrow form with `--lat-narrow: 1` so the slide fit check can find it, (3) skip a
// list the fit check held, and (4) never switch on a full-width 16:9 box (about 54em).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
// The content area is a NAMED width container on every deck shape, declared once beside the
// text-room rule (fit-everywhere-model.md §17): `lat-cards` and `lattice` together, because
// `container` names an element's whole list, and NAMED, because an unnamed query would answer the
// section, which is itself a container. `collage` stays out: its content area is sized by its
// contents. Until 2026-11-04 base.card-reflow.css declared it for these components on wide and
// square decks only.
const elements = fs.readFileSync(path.join(ROOT, 'lib/base/base.elements.css'), 'utf8');
const DECLARATION = 'section:not(.collage) > .cell-stage { container: lattice lat-cards / inline-size; }';

test('every content area is a width container named lat-cards (and lattice), on every deck shape', () => {
  assert.ok(elements.split('\n').includes(DECLARATION), 'one container declaration in base.elements.css');
  const shared = fs.readFileSync(path.join(ROOT, 'lib/base/base.card-reflow.css'), 'utf8');
  assert.ok(!/container\s*:/.test(shared.replace(/\/\*[\s\S]*?\*\//g, '')), 'base.card-reflow.css no longer declares a second, narrower container');
});

// The card components that drop columns in the content area's width (base.card-reflow.css).
const names = ['cards-grid', 'verdict-grid', 'pricing', 'stats', 'statute-stack', 'decision', 'list-steps',
  'compare-prose', 'team-profile', 'cards-stack', 'q-and-a', 'inventory', 'kpi', 'list'];
const fileFor = (name) => {
  const hit = fs.readdirSync(path.join(ROOT, 'lib/components'))
    .map((b) => path.join(ROOT, 'lib/components', b, name, `${name}.styles.css`))
    .find((f) => fs.existsSync(f));
  assert.ok(hit, `${name} has a styles file`);
  return fs.readFileSync(hit, 'utf8');
};

for (const name of names) {
  test(`${name} honors the card reflow contract`, () => {
    const css = fileFor(name);
    const blocks = [...css.matchAll(/@container lat-cards \(width < (\d+(?:\.\d+)?)em\) \{([\s\S]*?)\n\}/g)];
    assert.ok(blocks.length > 0, 'drops columns inside a lat-cards container query');
    assert.ok(!/@container \(width </.test(css.slice(css.search(/Width reflow \(/))),
      'no unnamed query in its width section: it would answer the section, not the content area');
    for (const [, em, body] of blocks) {
      assert.ok(Number(em) < 54, `${em}em would switch a full-width 16:9 box`);
      if (/--lat-narrow: 1/.test(body)) assert.match(body, /:not\(\.lat-reflow-held\)/, 'a narrow form skips a held list');
    }
    assert.ok(blocks.some(([, , body]) => /--lat-narrow: 1/.test(body)), 'marks its narrow form for the fit check');
  });
}
