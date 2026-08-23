/**
 * Unit: per-PR changelog fragments (`changelog.d/`) — #1593.
 *
 * WHY THIS EXISTS. Every PR used to append to one shared `## Unreleased`
 * region, which conflicted on every rebase and ejected PR after PR from the
 * merge queue (seven ejections in one evening, every resolution the same
 * mechanical "keep both entries"). One file per PR removes the shared region.
 *
 * Two properties have to hold or the scheme is worse than the problem:
 *
 *   1. **Nothing is lost.** A fragment's category picks the release bump and
 *      its body reaches the notes — a fragment that assembles into nowhere is
 *      an entry that silently never shipped.
 *   2. **The gate cannot pass by scanning nothing.** A missing `changelog.d/`
 *      is an error, not a clean run (the empty-scan guard from #1535 / #1547).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  FRAGMENT_CATEGORIES,
  FRAGMENT_DIRNAME,
  readFragments,
  fragmentProblems,
  assembleUnreleased,
  unreleasedWithFragments,
  extractUnreleased,
  extractVersion,
  rollUnreleased,
  computeBump,
  releaseNotes,
} = require('../../../tools/changelog.js');

const ROOT = path.join(__dirname, '..', '..', '..');

/** A throwaway changelog.d/ with the given `{ name: body }` files. */
function fixture(files, { readme = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'latt-changelog-d-'));
  if (readme) fs.writeFileSync(path.join(dir, 'README.md'), '# fragments\n');
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

function changelog(unreleasedBody = '') {
  return [
    '# Changelog', '',
    '## Unreleased', '',
    unreleasedBody, '',
    '## 1.0.0 - 2026-01-01', '',
    '- initial release', '',
  ].join('\n');
}

describe('changelog fragments — reading', () => {
  test('parses the category out of the filename, sorted', () => {
    const dir = fixture({
      'b-two.fixed.md': '- two\n',
      'a-one.added.md': '- one\n',
    });
    assert.deepEqual(
      readFragments(dir).map((f) => [f.slug, f.category]),
      [['a-one', 'added'], ['b-two', 'fixed']],
    );
  });

  test('skips its own README', () => {
    assert.deepEqual(readFragments(fixture({ 'x.added.md': '- x\n' })).map((f) => f.name), ['x.added.md']);
  });

  test('a dotted slug still resolves to the trailing category', () => {
    const [f] = readFragments(fixture({ '1593.fixed-thing.changed.md': '- x\n' }));
    assert.equal(f.category, 'changed');
    assert.equal(f.slug, '1593.fixed-thing');
  });

  test('every documented category parses', () => {
    const files = Object.fromEntries(FRAGMENT_CATEGORIES.map((c) => [`s.${c}.md`, '- x\n']));
    const got = readFragments(fixture(files)).map((f) => f.category).sort();
    assert.deepEqual(got, [...FRAGMENT_CATEGORIES].sort());
  });
});

