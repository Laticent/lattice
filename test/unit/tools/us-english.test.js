const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  UK_TO_US,
  BRITISH_FORMS,
  NOT_ENGLISH_FORMS,
  britishFormRe,
  suggest,
  findBritishSpellings,
  commitMessageBody,
} = require('../../../tools/us-english.js');

const HOOK = path.join(__dirname, '..', '..', '..', 'tools', 'check-commit-msg.sh');

describe('US-English word list (HARD RULE #21)', () => {
  test('flags unambiguous British forms', () => {
    for (const w of ['colour', 'Behaviour', 'centred', 'normalise', 'grey', 'catalogue', 'defence', 'whilst', 'labelled']) {
      assert.ok(britishFormRe().test(w), `expected "${w}" to be flagged`);
    }
  });

  // False positives are the risk that would make the warning noise people learn
  // to ignore, which is the only way a warn-never-block hook fails.
  test('does NOT flag US spellings or words US keeps in the British-looking form', () => {
    for (const w of ['color', 'center', 'organize', 'gray', 'license', 'analysis', 'exercise', 'comprise', 'advise', 'surprise', 'dialogue', 'epicentre', 'rise', 'premise']) {
      assert.ok(!britishFormRe().test(w), `did NOT expect "${w}" to be flagged`);
    }
  });

  // Every suggestion must be a real fix. A pair whose American side is itself a
  // listed British form would coach the writer into a second failure.
  test('every suggestion is a genuine correction', () => {
    assert.equal(BRITISH_FORMS.length, 237);
    for (const [uk, us] of Object.entries(UK_TO_US)) {
      assert.notEqual(uk, us, `${uk} maps to itself`);
      assert.ok(!britishFormRe().test(us), `the suggestion "${us}" is itself flagged`);
    }
  });

  // #1918. The map is keyed on whole words and matched with `\b`, so a listed root does
  // NOT cover its own longer inflections — `neighbour` cannot fire inside `neighbouring`.
  // The list was inflection-aware but incomplete, and the incompleteness was invisible by
  // construction: 66 British spellings across 45 files sat in the tree unseen by the map,
  // because no entry existed that could match them. That is not the same as the sweep
  // having failed — HARD RULE #21 records ~71 further spellings that remain on purpose —
  // it is the map being unable to see a family it already had the roots for.
  //
  // Three axes are asserted, and they are the three the map enumerates mechanically. The
  // `-able`/`-hood`/`-ful`/`-ly` derivations are NOT covered here: they are open-ended word
  // formation rather than a closed inflection set, and a test that pretended to cover them
  // would be the same overclaim this one exists to prevent. `neighbour` is listed without
  // `neighbourhood` and that stays a real hole in THIS instrument — the map carries
  // `honourable` and `flavourful` only because `us-english-stem-audit.test.js` found them in
  // the tree, which is the other half of the pair and the only half that can see a
  // derivation nobody enumerated.
  test('every root carries the inflections its family enumerates', () => {
    const listed = new Set(Object.keys(UK_TO_US));
    // Derived forms that are not words, shared with the stemmer audit so the two
    // instruments cannot disagree about what English contains.
    const NOT_ENGLISH = NOT_ENGLISH_FORMS;
    const missing = [];
    const want = (from, to) => {
      if (!listed.has(to) && !NOT_ENGLISH.has(to)) missing.push(`${from} -> ${to}`);
    };
    for (const w of listed) {
      if (w.endsWith('ise')) want(w, `${w.slice(0, -3)}ising`); // normalise -> normalising
      if (w.endsWith('our')) want(w, `${w}ing`); //                 honour   -> honouring
      if (w.endsWith('isation')) want(w, `${w}s`); //               -isation -> its plural
    }
    assert.deepEqual(
      missing.sort(), [],
      'a root is listed without an inflection its own family enumerates, which is how ' +
      '`neighbouring` shipped past a green build (#1918). Add the pair, or add it to ' +
      'NOT_ENGLISH with the reason it is not a word.',
    );
  });

  test('the inflections #1918 named all resolve to their US form', () => {
    for (const [uk, us] of Object.entries({
      neighbouring: 'neighboring', honouring: 'honoring', labouring: 'laboring',
      rumoured: 'rumored', standardising: 'standardizing', specialising: 'specializing',
      finalising: 'finalizing', capitalising: 'capitalizing', practising: 'practicing',
      standardisation: 'standardization', categorisation: 'categorization',
      visualisation: 'visualization', initialisation: 'initialization',
      customisation: 'customization', prioritisation: 'prioritization',
    })) {
      assert.equal(suggest(uk), us, `${uk} should suggest ${us}`);
    }
  });

  test('suggest() keeps the casing it was handed', () => {
    assert.equal(suggest('colour'), 'color');
    assert.equal(suggest('Behaviour'), 'Behavior');
    assert.equal(suggest('COLOUR'), 'COLOR');
    assert.equal(suggest('color'), null, 'a US form has no suggestion');
  });

  // The hook PRINTS the line number, so its shape is load-bearing, not incidental.
  test('findBritishSpellings reports every hit with its line', () => {
    assert.deepEqual(findBritishSpellings('clean line\nthe colour is grey\n'), [
      { found: 'colour', suggestion: 'color', line: 2 },
      { found: 'grey', suggestion: 'gray', line: 2 },
    ]);
  });

  // A /g regex shared between callers carries `lastIndex`, so a second call would
  // start mid-string and miss a hit at the front.
  test('repeated scans of the same text agree', () => {
    assert.equal(findBritishSpellings('colour colour colour').length, 3);
    assert.equal(findBritishSpellings('colour colour colour').length, 3);
  });
});

