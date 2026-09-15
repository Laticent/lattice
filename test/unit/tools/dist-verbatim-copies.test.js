/**
 * Unit: the ownership gate's dist/ verbatim-copy arm
 * (`checkVerbatimDistCopies` / `verbatimCopyProblems`, tools/check-ownership.js).
 *
 * WHAT IT IS FOR (#2204). `npm run build:check` is `--check --exclude-uncommitted`, so
 * every dist/ artifact is out of its scope — deliberately: an artifact that is never
 * committed cannot be stale relative to a commit, and a CI checkout has no dist/ at all.
 * Its closing line said "all artifacts up to date" anyway. A developer whose local dist/
 * predated a `design/skills/` edit believed it, then spent a detour reading the resulting
 * unit failures as a defect in their own diff.
 *
 * A COPY is the one class of dist/ artifact that can be wrong in a way nothing else
 * notices: everything else is derived, so a stale derivation reproduces itself on the next
 * build and has nothing to disagree with. This arm compares each declared copy against its
 * committed source.
 *
 * The table is driven SYNTHETICALLY here, against a temp tree. Pointing the assertions at
 * the real `dist/` would make them pass or fail on whether the runner happened to build
 * recently — a test whose verdict is a property of the machine, not of the code.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  verbatimCopyProblems,
  checkVerbatimDistCopies,
  DIST_VERBATIM_COPIES,
} = require('../../../tools/check-ownership.js');

const ROOT = path.join(__dirname, '..', '..', '..');

/** A throwaway tree: `write` takes {relpath: contents}. */
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verbatim-'));
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return root;
}

describe('verbatimCopyProblems — one file pair', () => {
  const entry = { copy: 'dist/kit/LICENSE', source: 'LICENSE', builder: 'tools/build-x.js' };

  test('identical bytes → no problem', () => {
    const root = tree({ LICENSE: 'MIT', 'dist/kit/LICENSE': 'MIT' });
    assert.deepEqual(verbatimCopyProblems(entry, root), []);
  });

  test('a drifted copy is reported, and names both paths and the repair', () => {
    const root = tree({ LICENSE: 'MIT', 'dist/kit/LICENSE': 'MIT\nDRIFT' });
    const [msg, ...rest] = verbatimCopyProblems(entry, root);
    assert.equal(rest.length, 0);
    assert.match(msg, /dist\/kit\/LICENSE has drifted from LICENSE/);
    assert.match(msg, /npm run build/);
    assert.match(msg, /edit the source, never the copy/);
  });

  test('an ABSENT copy is not a failure — dist\' is built after this guard runs', () => {
    // On a cold checkout there is nothing to compare, and build.js bootstraps the
    // built-not-committed artifacts AFTER the guard. Failing here would make a fresh
    // clone unbuildable.
    const root = tree({ LICENSE: 'MIT' });
    assert.deepEqual(verbatimCopyProblems(entry, root), []);
  });

  test('an absent SOURCE is a STALE ENTRY and always fails', () => {
    // The opposite posture, deliberately: a table that silently stops covering a copy
    // is the same defect this arm exists to catch, one level up.
    const root = tree({ 'dist/kit/LICENSE': 'MIT' });
    const [msg] = verbatimCopyProblems(entry, root);
    assert.match(msg, /which does not exist/);
    assert.match(msg, /DIST_VERBATIM_COPIES/);
  });
});

