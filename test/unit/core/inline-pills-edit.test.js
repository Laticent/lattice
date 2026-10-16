/**
 * `editPill` — the pill editor's writer (engineering/decisions/2026-10-13-compose-inline-
 * notation-editors.md, axis C1).
 *
 * Its whole promise is "nothing is lost": an edit changes the words the author changed and no
 * others. So the arms that matter run it over EVERY readable pill the repo ships, not over
 * three hand-picked ones: a writer that is right on `{BETA, tag, c4}` and wrong on a pill nobody
 * thought of rewrites an author's deck in silence.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pills = require('../../../lib/core/inline-pills.js');

const ROOT = path.resolve(__dirname, '../../..');

/** Every `*.md` under `dir`, depth-first, skipping dependency and build folders. */
function markdownIn(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) markdownIn(full, out);
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

/** The pills in the decks and galleries we ship: single-backtick spans the kernel reads. */
function shippedPills() {
  const files = [
    ...markdownIn(path.join(ROOT, 'examples')),
    ...markdownIn(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.gallery.md')),
    ...markdownIn(path.join(ROOT, 'test/integration/baseline-decks')),
  ];
  const seen = new Set();
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?<!`)`(\{[^`\n]+\})`(?!`)/g)) {
      if (pills.resolve(m[1])) seen.add(m[1]);
    }
  }
  return [...seen].sort();
}

const CORPUS = shippedPills();

describe('editPill — the corpus', () => {
  test('the corpus is real, not a vacuous empty loop', () => {
    assert.ok(CORPUS.length >= 20, `only ${CORPUS.length} readable pills found in the shipped decks`);
  });

  test('an edit with nothing in it returns the span byte for byte', () => {
    for (const t of CORPUS) assert.equal(pills.editPill(t, {}), t, t);
  });

  test('setting an axis to what the pill already says returns the span byte for byte', () => {
    for (const t of CORPUS) {
      const r = pills.resolve(t);
      assert.equal(pills.editPill(t, { shape: r.shape }), t, `${t} shape`);
      assert.equal(pills.editPill(t, { color: r.c }), t, `${t} color`);
      assert.equal(pills.editPill(t, { size: r.size }), t, `${t} size`);
      assert.equal(pills.editPill(t, { label: r.value }), t, `${t} label`);
    }
  });

  test('every shape, color and size lands exactly, and changes no other field', () => {
    const axes = [
      ['shape', pills.SHAPES, (r) => r.shape, (v) => v || 'pill'],
      ['color', [...pills.COLORS, null], (r) => r.c, (v) => v],
      ['size', [...pills.SIZES, null], (r) => r.size, (v) => (v && v !== 'md' ? v : null)],
    ];
    for (const t of CORPUS) {
      const before = pills.resolve(t);
      for (const [axis, values, field, expected] of axes) {
        for (const v of values) {
          const out = pills.editPill(t, { [axis]: v });
          assert.notEqual(out, null, `${t}: ${axis}=${v} refused`);
          const after = pills.resolve(out);
          assert.ok(after, `${t} -> ${out} no longer reads as a pill`);
          assert.equal(field(after), expected(v), `${t} -> ${out}: ${axis}`);
          for (const other of ['value', 'shape', 'c', 'size', 'icon']) {
            if (other === (axis === 'color' ? 'c' : axis) || (axis === 'shape' && other === 'shape')) continue;
            assert.equal(after[other], before[other], `${t} -> ${out}: ${other} changed`);
          }
        }
      }
    }
  });

  test('adding a word to an unset axis and taking it off again restores the exact bytes', () => {
    for (const t of CORPUS) {
      const r = pills.resolve(t);
      const cases = [];
      if (r.shape === 'pill' && !/\bpill\b/i.test(t)) cases.push(['shape', 'diamond', 'shape', null]);
      if (!r.c) cases.push(['color', 'c7', 'color', null]);
      if (!r.size) cases.push(['size', 'lg', 'size', null]);
      for (const [a, v, b, w] of cases) {
        const added = pills.editPill(t, { [a]: v });
        assert.ok(added && added !== t, `${t}: adding ${a} did nothing`);
        assert.equal(pills.editPill(added, { [b]: w }), t, `${t} -> ${added}: removing it did not restore the span`);
      }
    }
  });

  test('the label is replaced and every other field is unchanged', () => {
    for (const t of CORPUS) {
      const before = pills.resolve(t);
      if (before.value === '') continue; // icon-only pills have no label
      const out = pills.editPill(t, { label: 'Renamed' });
      assert.ok(out, `${t}: label refused`);
      const after = pills.resolve(out);
      assert.equal(after.value, 'Renamed', `${t} -> ${out}`);
      for (const k of ['shape', 'c', 'size', 'icon']) assert.equal(after[k], before[k], `${t} -> ${out}: ${k}`);
    }
  });
});

describe('editPill — spelling and order are the author\'s', () => {
  test('the order of words is kept', () => {
    assert.equal(pills.editPill('{BETA, c4, tag}', { color: 'c5' }), '{BETA, c5, tag}');
  });

  test('a named word stays named', () => {
    assert.equal(pills.editPill('{BETA, shape=tag}', { shape: 'circle' }), '{BETA, shape=circle}');
    assert.equal(pills.editPill('{BETA, color=c4}', { color: 'c9' }), '{BETA, color=c9}');
  });

  test('the default is the absence of a word', () => {
    assert.equal(pills.editPill('{BETA, tag, c4}', { shape: null }), '{BETA, c4}');
    assert.equal(pills.editPill('{BETA, tag, c4}', { shape: 'pill' }), '{BETA, c4}');
    assert.equal(pills.editPill('{BETA, tag, c4}', { shape: null, color: null }), '{BETA}');
    assert.equal(pills.editPill('{BETA}', { shape: null, size: 'md' }), '{BETA}');
  });

  test('two edits in one call apply together, in a stable order', () => {
    assert.equal(pills.editPill('{BETA}', { shape: 'diamond', size: 'lg' }), '{BETA, diamond, lg}');
    assert.equal(pills.editPill('{BETA}', { color: 'c3', shape: 'tag' }), '{BETA, tag, c3}');
  });

  test('an icon-only pill keeps its icon, and its options are still editable', () => {
    assert.equal(pills.editPill('{c2, icon=api}', { color: null }), '{icon=api}');
    assert.equal(pills.editPill('{c2, icon=api}', { label: '' }), '{c2, icon=api}');
    assert.equal(pills.editPill('{icon=database, c2}', { color: 'c3' }), '{icon=database, c3}');
    assert.equal(pills.editPill('{icon=database}', { size: 'lg' }), '{icon=database, lg}');
  });

  test('the icon axis adds, replaces and removes `icon=`, and the kernel decides which names exist', () => {
    assert.equal(pills.editPill('{DONE, c2}', { icon: 'api' }), '{DONE, c2, icon=api}');
    assert.equal(pills.editPill('{DONE, icon=api, c2}', { icon: 'database' }), '{DONE, icon=database, c2}');
    assert.equal(pills.editPill('{DONE, icon=api, c2}', { icon: null }), '{DONE, c2}');
    assert.equal(pills.editPill('{DONE, Icon=api}', { icon: 'API' }), '{DONE, Icon=api}'); // already says it
    assert.equal(pills.editPill('{DONE, icon=api}', { icon: 'database', color: 'c3' }), '{DONE, icon=database, c3}');
    // Refusals: an unknown icon, a name that is not a word, and taking the only thing an icon-only pill shows.
    assert.equal(pills.editPill('{DONE}', { icon: 'no-such-icon' }), null);
    assert.equal(pills.editPill('{DONE}', { icon: 'a b' }), null);
    assert.equal(pills.editPill('{DONE}', { icon: 'a}, c2' }), null);
    assert.equal(pills.editPill('{icon=api}', { icon: null }), null);
    assert.equal(pills.editPill('{c2, icon=api}', { icon: null }), null);
  });

  test('the case the author typed is kept on words that were not edited', () => {
    assert.equal(pills.editPill('{LIVE, TAG, c4}', { color: 'c6' }), '{LIVE, TAG, c6}');
  });
});

describe('editPill — labels', () => {
  test('a label holding a reserved character is quoted', () => {
    assert.equal(pills.editPill('{BETA}', { label: 'Cost, excluding tax' }), '{"Cost, excluding tax"}');
    assert.equal(pills.editPill('{BETA, tag}', { label: 'A|B' }), '{"A|B", tag}');
    assert.equal(pills.editPill('{BETA}', { label: '5" screen' }), '{"5\\" screen"}');
  });

  test('a label that is an option word is quoted, so it stays a label', () => {
    assert.equal(pills.editPill('{BETA, icon=api}', { label: 'c4' }), '{"c4", icon=api}');
    assert.equal(pills.resolve(pills.editPill('{BETA, icon=api}', { label: 'lg' })).value, 'lg');
  });

  test('a plain label is not quoted, and a quoted one becomes plain when it no longer needs quotes', () => {
    assert.equal(pills.editPill('{BETA, c4}', { label: 'Shipped' }), '{Shipped, c4}');
    assert.equal(pills.editPill('{"A, B", c4}', { label: 'AB' }), '{AB, c4}');
  });

  test('every quoted label reads back as the label that was typed', () => {
    for (const label of ['Cost, excluding tax', 'A|B', 'k=v', '[x]', 'a {b}', '5" screen', ' padded ', 'tag', 'c4', 'lg']) {
      const out = pills.editPill('{BETA, c4}', { label });
      if (out === null) continue; // refusing is allowed; a wrong write is not
      assert.equal(pills.resolve(out).value, label.trim(), `${label} -> ${out}`);
      assert.equal(pills.resolve(out).c, 'c4', `${label} -> ${out}: the color changed`);
    }
  });

  test('an empty label is refused: a pill without one is not a pill', () => {
    assert.equal(pills.editPill('{BETA}', { label: '' }), null);
    assert.equal(pills.editPill('{BETA}', { label: '   ' }), null);
  });
});

describe('editPill — what it refuses', () => {
  test('a span that is not a readable pill is returned as null, never repaired', () => {
    for (const t of ['{x}', '{}', '{BETA, c13}', '{BETA, nonsense}', 'BETA', '', '{BETA', '{{name}}']) {
      assert.equal(pills.editPill(t, { color: 'c2' }), null, t);
    }
  });

  test('a value outside the vocabulary is refused', () => {
    assert.equal(pills.editPill('{BETA}', { color: 'c13' }), null);
    assert.equal(pills.editPill('{BETA}', { shape: 'hexagon' }), null);
    assert.equal(pills.editPill('{BETA}', { size: 'xl' }), null);
  });

  test('a pill that names an axis twice is left alone', () => {
    assert.equal(pills.editPill('{BETA, c1, c2}', { color: 'c3' }), null);
  });

  test('not a string, not an edit', () => {
    assert.equal(pills.editPill(null, { color: 'c2' }), null);
    assert.equal(pills.editPill('{BETA}', null), null);
  });
});
