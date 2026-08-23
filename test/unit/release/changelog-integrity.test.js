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

/** Where the archive actually lives, for the humans reading a refusal. */
const ARCHIVE_URL = 'https://github.com/slidewright/lattice/blob/main/changelog/';

/**
 * Is this link target the archive on GitHub?
 *
 * PARSED, not substring-matched. `line.includes(ARCHIVE_URL)` was the first cut and CodeQL
 * was right to flag it (js/incomplete-url-substring-sanitization): the archive URL can sit
 * ANYWHERE in a longer string, so `https://elsewhere.example/?u=https://github.com/…/changelog/`
 * satisfied it and the pointer a reader actually follows was never checked. The host is
 * compared exactly and the path by prefix.
 */
function isArchiveUrl(target) {
  let url;
  try {
    url = new URL(target);
  } catch {
    return false;  // relative, or not a URL at all
  }
  return url.protocol === 'https:'
    && url.host === 'github.com'
    && url.pathname.startsWith('/slidewright/lattice/blob/main/changelog/');
}

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
 * NORMALIZED, so a copy is still a copy when the paste moved it: the indent goes, the
 * bullet marker and the space after it are flattened (`* Foo`, `-  Foo` and `  - Foo` all
 * key as `- Foo`). The cost is that a top-level entry and a nested sub-bullet with the
 * same words collide — that has never occurred here, and the sanction list below is where
 * it would go. What still slips is a copy whose TEXT differs (an added period, a
 * substituted space); keep-both-sides preserves bytes, so those are damage only when the
 * two sides had genuinely diverged.
 *
 * NO LINE IS SKIPPED — not even a bullet inside a fenced code sample, which is a real
 * false positive this deliberately accepts. Two earlier cuts skipped fenced regions, and
 * BOTH had a blind window instead of a false positive:
 *
 *   1. A flag toggled by any line starting with three backticks. One pending fragment has
 *      a continuation line beginning "```markdown) cannot leak…" — mid-sentence prose, an
 *      odd toggle — so the skip turned on and nothing turned it off, and the check passed
 *      on a body it had stopped reading from that line to the end.
 *   2. A strict opener paired with its closer. Two stray markers, or one stray plus the
 *      closer of an unrelated real fence later in the body, swallow everything between
 *      them: measured on a three-fragment corpus where genuine duplicated entries sat in
 *      that gap and the whole suite stayed green.
 *
 * A guard that goes quiet is worse than one that shouts at the wrong thing. There is no
 * fenced sample in the assembled body today, and if one lands with a repeated `- ` line
 * the failure is LOUD and its remedy is one sanctioned entry with a reason.
 */
function entryLines(section) {
  const found = [];
  section.split('\n').forEach((line, i) => {
    const text = line.trim();
    if (!/^[-*]\s+\S/.test(text)) return;
    found.push({ text: text.replace(/^[-*]\s+/, '- '), at: `line ${i + 1}` });
  });
  return found;
}

