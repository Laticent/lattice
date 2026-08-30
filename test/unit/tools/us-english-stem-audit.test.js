const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const stem = require('wink-porter2-stemmer');

const { UK_TO_US, NOT_ENGLISH_FORMS } = require('../../../tools/us-english.js');
const { listRepoTextFiles } = require('../../../tools/check-ownership.js');

const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * The dialect map is a list of WHOLE WORDS matched with `\b`, so it cannot see its
 * own longer forms: `neighbour` never fires inside `neighbouring`. #1918 closed that
 * for the inflections somebody thought to enumerate, and the enumeration test in
 * `us-english.test.js` holds those three axes. Neither instrument can find the form
 * nobody thought of — which is the failure mode that shipped `neighbouring` past a
 * green build in the very session whose subject was claims nothing checks.
 *
 * This audit asks the opposite question. Instead of deriving forms from the map, it
 * reads what the TREE actually contains, stems every word, and reports any word whose
 * stem lands in a British family the map carries while the word itself does not. Run
 * against the pre-#1918 map it rediscovers `neighbouring` and its siblings unaided,
 * and it found `honourable` and `flavourful`, which no rule over the roots demands.
 *
 * ## What it can and cannot see
 *
 * Porter2 reduces INFLECTION and a bounded set of derivations. `-hood` and `-ness` are
 * not among them: `neighbourhood` stems to itself, lands in no family, and is invisible
 * here. So this is a net with a stated mesh, not a proof of zero — the same honesty the
 * enumeration test keeps about its three axes.
 *
 * The FILE set is the second half of the mesh, and it cost a real miss. `listRepoTextFiles`
 * carries an extension list built for a different gate, and `.py` is not on it — so
 * `tools/ascii-preview.py` held `the centre of the slide."`, which the build pastes into
 * `quote.docs.md` and `dist/docs/components.md`, where it was visible while its source was
 * not. Editing the generated copy was reverted by the next build, which is how it was
 * found. Tracked `.py` files are therefore added here rather than to that walk, whose only
 * other consumer is HARD RULE #29's glyph gate — and `ascii-preview.py` is 600 lines of
 * box drawing, so widening the walk would point a glyph budget at an ASCII-art file for no
 * gain. What is still uncovered is every extension on NEITHER list.
 *
 * ## Why the families are restricted
 *
 * A family whose two sides stem alike (`cancelled`/`canceled` -> `cancel`) carries no
 * signal: every US word in it would be reported. Those are dropped, and the survivors
 * are derived rather than pinned — the count moves whenever the map grows.
 */

// Stems where an unrelated US word reduces into a British family. Both are real English
// words on the American side, so neither is a gap; the stemmer simply cannot tell them
// apart from the British root. Each entry names the collision it absorbs, and an entry
// that stops firing is a failure below, not a comment nobody re-reads.
const COLLIDING_STEMS = Object.freeze({
  calibr: 'calibre/caliber vs. the unrelated verb `calibrate` and its family',
  programm: 'programme/program vs. `programmable` and `programming`',
});

// Words US keeps in the British-looking form. `analyses` is the one the map's own
// docblock already names as a deliberate exclusion: it is the US plural of "analysis"
// as often as it is the British verb, so no suggestion is safe.
const US_KEEPS = Object.freeze({
  analyses: 'also the US plural noun of "analysis" — the map excludes it on purpose',
});

/** The families where stemming can tell British from American. */
function discriminatingFamilies() {
  return Object.entries(UK_TO_US).filter(([uk, us]) => stem(uk) !== stem(us));
}

/** British stem -> the listed words that produced it. */
function britishStems() {
  const byStem = new Map();
  for (const [uk, us] of discriminatingFamilies()) {
    const s = stem(uk);
    if (!byStem.has(s)) byStem.set(s, []);
    byStem.get(s).push(`${uk} -> ${us}`);
  }
  return byStem;
}

/** Tracked `.py` files, which `listRepoTextFiles` does not carry. Absolute, to match it. */
function trackedPythonFiles() {
  const out = execFileSync('git', ['ls-files', '-z', '*.py'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean).map((rel) => path.join(ROOT, rel));
}

/** Every distinct lowercased alphabetic word in the tree, with the files it came from. */
function repoWords() {
  const words = new Map();
  for (const file of [...listRepoTextFiles(), ...trackedPythonFiles()]) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue; // a sidecar the build deleted mid-walk is not this audit's business
    }
    const rel = path.relative(ROOT, file);
    for (const m of text.matchAll(/[A-Za-z]+/g)) {
      const w = m[0].toLowerCase();
      if (!words.has(w)) words.set(w, new Set());
      words.get(w).add(rel);
    }
  }
  return words;
}

