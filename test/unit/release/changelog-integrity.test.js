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
 * EVERY column-0 paragraph in `## Unreleased`, reported without judgment.
 *
 * A conflict resolved by concatenation leaves an ORPHAN: a paragraph whose first line
 * is neither a list marker nor a continuation of one — the middle of a sentence from a
 * draft that lost. That is what this file exists to catch, and it shipped three times
 * before it did.
 *
 * THIS FUNCTION MAKES NO ATTEMPT TO TELL DAMAGE FROM AUTHORSHIP, and that is the whole
 * design. A first pass at #1735 tried: a draft of that change put a curated release
 * announcement here with an authored lede, so the rule was "widened" to prose is damage
 * only ONCE AN ENTRY HAS BEGUN. The adversarial pass measured what that actually bought, and
 * it was a rout — SEVEN orphan shapes went from caught to uncaught (a section opening
 * with a table, a blockquote, an indented line, a fence, two consecutive headings), and
 * worst of all, damage APPENDED AT THE END of the section — the single likeliest
 * concatenation site, and the one the docblock above names — was silently excused,
 * because the announcement's last section is prose-only so no entry had "begun".
 * The fixture written to pin that widening tested a different shape than its own comment
 * described, and would have failed if written as described. A state machine that must
 * infer intent from shape is the wrong instrument.
 *
 * So the rule is back to its original strength — any column-0 paragraph is reported —
 * and the authored ledes are named, one by one, in SANCTIONED_UNRELEASED_PROSE. That is
 * this repo's `SANCTIONED_*` idiom and it fails BOTH ways: a new prose paragraph nobody
 * sanctioned is a failure, and a sanctioned line that no longer appears is a failure too,
 * so the list cannot rot as the announcement is edited.
 */
