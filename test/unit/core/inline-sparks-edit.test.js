/**
 * `editSpark` — the spark editor's writer (engineering/decisions/2026-10-13-compose-inline-
 * notation-editors.md, phase 2).
 *
 * Its promise is "nothing is lost": an edit changes the words the author changed and no others,
 * and a combination the engine would refuse is a null, never a span that stops being a spark.
 * The arms that matter run over EVERY spark the repo ships, not over three hand-picked ones.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sparks = require('../../../lib/core/inline-sparks.js');

const ROOT = path.resolve(__dirname, '../../..');

function markdownIn(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) markdownIn(full, out);
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

/** The sparks in the decks and galleries we ship: single-backtick spans the kernel reads. */
function shippedSparks() {
  const files = [
    ...markdownIn(path.join(ROOT, 'examples')),
    ...markdownIn(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.gallery.md')),
    ...markdownIn(path.join(ROOT, 'test/integration/baseline-decks')),
  ];
  const seen = new Set();
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?<!`)`(~\{[^`\n]+\})`(?!`)/g)) {
      if (sparks.resolve(m[1])) seen.add(m[1]);
    }
  }
  return [...seen].sort();
}

const CORPUS = shippedSparks();
const view = (t) => {
  const r = sparks.resolve(t);
  return r && { type: r.type, size: r.size, c: r.c, fill: r.fill, zero: r.zero, markers: r.markers, label: r.label, frame: r.frame, look: r.look, corners: r.corners };
};

describe('editSpark — the corpus', () => {
  test('the corpus is real, not a vacuous empty loop', () => {
    assert.ok(CORPUS.length >= 15, `only ${CORPUS.length} readable sparks found in the shipped decks`);
  });

  test('an empty edit, and an edit that says what the span already says, return it byte for byte', () => {
    for (const t of CORPUS) {
      const r = sparks.resolve(t);
      assert.equal(sparks.editSpark(t, {}), t, t);
      assert.equal(sparks.editSpark(t, { type: r.type }), t, `${t} type`);
      assert.equal(sparks.editSpark(t, { size: r.size }), t, `${t} size`);
      assert.equal(sparks.editSpark(t, { color: r.c }), t, `${t} color`);
      assert.equal(sparks.editSpark(t, { fill: r.fill, zero: r.zero }), t, `${t} flags`);
    }
  });

  test('every size and color lands, changes only that axis, and leaves the other bytes alone', () => {
    for (const t of CORPUS) {
      const before = view(t);
      for (const size of sparks.SIZES) {
        const out = sparks.editSpark(t, { size });
        assert.ok(out, `${t} → ${size}`);
        assert.deepEqual(view(out), { ...before, size }, `${t} → ${size}`);
      }
      for (const color of [null, 'c1', 'c7', 'c12']) {
        const out = sparks.editSpark(t, { color });
        assert.ok(out, `${t} → ${color}`);
        assert.deepEqual(view(out), { ...before, c: color }, `${t} → ${color}`);
      }
    }
  });

  test('a size set and then cleared is the span it started as', () => {
    for (const t of CORPUS) {
      const r = sparks.resolve(t);
      const there = sparks.editSpark(t, { size: r.size === 'lg' ? 'sm' : 'lg' });
      const back = sparks.editSpark(there, { size: r.size });
      assert.deepEqual(view(back), view(t), t);
    }
  });

  test('editing the numbers keeps every modifier word the author wrote', () => {
    for (const t of CORPUS) {
      const r = sparks.resolve(t);
      if (r.type === 'ring' || r.type === 'bullet') continue;
      const data = sparks.editSpark(t, { data: [3, 1, 2] });
      assert.ok(data, t);
      const b = view(data);
      assert.deepEqual({ ...b, label: null }, { ...view(t), label: null }, t);
      assert.match(data, /^~\{3 1 2/, t);
    }
  });

  test('every refusal is a null, and what is written always re-reads as a spark', () => {
    for (const t of CORPUS) {
      for (const type of sparks.TYPES) {
        for (const extra of [{}, { end: true }, { zero: true }, { fill: true }]) {
          const out = sparks.editSpark(t, { type, ...extra });
          if (out !== null) assert.ok(sparks.resolve(out), `${t} ${type} ${JSON.stringify(extra)} wrote ${out}`);
        }
      }
    }
  });
});

describe('editSpark — the cases the corpus does not hold', () => {
  const T = '~{12 14 17, bar, c3, lg}';
  test('words change in place', () => {
    assert.equal(sparks.editSpark(T, { size: 'sm' }), '~{12 14 17, bar, c3, sm}');
    assert.equal(sparks.editSpark(T, { size: null }), '~{12 14 17, bar, c3}');
    assert.equal(sparks.editSpark(T, { color: null }), '~{12 14 17, bar, lg}');
    assert.equal(sparks.editSpark(T, { type: 'step' }), '~{12 14 17, step, c3, lg}');
    assert.equal(sparks.editSpark(T, { type: 'line' }), '~{12 14 17, c3, lg}');
    assert.equal(sparks.editSpark(T, { data: [1, 2, 3, 4] }), '~{1 2 3 4, bar, c3, lg}');
  });
  test('the engine\'s own refusals are nulls', () => {
    assert.equal(sparks.editSpark(T, { end: true }), null); // a marker on a bar
    assert.equal(sparks.editSpark(T, { type: 'ring' }), null); // a ring on a series
    assert.equal(sparks.editSpark(T, { data: '72/80' }), null); // a ratio under a bar
    assert.equal(sparks.editSpark(T, { data: [1] }), null);
    assert.equal(sparks.editSpark(T, { data: [1, Number.NaN] }), null);
    assert.equal(sparks.editSpark(T, { data: '1 2, 3' }), null);
    assert.equal(sparks.editSpark(T, { data: '1 2} `x' }), null);
    assert.equal(sparks.editSpark(T, { size: 'xl' }), null);
    assert.equal(sparks.editSpark(T, { color: 'c13' }), null);
  });
  test('a type change can clear what the new type cannot carry, in one write', () => {
    assert.equal(sparks.editSpark('~{1 2 3, end, minmax}', { type: 'bar', end: false, minmax: false }), '~{1 2 3, bar}');
    assert.equal(sparks.editSpark('~{1 2 3, end, minmax}', { type: 'bar' }), null);
  });
  test('a data change moves the implied type with it', () => {
    assert.equal(sparks.editSpark('~{3 4 5}', { data: '72%' }), '~{72%}');
    assert.equal(sparks.editSpark('~{72%}', { data: '3 4 5' }), '~{3 4 5}');
    assert.equal(sparks.editSpark('~{72%, bullet}', { data: '72/80' }), '~{72/80, bullet}');
  });
  test('named words keep their spelling, and flags toggle', () => {
    assert.equal(sparks.editSpark('~{1 2 3, Size=lg}', { size: 'sm' }), '~{1 2 3, Size=sm}');
    assert.equal(sparks.editSpark('~{1 2 3, area}', { zero: true, end: true }), '~{1 2 3, area, zero, end}');
    assert.equal(sparks.editSpark('~{1 2 3, area, zero, end}', { zero: false }), '~{1 2 3, area, end}');
    assert.equal(sparks.editSpark('~{1 2 3, area, end}', { end: false }), '~{1 2 3, area}');
  });
  test('a span that is not a spark, or has two words for an axis, is left alone', () => {
    assert.equal(sparks.editSpark('{BETA, tag}', { size: 'sm' }), null);
    assert.equal(sparks.editSpark('~{1 2 3, bar, bar}', { size: 'sm' }), null);
    assert.equal(sparks.editSpark('~{abc}', { size: 'sm' }), null);
    assert.equal(sparks.editSpark(T, null), null);
  });
});

describe('editSpark — what the checker found', () => {
  test('a word the span spells out stays as written, even when it is the default', () => {
    assert.equal(sparks.editSpark('~{12 14 17, line}', { type: 'line' }), '~{12 14 17, line}');
    assert.equal(sparks.editSpark('~{72%, ring}', { type: 'ring' }), '~{72%, ring}');
    assert.equal(sparks.editSpark('~{12 14 17, md}', { size: 'md' }), '~{12 14 17, md}');
    assert.equal(sparks.editSpark('~{12 14 17, type=line}', { type: 'line' }), '~{12 14 17, type=line}');
    // Asking for a different word still replaces it, and null still takes it off.
    assert.equal(sparks.editSpark('~{12 14 17, line}', { type: 'bar' }), '~{12 14 17, bar}');
    assert.equal(sparks.editSpark('~{12 14 17, line}', { type: null }), '~{12 14 17}');
  });
  test('a key set to undefined is absent, and a flag must be a boolean', () => {
    assert.equal(sparks.editSpark('~{12 14 17, bar}', { type: undefined }), '~{12 14 17, bar}');
    assert.equal(sparks.editSpark('~{12 14 17}', { end: 'false' }), null);
    assert.equal(sparks.editSpark('~{12 14 17}', { data: undefined, end: undefined }), '~{12 14 17}');
  });
  test('a trend with marks becomes a share when the marks are cleared in the same write', () => {
    const clear = { end: false, minmax: false, zero: false, fill: false };
    for (const flag of ['end', 'zero', 'fill', 'end, minmax']) {
      assert.equal(sparks.editSpark(`~{12 14 17, ${flag}}`, { data: '72%', type: null, ...clear }), '~{72%}', flag);
      assert.equal(sparks.editSpark(`~{12 14 17, ${flag}}`, { data: '72%', type: null }), null, `${flag} without clearing`);
    }
  });
});