/**
 * Words in `words` that stem into a British family the map does not list.
 * `absorbed` collects which allowlist entries did work, so a stale one can be caught.
 */
function auditGaps(words, listed, byStem) {
  const gaps = [];
  const absorbed = { stems: new Set(), words: new Set() };
  for (const [word, files] of words) {
    if (listed.has(word) || NOT_ENGLISH_FORMS.has(word)) continue;
    const s = stem(word);
    if (!byStem.has(s)) continue;
    if (COLLIDING_STEMS[s]) {
      absorbed.stems.add(s);
      continue;
    }
    if (US_KEEPS[word]) {
      absorbed.words.add(word);
      continue;
    }
    gaps.push({ word, stem: s, family: byStem.get(s), files: [...files].sort() });
  }
  gaps.sort((a, b) => a.word.localeCompare(b.word));
  return { gaps, absorbed };
}

describe('the dialect map, audited by stemming the tree (HARD RULE #21)', () => {
  const words = repoWords();
  const listed = new Set(Object.keys(UK_TO_US));
  const byStem = britishStems();
  const { gaps, absorbed } = auditGaps(words, listed, byStem);

  test('no word in the tree stems into a British family the map does not carry', () => {
    const report = gaps
      .map((g) => `  ${g.word}  (stem "${g.stem}", family ${g.family.join(', ')})\n    ${g.files.slice(0, 4).join('\n    ')}`)
      .join('\n');
    assert.deepEqual(
      gaps.map((g) => g.word), [],
      'the tree contains British spellings the map cannot see. Add the pair to UK_TO_US in ' +
      'tools/us-english.js, or — if the word is correct US English that merely stems alike — ' +
      'add it to US_KEEPS/COLLIDING_STEMS here WITH the reason. Never add a suggestion that ' +
      `is not unambiguous (HARD RULE #21 also forbids touching an EXTERNAL string).\n${report}\n`,
    );
  });

  // The instrument has to be able to fail, and the map is the thing it audits, so the
  // proof runs on a map with a known pair removed rather than on a synthetic fixture.
  test('it catches a pair deliberately removed from the map', () => {
    const holed = new Set(listed);
    holed.delete('recognisable');
    const found = auditGaps(words, holed, byStem).gaps.map((g) => g.word);
    assert.deepEqual(found, ['recognisable'], 'removing a listed pair must reopen exactly that gap');
  });

  // A discriminating family is one the stemmer can actually take a position on. The
  // number is derived, never pinned: it was 153 of 170 before #1918 and moves with the
  // map. What is asserted is the PROPERTY — that a collapsing family is excluded,
  // because including one would report every US word in it.
  test('families whose two sides stem alike are excluded', () => {
    const families = discriminatingFamilies();
    assert.ok(families.length > 0 && families.length < Object.keys(UK_TO_US).length);
    for (const [uk, us] of families) assert.notEqual(stem(uk), stem(us));
    const dropped = Object.entries(UK_TO_US).filter(([uk, us]) => stem(uk) === stem(us));
    assert.ok(dropped.some(([uk]) => uk === 'cancelled'), 'cancelled/canceled must be a dropped family');
    for (const [uk] of dropped) assert.ok(!byStem.has(stem(uk)), `${uk} leaked a collapsing stem into the audit`);
  });

  // An allowlist nobody can see rotting is how a gate stops meaning anything (#20, #22).
  test('every allowlisted collision and exception still absorbs something', () => {
    assert.deepEqual(
      Object.keys(COLLIDING_STEMS).filter((s) => !absorbed.stems.has(s)), [],
      'a COLLIDING_STEMS entry no longer matches any word in the tree — delete it',
    );
    assert.deepEqual(
      Object.keys(US_KEEPS).filter((w) => !absorbed.words.has(w)), [],
      'a US_KEEPS entry no longer matches any word in the tree — delete it',
    );
    for (const s of Object.keys(COLLIDING_STEMS)) {
      assert.ok(byStem.has(s), `COLLIDING_STEMS carries "${s}", which is not a British family stem`);
    }
  });

  // The walk is the expensive half, and a walk that returned nothing would make every
  // assertion above vacuously green.
  test('the walk actually read the tree, including the files listRepoTextFiles omits', () => {
    assert.ok(words.size > 10000, `expected a repo-sized vocabulary, got ${words.size}`);
    assert.ok(words.has('lattice'));
    const py = trackedPythonFiles().map((f) => path.relative(ROOT, f));
    assert.ok(py.includes('tools/ascii-preview.py'), `expected the .py arm to find the anatomy catalog, got ${py}`);
  });
});