describe('verbatimCopyProblems — a directory set', () => {
  const entry = {
    copy: 'dist/kit/skills', source: 'design/skills', include: /\.md$/,
    exclude: ['README.md'], exhaustive: true, builder: 'tools/build-x.js',
  };
  const base = {
    'design/skills/a.md': 'A', 'design/skills/b.md': 'B', 'design/skills/README.md': 'inside',
    'dist/kit/skills/a.md': 'A', 'dist/kit/skills/b.md': 'B', 'dist/kit/skills/README.md': 'outside',
  };

  test('matching set, matching bytes → no problem (and the excluded README may differ)', () => {
    // The kit's own README is WRITTEN by the builder for a reader outside the repo, so
    // it is the one file in the folder that is not a copy. If `exclude` stopped working
    // this case would fail, which is what makes the fixture's differing README the point.
    assert.deepEqual(verbatimCopyProblems(entry, tree(base)), []);
  });

  test('a drifted member is named by file', () => {
    const [msg] = verbatimCopyProblems(entry, tree({ ...base, 'dist/kit/skills/b.md': 'B!' }));
    assert.match(msg, /dist\/kit\/skills\/b\.md has drifted from design\/skills\/b\.md/);
  });

  test('a MISSING member is reported — the kit is silently short one skill', () => {
    const t = tree(base);
    fs.rmSync(path.join(t, 'dist/kit/skills/b.md'));
    const [msg] = verbatimCopyProblems(entry, t);
    assert.match(msg, /is missing b\.md/);
  });

  test('an EXTRA member is reported — a source deleted but its copy left behind', () => {
    const [msg] = verbatimCopyProblems(entry, tree({ ...base, 'dist/kit/skills/c.md': 'C' }));
    assert.match(msg, /ships c\.md, which design\/skills does not have/);
  });

  test('a NON-exhaustive set tolerates extra copies but still compares shared names', () => {
    // dist/fonts carries faces that do not come from assets/fonts, so the set is
    // one-directional: every source face must match, extras are not the arm's business.
    const loose = { ...entry, exhaustive: false };
    assert.deepEqual(verbatimCopyProblems(loose, tree({ ...base, 'dist/kit/skills/c.md': 'C' })), []);
    const [msg] = verbatimCopyProblems(loose, tree({ ...base, 'dist/kit/skills/a.md': 'A!' }));
    assert.match(msg, /a\.md has drifted/);
  });
});

describe('checkVerbatimDistCopies — mode and table', () => {
  // A tree that IS drifted, so the two mode assertions below are about the mode and not
  // about whether this machine happens to have built recently. Asserting silence against
  // a CLEAN tree proves nothing — the first cut of this test did exactly that, and a
  // mutation deleting the mode guard outright still passed it.
  const drifted = { copy: 'dist/kit/LICENSE', source: 'LICENSE', builder: 'tools/build-x.js' };
  const driftedRoot = () => tree({ LICENSE: 'MIT', 'dist/kit/LICENSE': 'MIT\nDRIFT' });

  test('silent outside --check, because `npm run build` is the REPAIR', () => {
    // Firing in build mode aborts the build that regenerates the copy, leaving a drifted
    // kit unfixable. tools/build.js passes --check through to the guard for this arm alone.
    const errors = [];
    checkVerbatimDistCopies(errors, { check: false, table: [drifted], root: driftedRoot() });
    assert.deepEqual(errors, [], 'the arm must not fire on a plain `npm run build`');
  });

  test('…and reports the same tree under --check', () => {
    const errors = [];
    checkVerbatimDistCopies(errors, { check: true, table: [drifted], root: driftedRoot() });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /has drifted/);
  });

  test('every declared SOURCE exists in this tree', () => {
    // The stale-entry guard above proves the arm reports one; this proves the committed
    // table has none, which is the part that rots.
    const missing = DIST_VERBATIM_COPIES
      .map((e) => e.source)
      .filter((s) => !fs.existsSync(path.join(ROOT, s)));
    assert.deepEqual(missing, [], 'DIST_VERBATIM_COPIES names sources that are gone');
  });

  test('the table covers all three shapes the measurement found', () => {
    // Enumerated by hashing `git ls-files` and walking a freshly built dist/: 48 files as
    // six hand-written skills, the fonts into two kits, and eight one-off pairs. The
    // count is not asserted (it moves with the tree); the SHAPES are, because a table
    // that lost its directory sets would still pass a "sources exist" check.
    assert.ok(DIST_VERBATIM_COPIES.some((e) => e.exhaustive), 'no exhaustive directory set');
    assert.ok(DIST_VERBATIM_COPIES.some((e) => e.include && !e.exhaustive), 'no one-directional set');
    assert.ok(DIST_VERBATIM_COPIES.some((e) => !e.include), 'no single-file pair');
    assert.ok(
      DIST_VERBATIM_COPIES.some((e) => e.source === 'design/skills'),
      'the agent kit\'s hand-written skills are the copy #2204 was filed about',
    );
  });
});