function columnZeroProse(section) {
  const found = [];
  let blank = true;
  let lineNo = 0;
  for (const line of section.split('\n')) {
    lineNo += 1;
    if (!line.trim()) { blank = true; continue; }
    // Only the FIRST line of a paragraph can be an orphan; the rest are its body.
    if (!blank) { blank = false; continue; }
    blank = false;
    if (/^\s/.test(line)) continue;          // indented → continuation
    if (/^[-*] /.test(line)) continue;       // a list entry
    if (/^#{2,} /.test(line)) continue;      // a heading
    if (/^(>|\||```)/.test(line)) continue;  // quote / table / fence
    found.push({ line, at: `Unreleased line ${lineNo}` });
  }
  return found;
}

/**
 * The prose paragraphs `## Unreleased` is ALLOWED to carry, matched on their first line.
 *
 * EMPTY, and that is the healthy state. `## Unreleased` is written by the fragment
 * assembler — `### Added` / `### Fixed` headings over bullets — so a paragraph at column 0
 * has no legitimate reason to be there, and the guard above is at full strength with this
 * list empty.
 *
 * It exists because #1735 briefly put a hand-curated release announcement here, with an
 * authored lede, and the first attempt at accommodating that WEAKENED THE DETECTOR instead
 * (seven damage shapes went uncaught, including damage appended at the end of the section).
 * Naming the exceptions one at a time is the shape that does not trade away coverage: an
 * entry means a human decided that paragraph belongs in the release notes, and the
 * staleness test below deletes the entry the moment the paragraph goes.
 */
const SANCTIONED_UNRELEASED_PROSE = [];

/**
 * EVERY entry line in a section, keyed by its trimmed text.
 *
 * The orphan detector above catches the concatenation that leaves a SEAM — a paragraph
 * stranded between entries. It cannot see the concatenation that leaves no seam, because
 * both sides were well-formed: keep-both-sides on a whole entry, a whole `###` group, or
 * a whole section produces a body in which every line is a heading, a bullet or a
 * continuation, and all four of the tests around it pass. Demonstrated on this file by
 * the #1777 red team: duplicating the entire `## Unreleased` body was invisible.
 *
 * What that damage DOES leave is a repeated entry, so entries are counted here.
 *
 * KEYED ON THE TRIMMED TEXT, so a copy that landed at a different indent still counts as
 * a copy. The cost of that choice is that a top-level `- Foo` and a nested `  - Foo`
 * collide; that has never occurred and it is what the sanction list below is for.
 *
 * FENCED BLOCKS ARE SKIPPED. A fragment may show a snippet — a YAML list, a shell
 * transcript — whose lines begin with `- `, and two fragments quoting the same snippet is
 * authorship, not damage. Prose bullets are the signal; fenced sample text is not.
 *
 * SKIPPING IS THE DANGEROUS HALF, so `fencedLines` below is deliberately grudging. A first
 * cut here toggled a flag on any line starting with three backticks, and one pending
 * fragment happens to say "(```markdown) cannot leak…" mid-sentence: that odd toggle turned
 * the skip on and nothing ever turned it off, so every entry after it — most of the body —
 * went uncounted, and the check passed on a body it had stopped reading. A region counts as
 * fenced only when an opener whose info string is a bare language word finds a matching
 * closer; an unmatched marker is prose and is read as prose.
 */
function fencedLines(lines) {
  const OPEN = /^(`{3,}|~{3,})[A-Za-z0-9_+-]*$/;
  const inside = new Set();
  for (let i = 0; i < lines.length; i++) {
    const open = OPEN.exec(lines[i].trim());
    if (!open) continue;
    const close = new RegExp(`^${open[1][0] === '`' ? '`' : '~'}{${open[1].length},}$`);
    for (let j = i + 1; j < lines.length; j++) {
      if (!close.test(lines[j].trim())) continue;
      for (let k = i; k <= j; k++) inside.add(k);
      i = j;
      break;
    }
  }
  return inside;
}

function entryLines(section) {
  const lines = section.split('\n');
  const fenced = fencedLines(lines);
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    if (fenced.has(i)) continue;
    const text = lines[i].trim();
    if (!/^[-*]\s+\S/.test(text)) continue;
    found.push({ text, at: `line ${i + 1}` });
  }
  return found;
}

/** Entry text that appears more than once, with where each copy sits. */
function duplicateEntries(section) {
  const seen = new Map();
  for (const { text, at } of entryLines(section)) {
    if (!seen.has(text)) seen.set(text, []);
    seen.get(text).push(at);
  }
  return [...seen]
    .filter(([, at]) => at.length > 1)
    .map(([text, at]) => ({ text, at }));
}

/**
 * Entry lines the release body is ALLOWED to repeat, matched on their trimmed text.
 *
 * EMPTY, and that is the healthy state — measured, not assumed: the assembled body carries
 * 386 entry lines today and not one of them repeats.
 *
 * A duplicate-entry check was tried in this file once before and REMOVED, because
 * `## Unreleased` then spanned the entire pre-1.0.0 backlog and already carried 18
 * verbatim-repeated entries on `main` — "a gate red on `main` is not a gate", and that was
 * the right call at the time. #1735 moved that backlog to `changelog/pre-release-archive.md`
 * and #1777 emptied the section, so the blocker is gone and the check is back.
 *
 * Same `SANCTIONED_*` idiom as the list above, failing both ways: an unsanctioned duplicate
 * is a failure, and a sanctioned line that no longer repeats is a failure too, so an entry
 * cannot outlive the duplicate it excuses.
 */
const SANCTIONED_DUPLICATE_ENTRIES = [];

describe('CHANGELOG integrity — it is a published file', () => {
  const src = fs.readFileSync(CHANGELOG, 'utf8');

  test('carries no conflict markers', () => {
    const hits = src.split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => /^(<{7}|={7}|>{7})(\s|$)/.test(line));
    assert.deepEqual(hits.map((h) => `line ${h.n}: ${h.line}`), []);
  });

  // WHAT SHIPS IS THIS FILE ALONE. `package.json` `files` carries `CHANGELOG.md` and NOT
  // `changelog/`, so a relative pointer into the archive resolves for a reader on GitHub
  // and dangles for every reader of the npm tarball or the release zip — the audience the
  // docblock above says this file is FOR. #1735 moved 18,382 lines into `changelog/` and
  // left the pointer relative; `npm pack --dry-run` lists `CHANGELOG.md` and no
  // `changelog/` entry, which is the whole argument. Both the file on disk and the
  // ASSEMBLED release body are checked, because a fragment carries the pointer too.
  test('every pointer into the repo-only `changelog/` archive is an absolute URL', () => {
    const cl = require('../../../tools/changelog.js');
    const shipped = `${src}\n${cl.unreleasedWithFragments(src)}`;
    const ARCHIVE_URL = 'https://github.com/slidewright/lattice/blob/main/changelog/';
    const bad = [];
    for (const line of shipped.split('\n')) {
      // A markdown link whose TARGET is a relative path under `changelog/`.
      if (/]\(\s*(?:\.\/)?changelog\//.test(line)) bad.push(`relative link target: ${line.trim().slice(0, 100)}`);
      // A file in the archive named without the absolute URL anywhere on the line. Keep
      // the link text and its target on ONE line, which is how every pointer reads today.
      if (/changelog\/[A-Za-z0-9._-]+\.md/.test(line) && !line.includes(ARCHIVE_URL)) {
        bad.push(`bare pointer: ${line.trim().slice(0, 100)}`);
      }
    }
    assert.deepEqual(bad, [],
      'a pointer into `changelog/` must be an absolute GitHub URL — that directory is not '
      + `in package.json \`files\`, so a relative path dangles in the shipped copy (${ARCHIVE_URL}…)`);
  });

  test('every paragraph in `## Unreleased` is an entry or a sanctioned lede', () => {
    const sanctioned = new Set(SANCTIONED_UNRELEASED_PROSE.map(([line]) => line));
    const unsanctioned = columnZeroProse(unreleased(src))
      .filter((p) => !sanctioned.has(p.line))
      .map((p) => `${p.at}: ${p.line.slice(0, 90)}`);
    assert.deepEqual(unsanctioned, [],
      'a paragraph in `## Unreleased` is neither a list entry nor sanctioned prose — '
      + 'either it is the signature of a conflict resolved by keeping both sides, or it is '
      + 'authored copy that belongs in SANCTIONED_UNRELEASED_PROSE with a reason');
  });

  // EXACTLY once, not merely present. A conflict resolved by keeping both sides duplicates
  // the sanctioned line rather than removing it, so a presence check reads that as healthy.
  test('every sanctioned prose entry appears exactly once', () => {
    const counts = new Map();
    for (const p of columnZeroProse(unreleased(src))) counts.set(p.line, (counts.get(p.line) || 0) + 1);
    const wrong = SANCTIONED_UNRELEASED_PROSE
      .filter(([line]) => (counts.get(line) || 0) !== 1)
      .map(([line, why]) => `${why}: seen ${counts.get(line) || 0}x — ${line.slice(0, 70)}`);
    assert.deepEqual(wrong, [],
      'a sanctioned prose line appears zero times (stale entry — delete it) or more than '
      + 'once (a conflict resolved by keeping both sides)');
  });

  // The guard has to read what SHIPS, not just what is on disk. The release notes are the
  // ASSEMBLED body — `## Unreleased` with every pending fragment spliced in — and until
  // this test existed the detector had no jurisdiction over it at all.
  test('the ASSEMBLED release body carries no orphan prose either', () => {
    const cl = require('../../../tools/changelog.js');
    const assembled = cl.unreleasedWithFragments(src);
    const sanctioned = new Set(SANCTIONED_UNRELEASED_PROSE.map(([line]) => line));
    const orphans = columnZeroProse(`## Unreleased\n${assembled}`)
      .filter((p) => !sanctioned.has(p.line))
      .map((p) => p.line.slice(0, 90));
    assert.deepEqual(orphans, [],
      'the assembled release notes carry a column-0 paragraph — a fragment opening with '
      + 'prose, or damage in `## Unreleased`. This is the text that becomes the public '
      + 'GitHub Release body.');
  });

  // The seamless half of the same failure: keep-both-sides on a whole entry or a whole
  // section leaves no orphan paragraph, so every check above reads it as healthy. What it
  // leaves is a repeated entry.
  test('`## Unreleased` repeats no entry line', () => {
    const sanctioned = new Set(SANCTIONED_DUPLICATE_ENTRIES.map(([text]) => text));
    const dupes = duplicateEntries(unreleased(src))
      .filter((d) => !sanctioned.has(d.text))
      .map((d) => `${d.at.join(', ')} (×${d.at.length}): ${d.text.slice(0, 90)}`);
    assert.deepEqual(dupes, [],
      'an entry line appears more than once in `## Unreleased` — the signature of a '
      + 'conflict resolved by keeping both sides, this time with no orphan paragraph to '
      + 'give it away. If the repetition is deliberate, it belongs in '
      + 'SANCTIONED_DUPLICATE_ENTRIES with a reason');
  });

  // Same jurisdiction argument as the orphan check above: `## Unreleased` is empty most of
  // the time now, so the body that actually ships is the assembled one — and a fragment
  // duplicated (copied to a second filename, or its own entry pasted twice) shows up here
  // and nowhere else.
  test('the ASSEMBLED release body repeats no entry line either', () => {
    const cl = require('../../../tools/changelog.js');
    const sanctioned = new Set(SANCTIONED_DUPLICATE_ENTRIES.map(([text]) => text));
    const dupes = duplicateEntries(`## Unreleased\n${cl.unreleasedWithFragments(src)}`)
      .filter((d) => !sanctioned.has(d.text))
      .map((d) => `×${d.at.length}: ${d.text.slice(0, 90)}`);
    assert.deepEqual(dupes, [],
      'an entry line is repeated in the assembled release notes — two fragments carrying '
      + 'the same bullet, one fragment copied to a second filename, or damage in '
      + '`## Unreleased`. This is the text that becomes the public GitHub Release body.');
  });

  test('every sanctioned duplicate entry still repeats', () => {
    const cl = require('../../../tools/changelog.js');
    const repeated = new Set(
      duplicateEntries(`## Unreleased\n${cl.unreleasedWithFragments(src)}`).map((d) => d.text),
    );
    const stale = SANCTIONED_DUPLICATE_ENTRIES
      .filter(([text]) => !repeated.has(text))
      .map(([text, why]) => `${why}: no longer repeats — ${text.slice(0, 70)}`);
    assert.deepEqual(stale, [],
      'a sanctioned duplicate no longer appears twice — delete the entry, or the list '
      + 'starts excusing damage nobody has looked at');
  });

  // FIXTURES for the detector itself, because a guard that is never shown failing is a
  // guard nobody has tested. Each case is a shape the checks above would have to catch on
  // the real file, driven through the SAME function they call.
  describe('duplicateEntries — the shapes it must catch, and the ones it must not', () => {
    const ENTRY_A = '- **Fixed: the roadmap lane no longer clips its last milestone.** The lane';
    const ENTRY_B = '- **Added: a second thing.** With a body line of its own.';
    const SECTION = ['## Unreleased', '', '### Fixed', '', ENTRY_A, '  measured too early.', '', '### Added', '', ENTRY_B, ''].join('\n');

    test('a whole section duplicated — the #1777 demonstration — is caught', () => {
      const damaged = `${SECTION}\n${SECTION.replace('## Unreleased\n', '')}`;
      const found = duplicateEntries(damaged).map((d) => d.text);
      assert.deepEqual(found.sort(), [ENTRY_B, ENTRY_A].sort(),
        'both entries appear twice — every line of this body is a heading, a bullet or a '
        + 'continuation, so the orphan checks see nothing');
    });

    test('a single entry pasted twice is caught (no orphan, no seam)', () => {
      const damaged = SECTION.replace(ENTRY_A, `${ENTRY_A}\n  measured too early.\n\n${ENTRY_A}`);
      assert.deepEqual(duplicateEntries(damaged).map((d) => d.text), [ENTRY_A]);
    });

    test('a copy that landed at a different indent is still a copy', () => {
      assert.deepEqual(duplicateEntries(`${SECTION}\n  ${ENTRY_A}\n`).map((d) => d.text), [ENTRY_A]);
    });

    test('the healthy section is clean', () => {
      assert.deepEqual(duplicateEntries(SECTION), []);
    });

    test('a repeated CONTINUATION line is not damage (only entries are counted)', () => {
      // Two entries can genuinely wrap onto the same words. Counting those would make the
      // gate red for authorship, which is how the first version of this check died.
      const wrapped = `${SECTION}\n- **Changed: a third thing.**\n  measured too early.\n`;
      assert.deepEqual(duplicateEntries(wrapped), []);
    });

    test('a bullet quoted inside a fence is sample text, not an entry', () => {
      const fenced = [SECTION, '', '- **Added: a config key.**', '', '  ```yaml', '  - item', '  - item', '  ```', ''].join('\n');
      assert.deepEqual(duplicateEntries(fenced), []);
    });

    // The hole this check shipped with for about an hour, and the reason the skip is
    // grudging: a fragment on `main` says "(```markdown) cannot leak…" mid-sentence. Read
    // as a fence opener with no closer, it blinds the detector for the whole rest of the
    // body — a check that passes because it stopped looking is worse than no check.
    test('an unmatched fence marker in prose does not blind the detector', () => {
      const damaged = [
        '## Unreleased',
        '',
        '### Changed',
        '',
        '- **Changed: a nested body (```markdown) cannot leak its headings.** Prose, not a fence.',
        '',
        ENTRY_A,
        '',
        ENTRY_A,
        '',
      ].join('\n');
      assert.deepEqual(duplicateEntries(damaged).map((d) => d.text), [ENTRY_A],
        'the duplicate sits AFTER the stray marker — it must still be seen');
    });
  });
});
