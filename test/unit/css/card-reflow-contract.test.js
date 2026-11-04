// The card reflow contract (lib/base/base.card-reflow.css): every component whose content
// area the shared sheet makes a width container must (1) drop columns inside a container query,
// (2) mark its narrow form with `--lat-narrow: 1` so the slide fit check can find it, (3) skip a
// list the fit check held, and (4) never switch on a full-width 16:9 box (about 54em).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const shared = fs.readFileSync(path.join(ROOT, 'lib/base/base.card-reflow.css'), 'utf8');
// Declared only on a wide or square deck (a tall or strip deck reflows on its aspect), and NAMED,
// because an unnamed query would answer the section, which is itself a container.
const list = /section:is\(([^)]*(?:\([^)]*\)[^)]*)*)\):not\(:where\(\[data-family="tall"\], \[data-family="strip"\]\)\) > \.cell-stage \{ container: lat-cards \/ inline-size; \}/.exec(shared);

test('the shared sheet declares the content area a width container for a list of card components', () => {
  assert.ok(list, 'one container declaration');
});

// Split on top-level commas only: `.inventory:is(.cards, .timeline)` is one entry.
const topLevel = (str) => {
  const out = []; let depth = 0; let cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  return [...out, cur];
};
const names = topLevel(list[1]).map((s) => s.trim().replace(/^\./, '').replace(/:is\(.*$/, ''));
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