describe('commit-msg body extraction', () => {
  // git's own text must not be scanned: the `#` lines are git's words, and
  // everything below the --verbose scissors is the DIFF, which would report the
  // whole repo's prose back at the author on every commit.
  test('drops git comment lines and everything below the scissors', () => {
    const raw = [
      'docs(style): clean subject',
      '',
      '# Please enter the commit message. Lines with colour are ignored.',
      '# ------------------------ >8 ------------------------',
      'diff --git a/x b/x',
      "+const colour = 'grey';",
    ].join('\n');
    assert.equal(findBritishSpellings(commitMessageBody(raw)).length, 0);
  });

  test('keeps the author’s own prose', () => {
    const raw = 'docs(style): subject\n\nStandardise the colour.\n# a comment\n';
    assert.deepEqual(
      findBritishSpellings(commitMessageBody(raw)).map((h) => h.found),
      ['Standardise', 'colour'],
    );
  });
});

// The hook is the surface a contributor actually meets, so it is driven for real
// rather than asserted about (HARD RULE #23).
describe('the commit-msg hook', () => {
  const write = (body) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-msg-'));
    const file = path.join(dir, 'COMMIT_EDITMSG');
    fs.writeFileSync(file, body);
    return { dir, file };
  };
  const run = (body) => {
    const { dir, file } = write(body);
    try {
      execFileSync(HOOK, [file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return 0;
    } catch (e) {
      return e.status;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  // execFileSync only surfaces stderr on failure, so a passing run goes through a
  // shell to capture what it printed.
  const stderrOf = (body) => {
    const { dir, file } = write(body);
    try {
      return execFileSync('/bin/sh', ['-c', `"${HOOK}" "${file}" 2>&1 1>/dev/null`], { encoding: 'utf8' });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  test('a British spelling WARNS and does not block', () => {
    const body = 'docs(style): a subject\n\nStandardise the colour of the labelling.\n';
    assert.equal(run(body), 0, 'the dialect warning must never block a commit');
    const err = stderrOf(body);
    assert.match(err, /HARD RULE #21/);
    assert.match(err, /colour → color/);
    assert.match(err, /labelling → labeling/);
  });

  test('a clean message says nothing', () => {
    const body = 'docs(style): a subject\n\nStandardize the color of the labeling.\n';
    assert.equal(run(body), 0);
    assert.equal(stderrOf(body).trim(), '');
  });

  test('a malformed subject still blocks — the format check is unchanged', () => {
    assert.equal(run('Update files with colour\n'), 1);
  });

  test("git's machine-generated messages still pass", () => {
    assert.equal(run('Merge branch main into feature\n'), 0);
    assert.equal(run(''), 0);
  });
});
