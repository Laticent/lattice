// The Studio's single-slide frame asks for a STABLE pane sheet (`stablePaneSheet: true`): the same
// for every slide of a deck, so a slide swap loads no new stylesheet (lib/core/pane-css.js
// `stablePaneScope`). Measured on the production Studio before the change: a median 134 ms a slide
// in Chromium and 304 ms on an iPhone WebKit profile for a pane deck, against 52 ms without panes,
// because each slide's sheet differed. Everyone else keeps the sheet for exactly their panes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEngine } = require('../../../lib/engine');
const { themeEntries, themePath } = require('../../../lib/theme/files.js');

const ROOT = path.join(__dirname, '../../..');
function engine() {
  const e = createEngine();
  const dir = path.join(ROOT, 'themes');
  e.addThemes([
    { name: 'lattice', css: fs.readFileSync(path.join(ROOT, 'dist/lattice.css'), 'utf8') },
    ...themeEntries(dir).filter((f) => f.endsWith('.css'))
      .map((f) => ({ name: f.replace(/\.css$/, ''), css: fs.readFileSync(themePath(dir, f), 'utf8') })),
  ]);
  return e;
}

const slide = (a, b) => [
  '---', 'theme: indaco', '---', '',
  '<!-- _class: columns -->', '', '## Two panes', '',
  `<!-- _pane: ${a} -->`, '', ...(a === 'table' ? ['| A | B |', '|---|---|', '| 1 | 2 |'] : ['- One `1`', '- Two `2`']), '',
  `<!-- _pane: ${b} -->`, '', ...(b === 'table' ? ['| A | B |', '|---|---|', '| 1 | 2 |'] : ['- One `1`', '- Two `2`']), '',
].join('\n');

const stable = { stablePaneSheet: true };

test('the stable sheet is the same for slides whose panes hold different components', () => {
  const e = engine();
  const one = e.render(slide('table', 'list'), 'indaco', stable).css;
  const two = e.render(slide('bar', 'list'), 'indaco', stable).css;
  assert.equal(one, two, 'the sheet does not depend on which components the slide holds');
  assert.ok(one.includes('lat-pane.bar') && one.includes('lat-pane.table'), 'it twins components the slide does not use');
});

test('without the option the sheet is for exactly the slide\'s own panes, preview or not', () => {
  const e = engine();
  const exact = e.render(slide('table', 'list'), 'indaco').css;
  const other = e.render(slide('bar', 'list'), 'indaco').css;
  assert.notEqual(exact, other, 'sheets still differ per pane set');
  assert.ok(!exact.includes('lat-pane.bar'), 'no twin for a component the deck does not use');
  // The Studio's exports render with `preview: true` (lib/playground/index.js), so it must not widen.
  assert.equal(e.render(slide('table', 'list'), 'indaco', { preview: true }).css, exact, 'preview alone leaves the sheet exact');
  assert.ok(e.render(slide('table', 'list'), 'indaco', stable).css.length > exact.length, 'the stable sheet is the wider one');
});

test('a deck without panes keeps the plain sheet when the option is set', () => {
  const e = engine();
  const md = '---\ntheme: indaco\n---\n\n## Plain\n\n- one\n- two\n';
  assert.equal(e.render(md, 'indaco', stable).css, e.render(md, 'indaco').css);
});
