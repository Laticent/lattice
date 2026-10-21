/**
 * Unit: `findBareRowPills` in lib/authoring/bare-row-pill.js — the warning that tells an author a bare
 * code span now draws nothing where a component used to paint a pill (2026-10). Pinned in both
 * directions: it fires exactly where the old rule drew a pill, and it never fires on prose code,
 * on an eyebrow, on a span already in the notation, or on a component that never drew one.
 * engineering/decisions/2026-10-17-pills-plugin.md.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { findBareRowPills } = require('../../../lib/authoring/bare-row-pill.js');

const deck = (klass, body) => `---\nmarp: true\n---\n\n<!-- _class: ${klass} -->\n\n${body}\n`;
const spans = (klass, body) => findBareRowPills(deck(klass, body)).map((f) => f.span);

test('a trailing span on a card title is a bare pill, and the fix names the notation', () => {
  const [f, ...rest] = findBareRowPills(deck('cards-stack', '## T\n\n- Row one `shipped`\n  - body\n'));
  assert.equal(rest.length, 0);
  assert.equal(f.rule, 'bare-row-pill');
  assert.equal(f.severity, 'warning');
  assert.match(f.fix, /`\{shipped\}`/);
});

test('a span already in the notation, or mid-sentence prose code, is not reported', () => {
  assert.deepEqual(spans('cards-stack', '## T\n\n- Row one `{shipped}`\n- Use `--accent` here\n'), []);
});

test('a label with a comma is offered quoted, because the plain form would not render', () => {
  const [f] = findBareRowPills(deck('cards-stack', '## T\n\n- Row `a, b`\n'));
  assert.match(f.fix, /`\{"a, b"\}`/);
});

test('an eyebrow paragraph is not a row pill', () => {
  assert.deepEqual(spans('kpi', '`Evidence · Ledger`\n\n## T\n\n1. 4\n   - tiles\n'), []);
});

test('kpi reports a span on any tile row', () => {
  assert.deepEqual(spans('kpi', '## T\n\n1. 4\n   - the ceiling `On plan`\n'), ['`On plan`']);
});

test('list-tabular only draws a row pill on the register variant', () => {
  assert.deepEqual(spans('list-tabular', '## T\n\n1. title `stable`\n'), []);
  assert.deepEqual(spans('list-tabular register', '## T\n\n1. title `stable`\n'), ['`stable`']);
});

test('logo-wall reports a code-only caption bullet, not the name line', () => {
  assert.deepEqual(spans('logo-wall', '## T\n\n- ![A](a.svg)\n  - Acme\n  - `Series B`\n'), ['`Series B`']);
});

test('regulatory-update reports the last nested bullet when it is only a span, never the citation', () => {
  assert.deepEqual(spans('regulatory-update', '## T\n\n1. EU AI Act\n   - `Title III`\n   - Took effect.\n   - `Effective Feb 2026`\n'), ['`Effective Feb 2026`']);
});

test('roadmap reports a span in a table header, not in a body cell', () => {
  assert.deepEqual(spans('roadmap', '## T\n\n| WS | Foundation `Q2 2026` |\n|---|---|\n| API | cell `v1` |\n'), ['`Q2 2026`']);
});

test('a component that never drew a row pill is silent', () => {
  assert.deepEqual(spans('content', '## T\n\n- Row one `shipped`\n'), []);
});

test('the inline-code literal register switches it off', () => {
  assert.deepEqual(spans('cards-stack inline-code-literal', '## T\n\n- Row one `shipped`\n'), []);
});

test('the components the old universal rule reached are covered, not only the ones with their own pill', () => {
  for (const c of ['inventory', 'topic', 'cycle', 'citation-card', 'scene', 'obligation-matrix']) {
    assert.deepEqual(spans(c, '## T\n\n- Alpha item `TAG`\n'), ['`TAG`'], c);
  }
});

test('a deck whose register is `inline-code: literal` is not advised to write braces', () => {
  const md = '---\ninline-code: literal\n---\n\n<!-- _class: cards-stack -->\n\n## T\n\n- Row `shipped`\n';
  assert.deepEqual(findBareRowPills(md), []);
});

test('a row indented up to three spaces is still a top-level row', () => {
  assert.deepEqual(spans('cards-stack', '## T\n\n   - Alpha `shipped`\n'), ['`shipped`']);
});
