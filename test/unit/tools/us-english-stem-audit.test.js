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
 * ## THE MAP AND ITS TESTS ARE NOT PART OF THE TREE
 *
 * These three files are excluded, and the exclusion is load-bearing rather than tidy. A
 * British-to-American map is a list of British words, so every key is a token in the tree
 * by construction — 237 of 237, measured. With the machinery in scope, three separate
 * things certified themselves:
 *
 *  · the staleness assertion below, because `stem('calibr')` is `calibr` and the allowlist
 *    KEY is a word in this file. A fabricated entry for `honourably` — a word that appears
 *    nowhere in the repo — passed the check that exists to catch exactly that;
 *  · the removed-pair test, which would reopen a gap for ANY key, whether or not the word
 *    occurs in anything anyone wrote;
 *  · the audit's own yield. At the branch point `flavourful` occurred on exactly one line in
 *    the whole repo — the enumeration test's comment listing the derivations it does not
 *    cover. It is in the map because this audit surfaced it, and surfacing it was reading its
 *    own predecessor's documentation. (It is on six lines now, all of them prose about the map.)
 *
 * All three were found by an independent checker, not by the suite. The honest statement
 * about the tree this ships against is that the audit finds ZERO British spellings in house
 * prose — which is what a green audit over a swept tree should say.
 *
 * ## What it can and cannot see
 *
 * Porter2 reduces INFLECTION and a bounded set of derivations, and the boundary is not
 * where a first draft of this comment put it. `-ness` IS deleted (Porter2 step 3, the same
 * step whose `-ful` deletion produced the `flavourful` find), so `colourfulness` reduces to
 * `colour`. What survives whole is `-hood` and `-less`: `neighbourhood` and `colourless`
 * stem to themselves, land in no family, and are invisible here.
 *
 * Three further holes, none of them closed:
 *
 *  · **The 25 collapsing families are dark.** They are dropped for a good reason (below),
 *    and the cost is that no unlisted word in them can be seen: `modeller` stems to `model`
 *    and `marvellously` to `marvel`, and neither lands in a British family.
 *  · **559 of 3,178 tracked files in the extensions it does read are never opened**, 530 of
 *    them `engineering/decisions/**`, which `listRepoTextFiles` skips as a dated archive.
 *  · **Extensions on neither list** — `.mdx`, `.cjs`, `.txt`, `.sh`, `.vtt`, 23 tracked files —
 *    are unread. All 23 were checked by hand once, in August 2026: none carried a British
 *    spelling. Nothing keeps that true.
 *
 * So this is a net with a stated mesh, not a proof of zero.
 *
 * The FILE set is the other half of the mesh, and it cost a real miss. `listRepoTextFiles`
 * carries an extension list built for a different gate, and `.py` is not on it — so
 * `tools/ascii-preview.py` held `the centre of the slide."`, which the build pastes into
 * `quote.docs.md` and `dist/docs/components.md`, where it was visible while its source was
 * not. Editing the generated copy was reverted by the next build, which is how it was
 * found. Tracked `.py` files are therefore added here rather than to that walk, whose only
 * other consumer is HARD RULE #29's glyph gate — and `ascii-preview.py` is 600 lines of
 * box drawing, so widening the walk would point a glyph budget at an ASCII-art file for no
 * gain.
 *
 * Identifiers are split on case and underscore boundaries, so `sectionBoxOffenses` is read
 * as three words. That does NOT close the `camelCase` hole on its own, and believing it did
 * was a claim this file made for one commit: the stem audit reports words the map CANNOT
 * see, and `offences` IS in the map, so a listed British form inside an identifier is
 * skipped whether or not the tokenizer finds it. Splitting only helps for an UNLISTED word
 * hiding in an identifier. The listed case needs its own assertion, and has one below —
 * which is what closes CLAUDE.md's recorded "rides on review" hole.
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

