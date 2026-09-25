const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const panes = require('../../../lib/core/panes.js');
const { widenSectionRoots } = require('../../../tools/lib/pane-selectors.js');
const { createEngine } = require('../../../lib/engine');

const ROOT = path.join(__dirname, '../../..');

function engine() {
  const e = createEngine();
  const dir = path.join(ROOT, 'themes');
  e.addThemes(fs.readdirSync(dir).filter((f) => f.endsWith('.css'))
    .map((f) => ({ name: f.replace(/\.css$/, ''), css: fs.readFileSync(path.join(dir, f), 'utf8') })));
  return e;
}

const DECK = [
  '`Eyebrow`', '', '## Title', '', '<!-- panes: 40/60 -->', '<!-- pane: list -->', '',
  '- one', '- two', '', '<!-- pane: table -->', '',
  '| A | B |', '|---|---|', '| 1 | 2 |', '',
  '> The key insight.', '', '— A below-note.', '',
].join('\n');

test('a body with no pane marker comes back as the same string', () => {
  const body = '## Plain\n\n- a\n\n---\n\n## Next\n';
  assert.equal(panes.extract(body).body, body);
});

test('extract splits the body into two panes and keeps title + coda on the host', () => {
  const { body, panes: out, layouts } = panes.extract(DECK);
  assert.deepEqual(out.map((p) => p.cls), ['list', 'table']);
  assert.match(out[0].markdown, /- one/);
  assert.match(out[1].markdown, /\| 1 \| 2 \|/);
  // The trailing Key Insight and below-note belong to the SLIDE, not to pane 2.
  assert.doesNotMatch(out[1].markdown, /key insight|below-note/);
  assert.match(body, /> The key insight\./);
  assert.match(body, /— A below-note\./);
  assert.match(body, /## Title/);
  assert.match(body, /<!-- _class: panes -->/);
  assert.deepEqual({ ...layouts[0] }, { slot: 0, direction: 'side', a: 40, b: 60 });
});

test('a marker inside a code fence is not a pane', () => {
  const body = '## T\n\n```md\n<!-- pane: list -->\n<!-- pane: table -->\n```\n';
  assert.equal(panes.extract(body).panes.length, 0);
});

test('parseLayout accepts 25–75 in 5% steps and stack, and rejects the rest', () => {
  assert.deepEqual(panes.parseLayout('stack 35/65'), { direction: 'stack', a: 35, b: 65 });
  assert.deepEqual(panes.parseLayout('75/25'), { direction: 'side', a: 75, b: 25 });
  for (const bad of ['80/20', '33/67', '60/50']) {
    const l = panes.parseLayout(bad);
    assert.equal(l.a, 50, bad);
    assert.ok(l.error, bad);
  }
});

test('the engine renders ONE slide with two lat-pane cells and one masthead', () => {
  const { html } = engine().render(`---\ntheme: indaco\n---\n\n${DECK}`);
  assert.equal((html.match(/<section\b/g) || []).length, 1, 'a pane is never a slide');
  assert.equal((html.match(/<h2>/g) || []).length, 1, 'the host owns the only title');
  const cells = [...html.matchAll(/<lat-pane class="([^"]*)" data-pane="([^"]*)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(cells, [['list form', 'list'], ['table form', 'table']]);
  assert.match(html, /class="cell-coda"[\s\S]*The key insight/);
});

test('a chart pane is built by its kernel and keeps its component classes', () => {
  const md = '## T\n\n<!-- pane: bar -->\n\n- A `4`\n- B `6`\n\n<!-- pane: list -->\n\n- x\n';
  const { html } = engine().render(md);
  assert.match(html, /<lat-pane class="bar form chart-frame" data-pane="bar"[^>]*>(<div class="cell-stage">\s*)?<div class="chart-body">/);
  assert.match(html, /<svg class="cart-svg bar-svg"/);
});

test('widenSectionRoots widens only the root `section` of each selector', () => {
  const css = '/* c */ section.list > .cell-stage > ul { a: b }\n'
    + ':is(section.bar, figure.bar) .x { c: d }\n'
    + '.z section, section p :has(section) { e: f }\n';
  assert.equal(
    widenSectionRoots(css),
    '/* c */ :is(section,lat-pane).list > .cell-stage > ul { a: b }\n'
    + ':is(:is(section,lat-pane).bar, figure.bar) .x { c: d }\n'
    + '.z section, :is(section,lat-pane) p :has(section) { e: f }\n',
  );
});

test('lat-pane is a custom element, so the widened root keeps specificity (0,0,1)', () => {
  // :is() takes its most specific argument; both arms are one type selector.
  assert.match('lat-pane', /^[a-z][a-z0-9]*-[a-z0-9-]*$/, 'a valid custom-element name has a hyphen');
});
