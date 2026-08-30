const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  UK_TO_US,
  UK_ENGLISH_FORMS,
  britishFormRe,
  suggest,
  findBritishSpellings,
  commitMessageBody,
} = require('../../../tools/us-english.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const HOOK = path.join(ROOT, 'tools', 'check-commit-msg.sh');

describe('US-English dictionary (HARD RULE #21 / #30)', () => {
  // The dictionary moved out of tools/check-ownership.js so the commit-msg hook
  // could read the same list. A move is exactly where entries go missing
  // silently: the ratchet would simply stop counting a form and read GREENER,
  // which is the failure direction nobody investigates.
  test('carries the full curated list — a dropped pair is a silently weaker gate', () => {
    assert.equal(UK_ENGLISH_FORMS.length, 170);
    assert.equal(Object.keys(UK_TO_US).length, 170);
  });

  test('flags unambiguous British forms', () => {
    for (const w of ['colour', 'Behaviour', 'centred', 'normalise', 'grey', 'catalogue', 'defence', 'whilst', 'labelled']) {
      assert.ok(britishFormRe().test(w), `expected "${w}" to be flagged`);
    }
  });

  test('does NOT flag US spellings or words US keeps in the -ise/-re/-ue form', () => {
    for (const w of ['color', 'center', 'organize', 'gray', 'license', 'analysis', 'exercise', 'comprise', 'advise', 'surprise', 'dialogue', 'epicentre', 'rise', 'premise']) {
      assert.ok(!britishFormRe().test(w), `did NOT expect "${w}" to be flagged`);
    }
  });

  // Every suggestion must be a real fix. A pair whose American side is itself a
  // listed British form, or is identical to the British side, would coach the
  // writer into a second failure — or into a loop.
  test('every suggestion is a genuine correction, not another British form', () => {
    for (const [uk, us] of Object.entries(UK_TO_US)) {
      assert.notEqual(uk, us, `${uk} maps to itself`);
      assert.ok(!UK_TO_US[us], `${uk} → ${us}, but ${us} is itself a listed British form`);
      assert.ok(!britishFormRe().test(us), `the suggestion "${us}" is flagged by the gate`);
    }
  });

  test('suggest() keeps the casing it was handed', () => {
    assert.equal(suggest('colour'), 'color');
    assert.equal(suggest('Behaviour'), 'Behavior');
    assert.equal(suggest('COLOUR'), 'COLOR');
    assert.equal(suggest('color'), null, 'a US form has no suggestion');
  });

  test('findBritishSpellings reports every hit with its line', () => {
    const hits = findBritishSpellings('clean line\nthe colour is grey\n');
    assert.deepEqual(hits, [
      { found: 'colour', suggestion: 'color', line: 2 },
      { found: 'grey', suggestion: 'gray', line: 2 },
    ]);
  });

  // A /g regex shared between callers carries `lastIndex`, so the SECOND call
  // starts mid-string and misses a hit at the front. Each call gets a fresh one.
  test('repeated scans of the same text agree', () => {
    const text = 'colour colour colour';
    assert.equal(findBritishSpellings(text).length, 3);
    assert.equal(findBritishSpellings(text).length, 3);
  });
});

describe('scan scope', () => {
  // `.claude/**` is a hidden directory, so the repo walk skipped all 14 of its
  // tracked prose files — the agent roster cards and workflow scripts, which are
  // house instructions an agent reads and copies the voice of. They measured zero
  // British spellings the day they came into scope, so this is a floor, not a
  // backlog: the next one fails the build on the first offence.
  test('.claude/** is in the US-English scan', () => {
    const { listRepoTextFiles } = require('../../../tools/check-ownership.js');
    const scanned = listRepoTextFiles().map((f) => path.relative(ROOT, f).split(path.sep).join('/'));
    assert.ok(
      scanned.some((f) => f.startsWith('.claude/')),
      '.claude/** must be scanned — it is house prose, not a dot-directory of settings',
    );
    assert.ok(scanned.some((f) => f.startsWith('.github/')), '.github/** must stay scanned');
  });
});

describe('commit-msg body extraction', () => {
  // git's own text must not be scanned: the `#` template lines are git's words,
  // and everything below the --verbose scissors is the DIFF — i.e. the tracked
  // text the ratchet already owns. Counting it would report the whole existing
  // backlog on every single commit.
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
    const hits = findBritishSpellings(commitMessageBody(raw));
    assert.deepEqual(hits.map((h) => h.found), ['Standardise', 'colour']);
  });
});

// The hook is the surface a contributor actually meets, so it is driven for
// real rather than asserted about (HARD RULE #23).
describe('the commit-msg hook itself', () => {
  const run = (body) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-msg-'));
    const file = path.join(dir, 'COMMIT_EDITMSG');
    fs.writeFileSync(file, body);
    try {
      const out = execFileSync(HOOK, [file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return { status: 0, stderr: '', stdout: out };
    } catch (e) {
      return { status: e.status, stderr: e.stderr || '', stdout: e.stdout || '' };
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
  // execFileSync only surfaces stderr on failure, so a passing run is re-run
  // through a shell to capture what it printed.
  const stderrOf = (body) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-msg-'));
    const file = path.join(dir, 'COMMIT_EDITMSG');
    fs.writeFileSync(file, body);
    try {
      return execFileSync('/bin/sh', ['-c', `"${HOOK}" "${file}" 2>&1 1>/dev/null`], { encoding: 'utf8' });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  test('a British spelling WARNS and does not block', () => {
    const body = 'docs(style): a subject\n\nStandardise the colour of the labelling.\n';
    assert.equal(run(body).status, 0, 'the dialect warning must never block a commit');
    const err = stderrOf(body);
    assert.match(err, /HARD RULE #21/);
    assert.match(err, /colour → color/);
    assert.match(err, /labelling → labeling/);
  });

  test('a clean message says nothing', () => {
    const body = 'docs(style): a subject\n\nStandardize the color of the labeling.\n';
    assert.equal(run(body).status, 0);
    assert.equal(stderrOf(body).trim(), '');
  });

  test('a malformed subject still blocks — the format check is unchanged', () => {
    assert.equal(run('Update files with colour\n').status, 1);
  });

  test("git's machine-generated messages still pass", () => {
    assert.equal(run('Merge branch main into feature\n').status, 0);
    assert.equal(run('').status, 0);
  });
});