// Words that must NOT be rewritten, for either of two reasons: US keeps the
// British-looking form, or the string is EXTERNAL and rewriting it breaks something.
// HARD RULE #21 names the second class specifically — GitHub's `cancelled` enum, the
// OECD's legal name, a synonym key an author might type, a pre-registered benchmark
// fixture — and a sweep that rewrote three of them shipped a dead CI allowlist, an
// unresolvable map region and a tautological test. An entry states which class it is.
//
// Only ONE lands here today, because this list catches words the MAP does not carry;
// an external string the map already lists (`cancelled`, `organisation`) never reaches
// this audit at all. Those are inventoried in
// engineering/decisions/2026-08-30-british-spellings-remainder.md instead.
const KEEP_AS_IS = Object.freeze({
  analyses: 'US keeps it: the plural noun of "analysis" — the map excludes it on purpose',
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

// Where identifiers live. The identifier arm below scans only these, because prose has no
// identifiers of its own: a `.md` naming `sectionBoxOffences` is QUOTING one, and the file
// that declares it is already in scope. Without the restriction the arm fails on the
// changelog fragment describing the rename it just made — measured, not hypothetical.
// `.cjs` and `.yaml` were here and were dead: the corpus yields only the extensions in
// `US_TEXT_EXTS` plus `.py`, and neither is among them. `.html` is walked, carries real
// identifiers (class names, ids, inline script), and was wrongly left out.
const IDENTIFIER_FILE_EXTS = new Set(['.js', '.mjs', '.ts', '.tsx', '.css', '.json', '.astro', '.py', '.yml', '.html']);

// The dialect map and the two suites that test it. See § THE MAP AND ITS TESTS above:
// these hold British words as DATA, so leaving them in the corpus lets the audit, its
// allowlists and its mutation proof all certify themselves.
const DIALECT_MACHINERY = [
  'tools/us-english.js',
  'test/unit/tools/us-english.test.js',
  'test/unit/tools/us-english-stem-audit.test.js',
];

// So are the changelog fragments, and leaving them in was the same defect one file over: a
// fragment describing this work quotes the words it is about, and between them the pending
// fragments hold 25 map keys. `recognisable` lived in exactly one in-corpus file — the #1918
// fragment — which is what the removed-pair proof below used to run on.
const isDialectMachinery = (rel) => DIALECT_MACHINERY.includes(rel) || rel.startsWith('changelog.d/');

/** Tracked `.py` files, which `listRepoTextFiles` does not carry. Absolute, to match it. */
function trackedPythonFiles() {
  const out = execFileSync('git', ['ls-files', '-z', '*.py'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\0').filter(Boolean).map((rel) => path.join(ROOT, rel));
}

/**
 * The words in one blob of text, lowercased. Runs of letters, PLUS the segments of a
 * camelCase or snake_case identifier — `sectionBoxOffenses` yields `section`, `box` and
 * `offenses`. Both forms are emitted, because the whole token can itself be a word
 * (`analyser` inside `analyser_pool`) and a segment can be one the whole is not.
 */
function wordsIn(text) {
  const out = new Set();
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9_]*/g)) {
    const token = m[0];
    out.add(token.toLowerCase());
    if (!/[a-z][A-Z]|_/.test(token)) continue;
    for (const seg of token.split(/(?<=[a-z0-9])(?=[A-Z])|_+/)) {
      if (seg) out.add(seg.toLowerCase());
    }
  }
  return out;
}

/** Every distinct lowercased word in the tree, with the files it came from. */
function repoWords() {
  const words = new Map();
  for (const file of [...listRepoTextFiles(), ...trackedPythonFiles()]) {
    if (isDialectMachinery(path.relative(ROOT, file))) continue;
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue; // a sidecar the build deleted mid-walk is not this audit's business
    }
    const rel = path.relative(ROOT, file);
    for (const w of wordsIn(text)) {
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
    if (KEEP_AS_IS[word]) {
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
      'add it to KEEP_AS_IS/COLLIDING_STEMS here WITH the reason. Never add a suggestion that ' +
      `is not unambiguous (HARD RULE #21 also forbids touching an EXTERNAL string).\n${report}\n`,
    );
  });

  // The instrument has to be able to fail, and this proof is SYNTHETIC on purpose — a
  // demotion from what it was, made because a checker showed the old one proved nothing.
  //
  // It used to delete `recognisable` from the map and assert the gap reopened. With the map
  // and its tests in the corpus that passed for ANY key, because a British-to-American map is
  // a list of British words: all 237 keys were tokens in the tree by construction. Excluding
  // those three files left `recognisable` in exactly one in-corpus file — the #1918 changelog
  // fragment — so the proof still ran on prose about the map rather than on prose.
  //
  // Excluding the fragments too leaves NO word to mutate against, and that is the finding
  // rather than an obstacle: the tree is swept, so no British spelling in house prose remains
  // for a removed pair to rediscover. A synthetic corpus proves what is actually provable
  // here — that tokenize -> stem -> compare reports an unlisted word in a British family. The
  // walk's end-to-end proof is the identifier arm below, which does go red on a real file.
  test('the tokenize/stem/compare pipeline reports an unlisted British form', () => {
    const corpus = new Map([
      ['recognisable', new Set(['synthetic/prose.md'])],
      ['recognizable', new Set(['synthetic/prose.md'])], // the US form must NOT be reported
      ['calibration', new Set(['synthetic/prose.md'])], //  nor a collision the allowlist absorbs
    ]);
    const holed = new Set(listed);
    holed.delete('recognisable');
    const { gaps } = auditGaps(corpus, holed, byStem);
    assert.deepEqual(gaps.map((g) => g.word), ['recognisable']);
    assert.deepEqual(gaps[0].files, ['synthetic/prose.md']);
    // And with the pair listed the same corpus is clean — the map is what decides.
    assert.deepEqual(auditGaps(corpus, listed, byStem).gaps, []);
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
      Object.keys(KEEP_AS_IS).filter((w) => !absorbed.words.has(w)), [],
      'a KEEP_AS_IS entry no longer matches any word in the tree — delete it',
    );
    for (const s of Object.keys(COLLIDING_STEMS)) {
      assert.ok(byStem.has(s), `COLLIDING_STEMS carries "${s}", which is not a British family stem`);
    }
  });

  // HARD RULE #21: "a British spelling buried in a `camelCase` identifier rides on review,
  // so name those US too." Nothing enforced that, and five identifiers in
  // tools/check-ownership.js had ridden it — `sectionBoxOffences` and four siblings, 65
  // sites. This is the arm the stem audit above cannot be: `offences` is IN the map, so the
  // audit skips it by construction, and only a check that looks FOR listed forms sees it.
  //
  // Scoped to multi-part identifiers (a case boundary or an underscore). A whole-word
  // British spelling is the other instrument's business, and 34 of those remain on purpose —
  // engineering/decisions/2026-08-30-british-spellings-remainder.md.
  test('no identifier segment is a British spelling the map lists', () => {
    // Markdown emphasis, not an identifier: `_emphasised_` sits inside the pre-registered
    // benchmark calibration document, whose bytes set the baseline every `bench:check`
    // compares against (HARD RULE #19), and #21 names a benchmark fixture as an external
    // string a sweep must not touch.
    const NOT_AN_IDENTIFIER = new Set(['test/benchmark/engine-bench.mjs:emphasised_']);
    const listedForms = new Set(Object.keys(UK_TO_US));
    const absorbed = new Set();
    const found = [];
    for (const file of [...listRepoTextFiles(), ...trackedPythonFiles()]) {
      const rel = path.relative(ROOT, file);
      if (isDialectMachinery(rel)) continue;
      if (!IDENTIFIER_FILE_EXTS.has(path.extname(rel))) continue;
      let text;
      try {
        text = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9_]*/g)) {
        const token = m[0];
        if (!/[a-z][A-Z]|_/.test(token)) continue;
        if (NOT_AN_IDENTIFIER.has(`${rel}:${token}`)) {
          absorbed.add(`${rel}:${token}`);
          continue;
        }
        for (const seg of token.split(/(?<=[a-z0-9])(?=[A-Z])|_+/)) {
          if (seg && listedForms.has(seg.toLowerCase())) found.push(`${rel}: ${token} (${seg})`);
        }
      }
    }
    assert.deepEqual(
      [...new Set(found)].sort(), [],
      'an identifier carries a British spelling (HARD RULE #21). Rename it, or — if the ' +
      'string is external or is not an identifier at all — add it to NOT_AN_IDENTIFIER with ' +
      'the reason.',
    );
    // This was the one allowlist on the branch without a staleness arm, which is the rot the
    // repo gates against everywhere else (#20, #22, #29). If `_emphasised_` ever leaves
    // engine-bench.mjs, the entry goes with it.
    assert.deepEqual(
      [...NOT_AN_IDENTIFIER].filter((e) => !absorbed.has(e)), [],
      'a NOT_AN_IDENTIFIER entry no longer matches anything in the tree — delete it',
    );
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
