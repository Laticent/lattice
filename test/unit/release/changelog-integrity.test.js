/**
 * The CHANGELOG ships. `package.json` `files` includes it, so a mangled entry is
 * not a cosmetic problem — it is in the tarball.
 *
 * WHY THIS EXISTS. `CHANGELOG.md` is the file every branch touches and therefore
 * the file that conflicts on every rebase. The mechanical resolution (HARD RULE
 * #16 says resolve these "mechanically and force-push silently") is to keep both
 * sides — and keeping both sides is exactly how a stale earlier draft of your own
 * entry survives next to the current one. That shipped once on this branch and was
 * re-introduced twice more by later rebases, each time invisible to `lint`, the
 * unit suite, `build:check`, the integration tier and the 150-render gate, because
 * none of them read prose.
 *
 * The failure has a signature a machine can see: a conflict resolved by
 * concatenation leaves a paragraph that never begins with a list marker, sitting
 * between entries. So that is what this checks — not spelling, not style, just the
 * structural damage that a bad merge leaves behind.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');

/** The `## Unreleased` section — where every conflict actually lands. */
function unreleased(src) {
  const start = src.indexOf('\n## Unreleased');
  assert.ok(start !== -1, 'CHANGELOG.md has no `## Unreleased` section');
  const after = src.indexOf('\n## ', start + 1);
  return src.slice(start, after === -1 ? undefined : after);
}

describe('CHANGELOG integrity — it is a published file', () => {
  const src = fs.readFileSync(CHANGELOG, 'utf8');

  test('carries no conflict markers', () => {
    const hits = src.split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /^(<{7}|={7}|>{7})(\s|$)/.test(line));
    assert.deepEqual(hits.map((h) => `line ${h.n}: ${h.line}`), []);
  });

  test('every paragraph in `## Unreleased` belongs to an entry', () => {
    // A conflict resolved by concatenation leaves an ORPHAN: a paragraph whose
    // first line is neither a list marker nor a continuation of one — it is the
    // middle of a sentence from a draft that lost. Entries are `- **…**`; their
    // continuation lines are indented. Anything else at column 0 is damage.
    const orphans = [];
    let blank = true;
    let lineNo = 0;
    for (const line of unreleased(src).split('\n')) {
      lineNo += 1;
      if (!line.trim()) { blank = true; continue; }
      // Only the FIRST line of a paragraph can be an orphan; the rest are its body.
      if (!blank) { blank = false; continue; }
      blank = false;
      if (/^\s/.test(line)) continue;          // indented → continuation
      if (/^[-*] /.test(line)) continue;       // a list entry
      if (/^#{2,} /.test(line)) continue;      // a heading
      if (/^(>|\||```)/.test(line)) continue;  // quote / table / fence
      orphans.push(`Unreleased line ${lineNo}: ${line.slice(0, 90)}`);
    }
    assert.deepEqual(orphans, [],
      'a paragraph in `## Unreleased` starts at column 0 without a list marker — '
      + 'the signature of a conflict resolved by keeping both sides');
  });

  // A duplicate-ENTRY check was tried here and removed: `## Unreleased` in this repo
  // spans the entire pre-1.0.0 backlog, and it already carries 18 verbatim-repeated
  // entry lines on `main` — pre-existing, none of them merge damage. A gate that is
  // red on `main` is not a gate. The orphan check above is the one that catches the
  // failure this file exists for, and it caught it twice while being written.
});
