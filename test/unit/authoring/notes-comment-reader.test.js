/**
 * Unit: notes-core's comment reader (`CommentScan`, lib/authoring/notes-core.js) finds exactly what COMMENT_SOURCE
 * (`<!--+([\s\S]*?)--+!?>`) finds, without the regex, and in linear work.
 *
 * recheck calls COMMENT_SOURCE polynomial (an opener and a long dash run), and every reader of the notes channel ran it
 * once per `<!--`, so a run of unclosed openers cost the square of its length. The reader replaced it on every path
 * (notes, reader notes, descriptions, say lines, the comment strip, the scrub and the audit). These tests hold it to the
 * old pattern, match for match, on a seeded fuzz over the characters that matter (HARD RULE #32, F5: the seed is in
 * every failure), and to linear work on the shapes that were slow.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { COMMENT_SOURCE, CommentScan } = require('../../../lib/authoring/notes-core');
const { mulberry32 } = require('../../helpers/regex-differential');
const { scanWork } = require('../../helpers/work-count');

const SEED = 3045;
// The characters the pattern reads, weighted toward dashes and the terminator's pieces, plus text and a line break.
const ALPHABET = ['<', '<', '!', '!', '-', '-', '-', '-', '>', '>', ' ', 'a', '\n'];

/** Every match a global COMMENT_SOURCE scan finds: [index, whole, body]. */
const byRegex = (s) => [...s.matchAll(new RegExp(COMMENT_SOURCE, 'g'))].map((m) => [m.index, m[0], m[1]]);
const byReader = (s) => [...new CommentScan(s).all()].map((c) => [c.index, s.slice(c.index, c.end), c.body]);

/** The anchored read at every `<!--`, as the scrub and the mask take it: [at, whole, body] or [at, null]. */
function anchoredByRegex(s) {
  const out = [];
  for (let at = s.indexOf('<!--'); at !== -1; at = s.indexOf('<!--', at + 1)) {
    const re = new RegExp(COMMENT_SOURCE, 'y');
    re.lastIndex = at;
    const m = re.exec(s);
    out.push(m ? [at, m[0], m[1]] : [at, null]);
  }
  return out;
}
function anchoredByReader(s) {
  const scan = new CommentScan(s);
  const out = [];
  for (let at = s.indexOf('<!--'); at !== -1; at = s.indexOf('<!--', at + 1)) {
    const c = scan.at(at);
    out.push(c ? [at, s.slice(at, c.end), c.body] : [at, null]);
  }
  return out;
}

function draws(n, maxLen, seed) {
  const rand = mulberry32(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const len = Math.floor(rand() * (maxLen + 1));
    let s = '';
    for (let j = 0; j < len; j++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
    out.push(s);
  }
  return out;
}

// Hand-picked: the opener giving dashes back (`<!---->`, `<!----!>`), too few to give (`<!-->`, `<!--->`), a terminator
// inside the opener's run, `--!>`, nested openers, and a terminator before any opener.
const PICKED = ['<!---->', '<!----!>', '<!-->', '<!--->', '<!----->', '<!------>x', '<!---->x-->', '<!-- a --!> b -->', '<!--<!-- a -->',
  '--> <!-- a -->', '<!-- a ->', '<!-- a -- >', '<!-- a ---!>', '<!--!>', '<!---!>', '<!-----!>', '<!-- a', 'x<!--->y<!---->z'];

describe('CommentScan: the same matches as COMMENT_SOURCE', () => {
  test(`global and anchored reads agree on picked cases and 60,000 seeded draws (seed ${SEED})`, () => {
    for (const s of [...PICKED, ...draws(60_000, 24, SEED)]) {
      assert.deepEqual(byReader(s), byRegex(s), `global scan differs on ${JSON.stringify(s)} (seed ${SEED})`);
      assert.deepEqual(anchoredByReader(s), anchoredByRegex(s), `anchored read differs on ${JSON.stringify(s)} (seed ${SEED})`);
    }
  });

  test('a shared scan answers reads that move forward and back the same as fresh ones', () => {
    for (const s of draws(5_000, 30, SEED + 1)) {
      const scan = new CommentScan(s);
      const openers = [];
      for (let at = s.indexOf('<!--'); at !== -1; at = s.indexOf('<!--', at + 1)) openers.push(at);
      for (const at of [...openers, ...openers.slice().reverse()]) {
        assert.deepEqual(scan.at(at), new CommentScan(s).at(at), `${JSON.stringify(s)} at ${at} (seed ${SEED + 1})`);
      }
    }
  });
});

describe('CommentScan: linear work on the shapes that were slow', () => {
  // Work, not milliseconds: the characters every string search covers, from where it started to where it stopped.
  const linear = (s, read) => {
    const { scanned } = scanWork(() => read(new CommentScan(s)));
    assert.ok(scanned <= 4 * s.length + 16, `${JSON.stringify(s.slice(0, 16))}…: searched ${scanned} characters for ${s.length}`);
  };
  test('a run of unclosed openers, read globally and at every opener', () => {
    const s = `x ${'<!-- '.repeat(20_000)}`;
    linear(s, (scan) => [...scan.all()]);
    linear(s, (scan) => { for (let at = s.indexOf('<!--'); at !== -1; at = s.indexOf('<!--', at + 1)) scan.at(at); });
  });
  test("recheck's attack string: an opener, a long dash run and no `>`", () => {
    const s = `<!--${'-'.repeat(20_000)}${'--'.repeat(20_000)}`;
    linear(s, (scan) => [...scan.all()]);
  });
  test('many openers before one terminator, each read on its own', () => {
    const s = `${'`<!--` '.repeat(20_000)}<!-- a -->`;
    linear(s, (scan) => { for (let at = s.indexOf('<!--'); at !== -1; at = s.indexOf('<!--', at + 1)) scan.at(at); });
  });
});
