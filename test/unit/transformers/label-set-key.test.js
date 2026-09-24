// The label-set key transformer — the missing place a key could be built for a
// component that has no section transform of its own.
//
// obligation-matrix is the case it was written for: before this, its "key" was a
// prose paragraph the author retyped on every slide, bound to nothing, and its
// own docs listed forgetting it as an authoring mistake. These arms hold the
// properties that make the drawn key trustworthy — it names only the markers the
// cells carry, its swatch takes the CELLS' own classes so the two cannot drift,
// and running twice does not produce two keys.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const t = require('../../../lib/transformers/label-set-key');
const { labelSetFor } = require('../../../lib/core/label-set');

const cell = (sem, shape) => `<td><span class="state ${sem} ${shape}"></span></td>`;
const FULL = cell('pass', 'state-full');       // [x]
const HALF = cell('warn', 'state-half');       // [-]
const FAIL = cell('fail', 'state-empty');      // [!]
const UNKNOWN = cell('unknown', 'state-unknown'); // [?]
const TODO = cell('todo', 'state-todo');       // [ ]
const SLASH = cell('skip', 'state-slashed');   // [/]

const section = (cells, extra = '') => `<section id="1" class="obligation-matrix">`
  + '<h2>Duties</h2>'
  + extra
  + `<table><tbody><tr><td>A</td>${cells}</tr></tbody></table>`
  + '</section>';

