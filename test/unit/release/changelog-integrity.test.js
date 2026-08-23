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

/**
 * Column-0 paragraphs that are DAMAGE rather than authorship.
 *
 * A conflict resolved by concatenation leaves an ORPHAN: a paragraph whose first line
 * is neither a list marker nor a continuation of one — the middle of a sentence from a
 * draft that lost. It lands BETWEEN or AFTER entries, because that is where the
 * conflicting hunks were.
 *
 * WIDENED (#1735), and the boundary is the point. `## Unreleased` used to be nothing
 * but entries, so "column 0 and not a bullet" was a complete description of the damage.
 * It now opens as the curated release announcement, which legitimately has a lede under
 * `## Unreleased` and under its `###` capability headings. So the rule is no longer
 * "prose is damage" but "prose is damage ONCE AN ENTRY HAS BEGUN": a lede precedes the
 * first bullet of its section, an orphan follows one. Every heading resets that state,
 * which is what keeps a real orphan under a LATER heading visible instead of being
 * excused as that section's lede.
 */
function orphanParagraphs(section) {
  const orphans = [];
  let blank = true;
  let entered = false; // has a list entry begun under the current heading?
  let lineNo = 0;
  for (const line of section.split('\n')) {
    lineNo += 1;
    if (!line.trim()) { blank = true; continue; }
    // Only the FIRST line of a paragraph can be an orphan; the rest are its body.
    if (!blank) { blank = false; continue; }
    blank = false;
    if (/^\s/.test(line)) continue;                        // indented → continuation
    if (/^[-*] /.test(line)) { entered = true; continue; } // a list entry
    if (/^#{2,} /.test(line)) { entered = false; continue; } // a heading — new section
    if (/^(>|\||```)/.test(line)) continue;                // quote / table / fence
    if (!entered) continue;                                // a section lede, authored
    orphans.push(`Unreleased line ${lineNo}: ${line.slice(0, 90)}`);
  }
  return orphans;
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
    assert.deepEqual(orphanParagraphs(unreleased(src)), [],
      'a paragraph in `## Unreleased` starts at column 0 AFTER an entry has begun — '
      + 'the signature of a conflict resolved by keeping both sides');
  });

  // The guard has to keep working, and its own widening is the likeliest way for it
  // to stop: "allow a lede" is one edit away from "allow anything". So the damage it
  // was built for is pinned here as a fixture rather than trusted to stay caught.
  test('still catches the damage it exists for', () => {
    const concatenated = [
      '## Unreleased', '',
      '### Fixed', '',
      '- **A real entry.** With a body.', '',
      'a stale earlier draft of that entry, kept by a bad merge', '',
    ].join('\n');
    assert.equal(orphanParagraphs(concatenated).length, 1,
      'an orphan paragraph sitting after an entry must still be reported');

    // …and a lede is still only a lede while nothing has been entered under the
    // heading it follows. Prose after a bullet is damage even under a fresh heading.
    const proseAfterEntry = [
      '## Unreleased', '',
      '### Engine', '',
      '- **An entry.**', '',
      'trailing prose that is not a lede', '',
    ].join('\n');
    assert.equal(orphanParagraphs(proseAfterEntry).length, 1);
  });

  // A duplicate-ENTRY check was tried here and removed: `## Unreleased` in this repo
  // spans the entire pre-1.0.0 backlog, and it already carries 18 verbatim-repeated
  // entry lines on `main` — pre-existing, none of them merge damage. A gate that is
  // red on `main` is not a gate. The orphan check above is the one that catches the
  // failure this file exists for, and it caught it twice while being written.
});