describe('changelog fragments — the gate', () => {
  const clean = (files, opts) => fragmentProblems(fixture(files, opts));

  test('a well-formed fragment is clean', () => {
    assert.deepEqual(clean({ '1593-x.changed.md': '- **Changed: a thing.** Body.\n' }), []);
  });

  test('an empty changelog.d/ (README only) is clean — nothing pending is normal', () => {
    assert.deepEqual(clean({}), []);
  });

  test('a MISSING changelog.d/ is an error, not a vacuous pass', () => {
    const gone = path.join(os.tmpdir(), 'latt-changelog-d-does-not-exist');
    fs.rmSync(gone, { recursive: true, force: true });
    const problems = fragmentProblems(gone);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /is missing/);
  });

  test('a missing README is an error — the contract needs a written home', () => {
    assert.match(clean({}, { readme: false }).join('\n'), /README\.md is missing/);
  });

  test('an unrecognized category is named, not silently binned', () => {
    // The whole reason the category is in the filename: `.fixe.md` cannot be
    // mistaken for `fixed` and quietly demoted out of the bump.
    assert.match(clean({ 'x.fixe.md': '- x\n' }).join('\n'), /does not parse/);
  });

  test('no category at all is rejected', () => {
    assert.match(clean({ 'notes.md': '- x\n' }).join('\n'), /does not parse/);
  });

  test('an upper-case slug is rejected', () => {
    assert.match(clean({ 'PR1593.added.md': '- x\n' }).join('\n'), /does not parse/);
  });

  test('a MIS-TYPED EXTENSION is rejected, not silently skipped', () => {
    // The scheme's central promise is "a typo is a loud gate failure, never a
    // fragment silently dropped". A first cut filtered on `.endsWith('.md')`
    // BEFORE the pattern, which put a whole class of typo one character to the
    // left of that promise: these were skipped, never assembled, AND never deleted
    // by the release (it only removes fragments it read), so the entry would sit
    // in the directory across every future release, invisible.
    for (const name of ['1699-x.changed.mdx', '1700-x.changed.md.bak', '1701-x.changed.markdown', 'notes.txt']) {
      assert.match(clean({ [name]: '- x\n' }).join('\n'), /does not parse/, `${name} must be rejected`);
    }
  });

  test('a subdirectory is ignored rather than read as a fragment', () => {
    const dir = fixture({ 'x.added.md': '- x\n' });
    fs.mkdirSync(path.join(dir, 'drafts'));
    assert.deepEqual(fragmentProblems(dir), []);
    assert.deepEqual(readFragments(dir).map((f) => f.name), ['x.added.md']);
  });

  test('a heading inside a fragment is rejected — the assembler owns headings', () => {
    assert.match(clean({ 'x.added.md': '### Added\n\n- x\n' }).join('\n'), /markdown heading/);
  });

  test('a body with no bullet is rejected', () => {
    assert.match(clean({ 'x.added.md': 'just a sentence\n' }).join('\n'), /does not START with a top-level/);
  });

  // The rule is FIRST line, not "somewhere in the body". `some` accepted a fragment that
  // opened with prose and buried a bullet under it — and the assembler splices that prose
  // in under `### Changed` AHEAD of the section's first bullet, which is exactly the
  // position the orphan check in changelog-integrity has to treat as authored. Two gates
  // each passing left a live path for free prose into the published release notes.
  // Found by the Munger inversion (HARD RULE #25) on #1735.
  test('a fragment that opens with PROSE and buries a bullet is rejected', () => {
    assert.match(
      clean({ 'x.added.md': 'Some framing prose first.\n\n- and the real entry\n' }).join('\n'),
      /does not START with a top-level/,
    );
  });

  test('a leading blank line is not prose — the first non-blank line decides', () => {
    assert.deepEqual(clean({ 'x.added.md': '\n\n- a real entry\n' }), []);
  });

  test('conflict markers are rejected', () => {
    assert.match(clean({ 'x.added.md': '- a\n<<<<<<< HEAD\n- b\n' }).join('\n'), /conflict markers/);
  });

  test('CR line endings are rejected', () => {
    assert.match(clean({ 'x.added.md': '- a\r\n' }).join('\n'), /CR line endings/);
  });

  test('a BOM is rejected', () => {
    assert.match(clean({ 'x.added.md': '﻿- a\n' }).join('\n'), /BOM/);
  });
});