const labels = (html) => [...html.matchAll(/label-set-key-label">([^<]*)</g)].map((m) => m[1]);
const setPara = (s) => `<p><code>${s}</code></p>`;

describe('who it serves', () => {
  test('the served set is read from the manifest, not listed in the module', () => {
    // A hand-maintained list inside the transformer is the shape this whole
    // construct replaced; it drifts when a component grows its own key and
    // leaves its name behind here.
    assert.equal(labelSetFor('obligation-matrix').keyedBy, 'transformer');
    assert.match(t.selector, /section\.obligation-matrix/);
  });

  test('a component that draws its own key is not served', () => {
    // roadmap builds its key inside its own transform. If it were also served
    // here the slide would carry two.
    assert.notEqual(labelSetFor('roadmap')?.keyedBy, 'transformer');
    assert.ok(!t.selector.includes('section.roadmap'));
  });

  test('a section of an unserved component is returned untouched', () => {
    const html = '<section id="1" class="compare-table"><table><tbody><tr>'
      + FULL + '</tr></tbody></table></section>';
    assert.equal(t.applyToHtml(html), html);
  });
});

describe('the derived key', () => {
  test('names every marker the cells carry, in declaration order', () => {
    const out = t.applyToHtml(section(FULL + HALF + FAIL + UNKNOWN + TODO + SLASH));
    assert.deepEqual(labels(out),
      ['Applies', 'Partial', 'Does not apply', 'Unclear', 'Undetermined', 'Exempt']);
  });

  test('names ONLY the markers present', () => {
    // A key row for a marker no cell uses points at nothing on the slide.
    assert.deepEqual(labels(t.applyToHtml(section(FULL + TODO))), ['Applies', 'Undetermined']);
  });

  test('order is the manifest\'s, not the order the cells happen to appear', () => {
    assert.deepEqual(labels(t.applyToHtml(section(SLASH + TODO + HALF + FULL))),
      ['Applies', 'Partial', 'Undetermined', 'Exempt']);
  });

  test('a grid with no marker cells gets no key at all', () => {
    const out = t.applyToHtml(section('<td>plain</td>'));
    assert.ok(!out.includes('label-set-key'), 'an empty key is chrome with nothing to say');
  });

  test('the key lands directly after the grid it decodes', () => {
    const out = t.applyToHtml(section(FULL));
    assert.match(out, /<\/table><ul class="label-set-key/);
  });
});

describe('the swatch takes the CELL\'s own classes', () => {
  test('each row carries the same state triple its cells do', () => {
    // A key painted from a different rule than the cells it names is the worst
    // kind of stale legend: it stays plausible. The stylesheet adds this one
    // class to the cell-disc selectors rather than restating the recipe.
    const out = t.applyToHtml(section(FULL + HALF + FAIL + UNKNOWN + TODO + SLASH));
    assert.match(out, /label-set-key-mark state pass state-full/);
    assert.match(out, /label-set-key-mark state warn state-half/);
    assert.match(out, /label-set-key-mark state fail state-empty/);
    assert.match(out, /label-set-key-mark state unknown state-unknown/);
    assert.match(out, /label-set-key-mark state todo state-todo/);
    assert.match(out, /label-set-key-mark state skip state-slashed/);
  });

  test('each marker keys the one state it means in every layout', () => {
    // `[ ]` is open (undetermined, here) and "does not apply" is `[!]`; exempt moved to
    // `[/]`. No component reads a marker its own way any more.
    assert.equal(t.MARKER_STATE['[ ]'].sem, 'todo');
    assert.equal(t.MARKER_STATE['[!]'].sem, 'fail');
    assert.equal(t.MARKER_STATE['[?]'].sem, 'unknown');
    assert.equal(t.MARKER_STATE['[/]'].sem, 'skip');
  });
});

describe('the author\'s override', () => {
  test('renames the markers it names and leaves the rest', () => {
    const out = t.applyToHtml(
      section(FULL + HALF + TODO, setPara('[{[x], In force}, {[ ], Not subject}]')));
    assert.deepEqual(labels(out), ['In force', 'Partial', 'Not subject']);
  });

  test('the set paragraph is consumed, not printed above the grid', () => {
    const out = t.applyToHtml(section(FULL, setPara('[{[x], In force}]')));
    assert.ok(!out.includes('In force}'), 'the raw set must not survive in the body');
  });

  test('an ordinary one-code paragraph survives untouched', () => {
    const out = t.applyToHtml(section(FULL, setPara('Privacy · FY26')));
    assert.match(out, /Privacy · FY26/);
    assert.deepEqual(labels(out), ['Applies']);
  });

  test('a key for a marker the grid does not carry is dropped', () => {
    const out = t.applyToHtml(section(FULL, setPara('[{[/], Withdrawn}]')));
    assert.deepEqual(labels(out), ['Applies']);
  });

  test('an authored label lands as text, never as markup', () => {
    // Fed entity-escaped, as markdown-it really emits a code span's content.
    const out = t.applyToHtml(
      section(FULL, setPara('[{[x], &lt;img src=x onerror=alert(1)&gt;}]')));
    assert.ok(!out.includes('<img'), 'the label must not become a live element');
    assert.match(out, /label-set-key-label">&lt;img/);
  });
});

describe('idempotence — both paths can fire on one document', () => {
  test('running twice produces exactly one key', () => {
    const once = t.applyToHtml(section(FULL + HALF));
    const twice = t.applyToHtml(once);
    assert.equal(twice, once);
    assert.equal((twice.match(/class="label-set-key /g) || []).length, 1);
  });

  test('the second pass does not read the FIRST key\'s swatches as cells', () => {
    // The guard matters more than usual here: the key's own swatches carry the
    // same `state {sem} {shape}` classes the cells do, so without the early
    // return a second pass would see them as markers present.
    const once = t.applyToHtml(section(FULL));
    const twice = t.applyToHtml(once);
    assert.deepEqual(labels(twice), ['Applies']);
  });

  test('two matrix sections in one document each get their own key', () => {
    const doc = section(FULL) + section(HALF);
    const out = t.applyToHtml(doc);
    assert.equal((out.match(/class="label-set-key /g) || []).length, 2);
    assert.deepEqual(labels(out), ['Applies', 'Partial']);
  });
});

describe('applyToDom — the live-DOM path must agree with the string path', () => {
  const { JSDOM } = require('jsdom');

  const doc = (body) => new JSDOM(`<!doctype html><html><body>${body}</body></html>`).window.document;
  const domLabels = (d) => [...d.querySelectorAll('.label-set-key-label')].map((n) => n.textContent);

  test('draws the same derived key the string path does', () => {
    const d = doc(section(FULL + HALF + FAIL + UNKNOWN + TODO + SLASH));
    t.applyToDom(d.body);
    assert.deepEqual(domLabels(d),
      ['Applies', 'Partial', 'Does not apply', 'Unclear', 'Undetermined', 'Exempt']);
  });

  test('the swatch carries the cell classes here too', () => {
    const d = doc(section(FULL));
    t.applyToDom(d.body);
    const mark = d.querySelector('.label-set-key-mark');
    assert.ok(mark.classList.contains('state'));
    assert.ok(mark.classList.contains('pass'));
    assert.ok(mark.classList.contains('state-full'));
  });

  test('reads and consumes the authored set', () => {
    const d = doc(section(FULL + SLASH, setPara('[{[x], In force}]')));
    t.applyToDom(d.body);
    assert.deepEqual(domLabels(d), ['In force', 'Exempt']);
    assert.ok(!d.body.textContent.includes('In force}'),
      'the set paragraph must be removed, not left to print above the grid');
  });

  test('leaves an ordinary one-code paragraph alone', () => {
    const d = doc(section(FULL, setPara('Privacy · FY26')));
    t.applyToDom(d.body);
    assert.match(d.body.textContent, /Privacy · FY26/);
    assert.deepEqual(domLabels(d), ['Applies']);
  });

  test('no markers means no key', () => {
    const d = doc(section('<td>plain</td>'));
    t.applyToDom(d.body);
    assert.equal(d.querySelector('.label-set-key'), null);
  });

  test('idempotent: a second walk adds no second key', () => {
    const d = doc(section(FULL + HALF));
    t.applyToDom(d.body);
    t.applyToDom(d.body);
    assert.equal(d.querySelectorAll('.label-set-key').length, 1);
    assert.deepEqual(domLabels(d), ['Applies', 'Partial']);
  });

  test('the key lands directly after the grid', () => {
    const d = doc(section(FULL));
    t.applyToDom(d.body);
    const table = d.querySelector('table');
    assert.ok(table.nextElementSibling.classList.contains('label-set-key'));
  });
});