/** How many entry lines in `section` normalize to `text`. */
function entryCount(section, text) {
  return entryLines(section).filter((e) => e.text === text).length;
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
 * Entry lines the release body is ALLOWED to repeat: `[text, copies, why]`.
 *
 * EMPTY, and that is the healthy state — measured through the detector above rather than
 * assumed: the assembled body carries 390 entry lines today and not one of them repeats.
 *
 * A duplicate-entry check was tried in this file once before and REMOVED, because
 * `## Unreleased` then spanned the entire pre-1.0.0 backlog and already carried repeated
 * entries on `main` (the note that removed it counted 18) — "a gate red on `main` is not a
 * gate", and that was the right call at the time. #1735 moved that backlog to
 * `changelog/pre-release-archive.md` and #1777 emptied the section, so the blocker is gone
 * and the check is back. Worth knowing about that backlog, because it undercuts the claim
 * that those repeats were all authorship: `changelog/pre-release-archive.md:11618` and
 * `:11654` carry a block repeated verbatim 36 lines apart (2 entries repeat in that
 * window), and the first copy breaks off mid-sentence — "…because the radar's / neighbor."
 * That is keep-both-sides, and the seam lands on an indented continuation line where the
 * orphan detector above cannot see it.
 *
 * COPIES IS A COUNT, not a licence. The sibling prose list insists a sanctioned line appear
 * EXACTLY once for the same reason: a keep-both-sides duplicates the sanctioned line rather
 * than removing it, so "is it in the list" reads damage as health. A sanction here says how
 * many copies a human looked at; a further copy fails, and so does dropping to one.
 */
const SANCTIONED_DUPLICATE_ENTRIES = [];

/** A duplicate is excused only when its COPY COUNT is the sanctioned one. */
function sanctionedFor(dupe) {
  return SANCTIONED_DUPLICATE_ENTRIES.some(([text, copies]) => text === dupe.text && copies === dupe.at.length);
}

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
    const bad = [];
    for (const line of shipped.split('\n')) {
      const targets = [...line.matchAll(/]\(\s*([^)\s]+)/g)].map((m) => m[1]);
      // A markdown link whose TARGET is a relative path under `changelog/`.
      if (targets.some((t) => /^(?:\.\/)?changelog\//.test(t))) {
        bad.push(`relative link target: ${line.trim().slice(0, 100)}`);
      }
      // A file in the archive NAMED on a line that carries no link to the archive. Keep the
      // link text and its target on ONE line, which is how every pointer reads today.
      if (/changelog\/[A-Za-z0-9._-]+\.md/.test(line) && !targets.some(isArchiveUrl)) {
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
    const dupes = duplicateEntries(unreleased(src))
      .filter((d) => !sanctionedFor(d))
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
    const dupes = duplicateEntries(`## Unreleased\n${cl.unreleasedWithFragments(src)}`)
      .filter((d) => !sanctionedFor(d))
      .map((d) => `×${d.at.length}: ${d.text.slice(0, 90)}`);
    assert.deepEqual(dupes, [],
      'an entry line is repeated in the assembled release notes — two fragments carrying '
      + 'the same bullet, one fragment copied to a second filename, or damage in '
      + '`## Unreleased`. This is the text that becomes the public GitHub Release body.');
  });

  // Both ways, and on the COUNT. A sanction that only says "this line may repeat" would be
  // permanently blind to the next copy of it — the same presence-check mistake the prose
  // list above avoids by insisting on exactly once.
  test('every sanctioned duplicate still repeats exactly as many times as sanctioned', () => {
    const cl = require('../../../tools/changelog.js');
    const body = `## Unreleased\n${cl.unreleasedWithFragments(src)}`;
    const wrong = SANCTIONED_DUPLICATE_ENTRIES
      .map(([text, copies, why]) => ({ text, copies, why, seen: entryCount(body, text) }))
      .filter((s) => s.seen !== s.copies)
      .map((s) => `${s.why}: sanctioned ${s.copies}, seen ${s.seen} — ${s.text.slice(0, 70)}`);
    assert.deepEqual(wrong, [],
      'a sanctioned duplicate appears a different number of times than the sanction '
      + 'records — a new copy nobody looked at, or a stale entry to delete');
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

    test('a copy with a different bullet marker or spacing is still a copy', () => {
      const damaged = `${SECTION}\n${ENTRY_A.replace(/^- /, '*  ')}\n`;
      assert.deepEqual(duplicateEntries(damaged).map((d) => d.text), [ENTRY_A],
        'the paste normalizes to the same entry — marker and spacing are not content');
    });

    // THE FENCE CASES, and they are the accepted cost rather than a capability. Two
    // earlier cuts skipped fenced regions and both had a blind window instead: the
    // stray-marker line below is real prose from a pending fragment, and under a naive
    // fence toggle it turns the detector off for the rest of the body. Skipping nothing
    // means a repeated `- ` inside a code sample is reported — loudly, and sanctionable —
    // while damage after a stray marker can never go unread.
    const STRAY = '  ```markdown) cannot leak the headings inside it as real fields.';

    test('sample text in a fence IS counted — the deliberate false positive', () => {
      const fenced = [SECTION, '', '- **Added: a config key.**', '', '  ```yaml', '  - item', '  - item', '  ```', ''].join('\n');
      assert.deepEqual(duplicateEntries(fenced).map((d) => d.text), ['- item'],
        'a repeated bullet in a sample is reported; the remedy is a sanction with a reason, '
        + 'not a skip rule that can go quiet');
    });

    test('a stray fence marker in prose does not blind the detector', () => {
      const damaged = ['## Unreleased', '', '### Changed', '', '- **Changed: a nested body.**', STRAY, '', ENTRY_A, '', ENTRY_A, ''].join('\n');
      assert.deepEqual(duplicateEntries(damaged).map((d) => d.text), [ENTRY_A],
        'the duplicate sits AFTER the stray marker — it must still be seen');
    });

    test('two stray markers do not swallow the damage between them', () => {
      // The second cut's hole: a strict opener paired with the closer of an unrelated
      // fence later on, with real duplicates in the gap and the suite green.
      const damaged = ['## Unreleased', '', '### Changed', '', '- **Changed: a nested body.**', STRAY, '', ENTRY_A, '', ENTRY_A, '', '  ```', '', ENTRY_B, ''].join('\n');
      assert.deepEqual(duplicateEntries(damaged).map((d) => d.text), [ENTRY_A]);
    });
  });
});
