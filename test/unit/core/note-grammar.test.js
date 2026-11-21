/**
 * lib/core/note-grammar.mjs: the one grammar for a slide's four notes (engineering/decisions/2026-11-20-four-notes.md).
 * `noteShape` tells a note from a near miss, `readNote` reads one, and `writeNote` writes any text so `readNote` gives
 * it back: braces, the comment terminator and a trailing backslash included (a seeded fuzz, seed printed per failure,
 * HARD RULE #32).
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { mulberry32 } = require('../../helpers/regex-differential');

let g;
test.before(async () => {
  g = await import('../../../lib/core/note-grammar.mjs');
});

describe('noteShape and readNote', () => {
  test('the four names, in the order the docs teach them, come from the meta manifest', () => {
    assert.deepEqual([...g.NOTE_NAMES], ['note', 'say', 'alt', 'handout']);
  });

  test('each name reads, its text trimmed', () => {
    for (const name of g.NOTE_NAMES) {
      assert.deepEqual(g.noteShape(`  @${name}{  Hello there.  }  `), { kind: 'note', name, text: 'Hello there.' });
      assert.deepEqual(g.readNote(` @${name}{Hello there.} `), { name, text: 'Hello there.' });
    }
  });

  test('the near misses are named, and none of them is a note', () => {
    const cases = [
      ['@Say{x}', { kind: 'unknown', name: 'Say' }],
      ['@speaker{Ana}', { kind: 'unknown', name: 'speaker' }],
      ['@note{x', { kind: 'unbalanced', name: 'note' }],
      ['@note{a {b} c', { kind: 'unbalanced', name: 'note' }],
      ['@alt{x} trailing', { kind: 'trailing', name: 'alt' }],
      ['@say{x}}', { kind: 'trailing', name: 'say' }],
    ];
    for (const [body, shape] of cases) {
      assert.deepEqual(g.noteShape(body), shape, body);
      assert.equal(g.readNote(body), null, body);
    }
  });

  test('a plain comment, a directive, a record and the record\u2019s long form are not note-shaped at all', () => {
    for (const body of ['a plain comment', '_class: lead', '{layout=cards}', '@meta{layout=cards}', 'say: old key', '', '@ note{x}', 'x @note{y}']) {
      assert.equal(g.noteShape(body), null, JSON.stringify(body));
    }
    assert.equal(g.noteShape(null), null);
    assert.equal(g.noteShape(undefined), null);
  });

  test('the text comes back fully decoded: an escaped arrow is an arrow, once', () => {
    assert.equal(g.readNote('@note{a --\\> b --!\\> c}').text, 'a --> b --!> c');
    assert.equal(g.readNote('@note{a --\\\\> b}').text, 'a --\\> b', 'each further backslash is a literal one');
    for (const t of ['-->', '--\\>', '--!>', '{ -->', 'x \\{ --\\\\> }']) assert.equal(g.readNote(g.writeNote('say', t).slice(4, -3)).text, t, t);
  });

  test('balanced braces nest; an escaped brace is text and does not count', () => {
    assert.equal(g.readNote('@note{set {a, b} and {c {d}}}').text, 'set {a, b} and {c {d}}');
    assert.equal(g.readNote('@note{a \\} b \\{ c}').text, 'a } b { c');
    // A backslash before anything but `\`, `{` or `}` is itself, so a hand-written Windows path reads as written.
    assert.equal(g.readNote('@note{C:\\Users\\ana}').text, 'C:\\Users\\ana');
  });

  test('a body written indented inside its comment is dedented; its paragraphs and inner indentation stay', () => {
    assert.equal(g.readNote('@note{\n    First line\n    second line.\n\n      Indented more.\n  }').text, 'First line\nsecond line.\n\n  Indented more.');
    assert.equal(g.readNote('@handout{\r\n  CRLF one\r\n  two\r\n}').text, 'CRLF one\ntwo');
  });
});

describe('writeNote', () => {
  test('writes the comment an author would type, and refuses a name that is not a note', () => {
    assert.equal(g.writeNote('say', '  The pipeline holds.  '), '<!-- @say{The pipeline holds.} -->');
    assert.equal(g.writeNote('note', 'set {a}'), '<!-- @note{set {a}} -->', 'balanced braces need no escape');
    assert.throws(() => g.writeNote('reader', 'x'), /not a note name/);
    assert.throws(() => g.writeNote('Say', 'x'), /not a note name/);
  });

  test('unbalanced braces, the terminators and a trailing backslash are escaped so the note reads back whole', () => {
    const cases = [
      ['a } b', '<!-- @note{a \\} b} -->'],
      ['open { only', '<!-- @note{open \\{ only} -->'],
      ['a --> b --!> c', '<!-- @note{a --\\> b --!\\> c} -->'],
      // A backslash is written `\\`, so a trailing one cannot escape the closing brace.
      ['C:\\', '<!-- @note{C:\\\\} -->'],
      // A literal `--\>`: its backslash doubled, then the arrow escaped; the reader undoes both.
      ['a --\\> b', '<!-- @note{a --\\\\\\> b} -->'],
      // Balanced braces stay as written; only the backslashes are escaped.
      ['a \\{b} c', '<!-- @note{a \\\\{b} c} -->'],
    ];
    for (const [text, comment] of cases) {
      assert.equal(g.writeNote('note', text), comment, text);
      assert.equal(g.readNote(comment.slice(4, -3)).text, text, text);
    }
  });

  test('any text round-trips, and the comment it writes never ends early (seed 2011, printed per draw)', () => {
    const rnd = mulberry32(2011);
    const alphabet = ['{', '}', '\\', '-', '-', '>', '!', 'a', ' ', '\n', '\t'];
    for (let i = 0; i < 20000; i++) {
      let s = '';
      for (let k = Math.floor(rnd() * 12); k > 0; k--) s += alphabet[Math.floor(rnd() * alphabet.length)];
      const name = g.NOTE_NAMES[i % 4];
      const comment = g.writeNote(name, s);
      const body = comment.slice(4, -3);
      assert.equal(/--!?>/.test(body), false, `seed 2011, draw ${i}: ${JSON.stringify(comment)} ends early`);
      const back = g.readNote(body);
      assert.ok(back, `seed 2011, draw ${i}: ${JSON.stringify(comment)} is not a note`);
      assert.deepEqual([back.name, back.text], [name, s.trim()], `seed 2011, draw ${i}: ${JSON.stringify(s)}`);
    }
  });
});