describe('changelog fragments — assembly', () => {
  test('a fragment lands under a NEW heading when the section has none', () => {
    const out = assembleUnreleased(changelog(''), readFragments(fixture({ 'x.fixed.md': '- **Fixed: a thing.**\n' })));
    const body = extractUnreleased(out).body;
    assert.match(body, /### Fixed/);
    assert.match(body, /- \*\*Fixed: a thing\.\*\*/);
  });

  test('the block lands at the TOP of the section, ahead of what is already there', () => {
    // Not "appended to the matching heading wherever it already is": on the real
    // pre-1.0 corpus that put a brand-new entry ~1,700 lines down inside a
    // year-old `### Changed`. Newest first is how this file reads.
    const md = changelog('### Added\n\n- already here\n');
    const body = extractUnreleased(assembleUnreleased(md, readFragments(fixture({ 'x.added.md': '- brand new\n' })))).body;
    assert.ok(body.indexOf('brand new') < body.indexOf('already here'));
  });

  test('the assembled block carries exactly one heading per category', () => {
    const dir = fixture({ 'a.added.md': '- one\n', 'b.added.md': '- two\n', 'c.fixed.md': '- three\n' });
    const body = extractUnreleased(assembleUnreleased(changelog(''), readFragments(dir))).body;
    assert.equal((body.match(/^### Added$/gm) || []).length, 1);
    assert.equal((body.match(/^### Fixed$/gm) || []).length, 1);
  });

  test('the section heading keeps exactly one blank line under it — no drift per release', () => {
    const one = assembleUnreleased(changelog(''), readFragments(fixture({ 'x.added.md': '- a\n' })));
    assert.match(one, /## Unreleased\n\n### Added\n/);
    // Assembling again (a later release, into the same shape) must not stack blanks.
    const two = assembleUnreleased(one, readFragments(fixture({ 'y.fixed.md': '- b\n' })));
    assert.match(two, /## Unreleased\n\n### Fixed\n/);
    assert.ok(!/## Unreleased\n\n\n/.test(two));
  });

  test('categories are emitted in Keep-a-Changelog order regardless of filename order', () => {
    const dir = fixture({ 'z.security.md': '- sec\n', 'a.removed.md': '- rem\n', 'm.added.md': '- add\n' });
    const body = extractUnreleased(assembleUnreleased(changelog(''), readFragments(dir))).body;
    assert.ok(body.indexOf('### Added') < body.indexOf('### Removed'));
    assert.ok(body.indexOf('### Removed') < body.indexOf('### Security'));
  });

  test('several fragments in one category are all kept, filename-sorted', () => {
    const dir = fixture({ 'b.fixed.md': '- second\n', 'a.fixed.md': '- first\n' });
    const body = extractUnreleased(assembleUnreleased(changelog(''), readFragments(dir))).body;
    assert.ok(body.indexOf('- first') < body.indexOf('- second'));
    assert.equal((body.match(/^### Fixed$/gm) || []).length, 1);
  });

  test('an entry already in `## Unreleased` is never dropped', () => {
    const md = changelog('- **Fixed: an older entry.** Still here.\n');
    const out = assembleUnreleased(md, readFragments(fixture({ 'x.added.md': '- new\n' })));
    assert.match(out, /- \*\*Fixed: an older entry\.\*\* Still here\./);
  });

  test('a multi-line fragment keeps its continuation lines', () => {
    const dir = fixture({ 'x.fixed.md': '- **Fixed: a thing.** First line.\n  Continuation line.\n' });
    const body = extractUnreleased(assembleUnreleased(changelog(''), readFragments(dir))).body;
    assert.match(body, /First line\.\n {2}Continuation line\./);
  });

  test('no fragments is an identity — the changelog is returned untouched', () => {
    const md = changelog('### Fixed\n\n- x\n');
    assert.equal(assembleUnreleased(md, []), md);
  });

  test('assembly does not disturb the released section below it', () => {
    const out = assembleUnreleased(changelog('- bare bullet\n'), readFragments(fixture({ 'x.added.md': '- new\n' })));
    assert.match(out, /## 1\.0\.0 - 2026-01-01\n\n- initial release\n/);
    assert.match(out, /- bare bullet/);
  });
});

describe('changelog fragments — what the release reads', () => {
  test('a fragment ALONE is releasable content (bump + notes), with no `## Unreleased` body', () => {
    const dir = fixture({ 'x.added.md': '- **Added: a thing.**\n' });
    const body = unreleasedWithFragments(changelog(''), readFragments(dir));
    assert.equal(computeBump(body), 'minor');
    assert.match(releaseNotes(body), /Added: a thing/);
  });

  test('the category picks the bump: fixed → patch, added → minor, removed → major', () => {
    const bumpOf = (name) =>
      computeBump(unreleasedWithFragments(changelog(''), readFragments(fixture({ [name]: '- x\n' }))));
    assert.equal(bumpOf('x.fixed.md'), 'patch');
    assert.equal(bumpOf('x.added.md'), 'minor');
    assert.equal(bumpOf('x.removed.md'), 'major');
  });

  test('a **Breaking:** fragment under `fixed` still bumps major', () => {
    const dir = fixture({ 'x.fixed.md': '- **Breaking:** the `/legacy` export is gone.\n' });
    assert.equal(computeBump(unreleasedWithFragments(changelog(''), readFragments(dir))), 'major');
  });

  test('the highest of the fragments wins', () => {
    const dir = fixture({ 'a.fixed.md': '- x\n', 'b.added.md': '- y\n' });
    assert.equal(computeBump(unreleasedWithFragments(changelog(''), readFragments(dir))), 'minor');
  });

  test('fragments and an existing `## Unreleased` body are read as ONE body', () => {
    const dir = fixture({ 'x.added.md': '- from a fragment\n' });
    const body = unreleasedWithFragments(changelog('### Fixed\n\n- from the file\n'), readFragments(dir));
    assert.match(body, /from the file/);
    assert.match(body, /from a fragment/);
    assert.equal(computeBump(body), 'minor');   // Added beats Fixed
  });
});

describe('changelog fragments — the roll the release actually performs', () => {
  // tools/release.js does assemble → roll → delete. If a fragment does not land
  // in the DATED section, the entry is deleted from disk and shipped nowhere.
  test('a fragment ends up inside the dated version section, not the fresh Unreleased', () => {
    const dir = fixture({ 'x.added.md': '- **Added: a thing.**\n' });
    const rolled = rollUnreleased(assembleUnreleased(changelog(''), readFragments(dir)), '1.1.0', '2026-08-11');
    const dated = extractVersion(rolled, '1.1.0');
    assert.ok(dated, 'the dated section exists');
    assert.match(dated.body, /### Added/);
    assert.match(dated.body, /Added: a thing/);
    // …and the fresh Unreleased is empty, so the next release does not re-ship it.
    assert.equal(extractUnreleased(rolled).body.trim(), '');
  });
});

describe('changelog fragments — the live directory', () => {
  test(`the repo's own ${FRAGMENT_DIRNAME}/ is clean`, () => {
    assert.deepEqual(fragmentProblems(path.join(ROOT, FRAGMENT_DIRNAME)), []);
  });

  test('every live fragment assembles into the real changelog and survives into the notes', () => {
    const live = readFragments(path.join(ROOT, FRAGMENT_DIRNAME));
    const md = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
    const body = unreleasedWithFragments(md, live);
    for (const f of live) {
      const firstBullet = f.body.split('\n').find((l) => /^[-*]\s+\S/.test(l)).trim();
      assert.ok(body.includes(firstBullet), `${f.name}: its first bullet is missing from the assembled notes`);
    }
  });
});
