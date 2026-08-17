#!/usr/bin/env node

/**
 * build-decisions-index.js — regenerate the "Current notes" index in
 * engineering/decisions/README.md from each note's YAML front-matter.
 *
 * Why this exists: a hand-maintained index drifts (entries go stale, statuses
 * lie, new notes never get listed). The front-matter is the single source of
 * truth; this renders it. See engineering/decisions/README.md § Status lifecycle
 * and engineering/decisions/2026-06-17-workflow-efficiency-review.md §A.
 *
 * WHAT A ROW CARRIES — a one-line GIST, not the whole summary. The index is a
 * pick-list: its job is to get a reader to the right note, and the note itself is
 * where the full account lives. Rendering every `summary:` in full made this file
 * 395 KB (96k tokens, measured) — an index that cost more to read than the five notes
 * anyone actually wanted, so in practice nobody read it and the record it indexes
 * went unfound. `gistFor` cuts each summary to its first sentence, capped at
 * GIST_CAP characters. Nothing is lost: the full summary is in the note's own
 * front-matter, one click (or one `head`) away, and the one-line form makes the
 * index GREPPABLE — `grep -i mermaid README.md` now returns lines, not paragraphs.
 * That grep IS the access pattern `CLAUDE.md` prescribes, and it is what the index is
 * budgeted against: see `ROW_CAP` below for why the budget is per-row and not per-file.
 *
 * Each note (engineering/decisions/YYYY-MM-DD-*.md, excluding README.md) must
 * carry front-matter:
 *   ---
 *   status: proposed | in-progress | blocked | shipped | superseded
 *   summary: one line, no trailing period needed
 *   superseded-by: 2026-06-18-foo.md   # optional, for status: superseded
 *   ---
 * `created` is derived from the filename date (not duplicated in front-matter).
 *
 * `summary` may also be written as a YAML BLOCK SCALAR, which is what most notes
 * reach for once the summary outgrows a comfortable single line:
 *   ---
 *   status: shipped
 *   summary: >
 *     The first line of a summary that would be unreadable
 *     as one 1,500-character line.
 *   ---
 * Folded (`>`) and literal (`|`) headers are both accepted, with or without
 * indentation/chomping indicators, and both collapse to the one line the index
 * row renders. A header with no indented block beneath it is an ERROR, not a
 * silently empty row.
 *
 * Usage:
 *   node tools/build-decisions-index.js            # rewrite the README index
 *   node tools/build-decisions-index.js --check    # exit 1 if the index is wrong
 *                                                   # about a note, or any note
 *                                                   # is malformed
 *
 * WRITE and CHECK are deliberately not the same assertion (#1547). Write emits the
 * canonical block — one sorted, fully-normalized rendering. Check verifies something
 * weaker on purpose: every note has its own correct row, in the right group, and no
 * row is orphaned or duplicated. It does NOT assert row ORDER, and the block carries
 * no totals for it to assert.
 *
 * Why weaker: this file is GENERATED FROM EVERY NOTE and COMMITTED, so a PR adding a
 * note commits an index that is only correct until the next decision-doc PR merges.
 * The merge queue rebases onto current `main` and re-runs CI there, so the second PR
 * to merge failed `build:check` inside the queue and was ejected — green on its own
 * head, red on a `main` it had never seen, with the ejection silently clearing its
 * auto-merge flag.
 *
 * What decides which shape the race takes is WHERE THE TWO ROWS INSERT, and nothing
 * else. Measured with `git merge-file`: two insertions at the SAME position conflict,
 * and two at ANY different positions merge cleanly — even immediately adjacent ones.
 * Rows sort by date descending then filename, so:
 *
 *   - the two new notes sort as IMMEDIATE NEIGHBORS, nothing already between them →
 *     one insertion point → a textual git CONFLICT. Visible on the PR and resolved
 *     mechanically (HARD RULE #16) — but resolving it by keeping both sides leaves the
 *     rows in MERGE order, not sort order, which a byte-comparison would reject in
 *     turn. This is the RARE case: it needs the two notes to be neighbors among ~380.
 *   - the two notes are in DIFFERENT STATUS GROUPS → the footer counts each group
 *     separately, so the two sides rewrite that line to DIFFERENT text and git raises an
 *     ordinary conflict. Also visible.
 *   - ANY other placement → git merges the two rows CLEANLY, both present and both
 *     correct, and the ONLY thing wrong in the merged file is the footer's
 *     `_N notes — …_` tally: both sides rewrote that one line to the same `+1` text,
 *     so git took it without a conflict and the count came out one short. This is the
 *     common case, and the SILENT one. It is what ejected #1535 — whose two notes
 *     shared a date but had a third same-date note sorting between them.
 *
 * DATES do not decide it, which is worth stating because it is the intuitive guess and
 * #1535 is its counterexample: same-date notes merge cleanly when anything sorts
 * between them, and different-date notes conflict when nothing does.
 *
 * The fix is therefore two independent halves, closing different cases:
 *
 *   - DELETING THE TALLY closes the silent case. An aggregate over every note is the
 *     one line two concurrent PRs cannot both be right about, and a number that must be
 *     forgiven when wrong is worse than no number; the rows are the record. With it
 *     gone a cleanly-merged index is byte-canonical again on its own — so this half
 *     would work even without the second.
 *   - RELAXING ROW ORDER closes the conflict case, by making a keep-both-sides
 *     resolution legal without a regeneration.
 *
 * Everything a PR can actually be held responsible for — its own note's row — is still
 * gated, and a note missing from the index still fails.
 */

const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'engineering', 'decisions');
const README = path.join(DIR, 'README.md');
const BEGIN = '<!-- decisions-index:begin -->';
const END = '<!-- decisions-index:end -->';

// Closed status vocabulary → display glyph + which index group it lands in.
const STATUS = {
  proposed:      { glyph: '☐', group: 'active' },
  'in-progress': { glyph: '◐', group: 'active' },
  blocked:       { glyph: '⏸', group: 'active' },
  shipped:       { glyph: '☑', group: 'shipped' },
  superseded:    { glyph: '⊘', group: 'historical' },
};

const GROUPS = [
  ['active', '### Active — proposed · in-progress · blocked'],
  // NOT "pending teardown". That heading asserted a process that never ran once in
  // 391 notes, and the folder is a dated archive by decision (#1597, 2026-08-11) —
  // a stale claim in a generated file is exactly what this repo treats as a defect.
  ['shipped', '### Shipped — the work landed; the note stays as the record'],
  ['historical', '### Historical — superseded'],
];
const HEADING_GROUP = new Map(GROUPS.map(([group, heading]) => [heading, group]));

// The block's closing line. It deliberately carries NO totals — see the header
// comment: a tally over every note is the one line two concurrent decision-doc PRs
// cannot both be right about, and it is what ejected #1535 from the merge queue.
const FOOTER =
  "_Generated by `npm run decisions:index` from each note's front-matter — edit the " +
  'front-matter, not this list. Each row is a one-line GIST (first sentence, capped); ' +
  "the full summary is in the note's own front-matter. No totals here on purpose: an " +
  'aggregate over every note is the one line two concurrent decision-doc PRs cannot ' +
  'both get right (#1547)._';

const NAME_RE = /^(\d{4}-\d{2}-\d{2})-.*\.md$/;

// A YAML BLOCK SCALAR header: `>` (folded) or `|` (literal), optionally with an
// indentation indicator and/or a chomping indicator (`>-`, `|+`, `>2-`, …).
const BLOCK_SCALAR = /^([|>])([1-9]?)([+-]?)$/;

/**
 * Minimal front-matter reader: the leading `---\n…\n---` block, parsed as
 * `key: value` lines. Returns null if absent.
 *
 * Handles the two shapes notes are actually written in:
 *
 *   summary: one line                 → taken verbatim
 *   summary: >                        → the indented block that follows, folded
 *     first line
 *     second line
 *
 * The folded form is why this function is not three lines long. It was flat-only
 * for a long time, which meant `summary: >` parsed as the literal string `>` —
 * non-empty, so it sailed past the `if (!fm.summary)` guard — and 59 notes
 * rendered an index row reading `— >` with the summary silently dropped
 * (#1310). Nothing failed; the index just quietly stopped describing a sixth of
 * the record. 59 authors independently reaching for `summary: >` is the
 * convention saying what it wants, so the reader learns the form rather than the
 * notes being migrated to a 1,500-character single line.
 *
 * Both block styles collapse to ONE line here. A folded scalar means that in
 * YAML anyway; a literal one does not, but every consumer of this front matter
 * renders a single-row list item, so a summary that kept its newlines would
 * break the row it is destined for. Collapsing is the honest reading of the
 * field's contract, and `collect()` rejects a header with no block after it.
 */
function frontMatter(raw) {
  const text = raw.replace(/\r\n/g, '\n'); // tolerate CRLF-saved notes
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 4);
  if (end === -1) return null;
  const lines = text.slice(4, end + 1).split('\n');
  const out = {};
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const m = line.match(/^([a-z-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawValue] = m;
    const value = rawValue.trim();
    const block = value.match(BLOCK_SCALAR);
    if (!block) {
      out[key] = value.replace(/^["']|["']$/g, '');
      continue;
    }
    // Consume the indented block: every following line that is blank or indented
    // past column 0. A key at column 0 ends it, exactly as YAML says.
    const body = [];
    let j = i + 1;
    for (; j < lines.length; j += 1) {
      const next = lines[j];
      if (next.trim() && !/^\s/.test(next)) break;
      body.push(next);
    }
    i = j - 1;
    // Drop trailing blanks, then fold to one line on any whitespace run. An
    // explicit indentation indicator needs no special handling once folded.
    while (body.length && !body[body.length - 1].trim()) body.pop();
    out[key] = body.join(' ').trim().replace(/\s+/g, ' ');
  }
  return out;
}

function collect() {
  const notes = [];
  const errors = [];
  for (const file of fs.readdirSync(DIR).sort()) {
    if (file === 'README.md' || !file.endsWith('.md')) continue;
    const nm = file.match(NAME_RE);
    if (!nm) {
      errors.push(`${file}: filename must be YYYY-MM-DD-topic.md`);
      continue;
    }
    const fm = frontMatter(fs.readFileSync(path.join(DIR, file), 'utf8'));
    if (!fm) {
      errors.push(`${file}: missing YAML front-matter (need status: + summary:)`);
      continue;
    }
    if (!fm.status || !STATUS[fm.status]) {
      errors.push(`${file}: status must be one of ${Object.keys(STATUS).join(' | ')} (got ${JSON.stringify(fm.status)})`);
      continue;
    }
    // Covers BOTH ways a summary comes back empty: no `summary:` key at all, and
    // a block-scalar header (`summary: >`) with nothing indented beneath it —
    // which folds to '' rather than to the literal '>' that used to sail through
    // this guard and render a row reading `— >` (#1310). The gate fails either
    // way now, because an index row with no summary is a row nobody opens.
    if (!fm.summary) {
      errors.push(`${file}: summary: is missing or empty — give it one line, or a \`>\` block with the text indented beneath it`);
      continue;
    }
    if (fm.summary.includes(BEGIN) || fm.summary.includes(END)) {
      errors.push(`${file}: summary must not contain the index marker comment`);
      continue;
    }
    notes.push({ file, created: nm[1], status: fm.status, summary: fm.summary, supersededBy: fm['superseded-by'] });
  }
  return { notes, errors };
}

// How many characters of summary a row may carry. Sized from the corpus: at 140,
// 220 of 425 first sentences land whole, and the file totals 98 KB (27.1k tokens)
// against 395 KB (96k) for the full summaries. Raising it buys little — the
// distribution has a long tail — and every character is paid 425 times.
const GIST_CAP = 140;

// A sentence end is punctuation followed by whitespace or end-of-string, so `v1.2`,
// `#1547.` mid-sentence, and `…marp-cli.` all read correctly. The `{20,}` floor stops
// a summary opening with an abbreviation from cutting to three words.
const FIRST_SENTENCE = /^(.{20,}?[.!?])(\s|$)/;

// Endings that look like a sentence stop but are not. A first sentence ending here has
// been cut mid-thought, and the row would present half a clause as a whole claim.
const ABBREVIATION = /\b(vs|e\.g|i\.e|etc|cf|approx|fig|no|vol|ch|st|dr|mr|ms|jr|sr|inc|ltd|al)\.$/i;

// Below this, a "first sentence" identifies nothing — "G8 Studio performance." (22
// chars) is a label, not a gist, and a reader cannot choose a note from it. Set just
// above that and no higher: "The root cause was a stale token." (33) is short but does
// identify its note, and a floor that swallows sentences like it makes rows longer for
// no gain. Measured against the live corpus at 30, three rows read on.
const MIN_INFORMATIVE = 30;

/**
 * Close a code span the cut opened. `gistFor` slices by characters, so it can land
 * between a pair of backticks and ship a row with an odd count. One live row read
 * "…binding ONE axis — `height:100cqh" with a dangling tick, which renders as a
 * literal backtick and can swallow following text into a code span.
 */
function balanceCodeSpans(text) {
  const ticks = (text.match(/`/g) ?? []).length;
  if (ticks % 2 === 0) return text;
  return text.slice(0, text.lastIndexOf('`')).replace(/[\s,;:.—-]+$/, '');
}

/**
 * One line of summary for a row: the first sentence, hard-capped at GIST_CAP.
 *
 * A cut is always MARKED with an ellipsis — a truncation the reader can't see is a
 * sentence that lies about being complete. Cuts land on a word boundary when one is
 * reasonably close (past 60% of the cap), otherwise mid-word rather than throwing away
 * half a row's information.
 *
 * The two guards below exist because the naive "first sentence" broke that contract in
 * the quiet direction. A summary reading "…a reduced newcomer surface vs. the full
 * surface…" cut at `vs.` — and, being under the cap, got NO ellipsis, so it rendered as
 * a complete and ungrammatical claim. "G8 Studio performance." was a 22-character row
 * that told the reader nothing. In both cases the honest move is to keep reading to the
 * next boundary, or to the cap where the marker applies.
 */
function gistFor(summary) {
  const text = String(summary).trim().replace(/\s+/g, ' ');
  let sentence = text.match(FIRST_SENTENCE)?.[1] ?? text;
  while (sentence.length < text.length && (ABBREVIATION.test(sentence) || sentence.length < MIN_INFORMATIVE)) {
    const rest = text.slice(sentence.length).replace(/^\s+/, '');
    if (!rest) break;
    const next = rest.match(FIRST_SENTENCE)?.[1] ?? rest;
    sentence = `${sentence} ${next}`;
  }
  if (sentence.length <= GIST_CAP) return balanceCodeSpans(sentence);
  let cut = sentence.slice(0, GIST_CAP);
  const space = cut.lastIndexOf(' ');
  if (space > GIST_CAP * 0.6) cut = cut.slice(0, space);
  return `${balanceCodeSpans(cut.replace(/[\s,;:.—-]+$/, ''))}…`;
}

/**
 * The one row a note renders to — the single definition `render` writes and
 * `verify` compares against, so the two can never drift into disagreeing about
 * what a correct entry looks like. Carries a GIST, not the full summary (see the
 * header): the index is a pick-list, the note is the record.
 */
function rowFor(note) {
  const tail = note.supersededBy ? ` → [${note.supersededBy}](${note.supersededBy})` : '';
  return `- ${STATUS[note.status].glyph} [${note.file}](${note.file}) — ${gistFor(note.summary)}${tail}`;
}

/**
 * THE PER-ROW COST CAP — the budget this index can actually be held to.
 *
 * `2026-08-17-context-index-tiering.md` coined an "an index over ~10k tokens has failed"
 * budget and this file missed it by 2.5x (25,500 tokens of rows, o200k_base, 425 notes).
 * Both exits that note proposed were re-measured and neither reaches 10k: capping
 * `summary:` at the source cannot get under the 5,387 tokens the filenames cost before a
 * word of gist, and a filename-and-status index costs 13,336 — more than twice what `ls`
 * of this folder prints for 5,811. The budget was unreachable the day it was written.
 *
 * WHY A ROW CAP AND NOT A FILE TOTAL. A file total is the one number #1547 already taught
 * this generator not to assert: it is an aggregate over EVERY note, so the PR that trips
 * it is being billed for 424 predecessors' contributions and has no local fix. A per-row
 * cap holds each PR to exactly what it added — the same principle #1547 applied to
 * correctness, applied to cost. It is also merge-safe by construction: two concurrent PRs
 * each adding a note both pass, in either order. Nothing here — and nothing in this file's
 * TESTS — may assert an aggregate over the corpus, including "the widest row is still
 * close to the cap": a PR that shortens or deletes the longest note would fail it for
 * doing exactly what the cap's own error message asks for.
 *
 * WHAT THE NUMBER IS. Measured over the live corpus, o200k_base: p50 row 214 characters /
 * 60 tokens, p90 236 / 70, max 281. The cap sits just above today's worst row, so it is a
 * RATCHET at the corpus, never a target nothing can hit — which is the failure mode this
 * whole exercise exists to correct. A row's cost is bounded by `2 × filename + GIST_CAP +
 * 12` (`gistFor` may add an ellipsis to its 140), so with the second term already capped
 * the FILENAME is the lever an author still controls — 285 leaves room for 66 characters
 * of it. It is rendered twice per row (link text + link target) and paid forever.
 *
 * The ` → [successor](successor)` pointer is excluded, on the 7 rows that carry one. Its
 * length is set by the SUCCESSOR's filename, which this note's author did not choose.
 * The strip is keyed on `supersededBy` and NOT on the row's shape: a regex anchored at
 * end-of-row cannot tell a pointer from a GIST that happens to end in a markdown link,
 * and would silently unbill up to a whole gist's worth of characters.
 */
const ROW_CAP = 285;

const POINTER_TAIL = / → \[[^\]]+\]\([^)]+\)$/;

/** Per-note, per-row: the check a single PR can be held responsible for. */
function rowCostProblems(notes) {
  const problems = [];
  for (const note of notes) {
    const row = rowFor(note);
    const body = note.supersededBy ? row.replace(POINTER_TAIL, '') : row;
    if (body.length <= ROW_CAP) continue;
    problems.push(
      `${note.file}: its index row is ${body.length} characters, over the ${ROW_CAP} cap. ` +
        'The FILENAME is the lever — it is rendered twice per row (link text + link target) ' +
        `and paid on every read of the index; shorten the slug. The summary is already capped at ${GIST_CAP} ` +
        'characters by `gistFor`, so it is not what pushed this row over.',
    );
  }
  return problems;
}

function render(notes) {
  const lines = [BEGIN, ''];
  for (const [group, heading] of GROUPS) {
    const inGroup = notes
      .filter((n) => STATUS[n.status].group === group)
      .sort((a, b) => b.created.localeCompare(a.created) || a.file.localeCompare(b.file));
    if (!inGroup.length) continue;
    lines.push(heading, '');
    for (const n of inGroup) lines.push(rowFor(n));
    lines.push('');
  }
  lines.push(FOOTER, '', END);
  return lines.join('\n');
}

// A row line, only far enough to recover which note it claims to be about. The
// glyph is `\S+` rather than a class of the five known ones so an unknown glyph
// reads as a WRONG row for a known note (a status drift the reader can act on)
// instead of an unparsable line.
const ROW_RE = /^- \S+ \[([^\]]+)\]\(/;

/**
 * Read the committed block back into the three things `verify` judges: which
 * headings are present, which rows sit under each, and the closing line.
 * Anything else non-blank inside the markers comes back in `stray` — which is
 * what catches an unresolved conflict marker, hand-edited prose, or a row
 * mangled past recognition.
 */
function parseIndex(readme) {
  const b = readme.indexOf(BEGIN);
  const e = readme.indexOf(END);
  if (b === -1 || e === -1 || e < b) {
    throw new Error(`README.md is missing or has out-of-order ${BEGIN} / ${END} markers — add them, in order, under "## Current notes".`);
  }
  // Tolerate a CRLF-saved README, exactly as `frontMatter` does. Without this every
  // line keeps a trailing \r, so no heading and no footer compares equal and the block
  // reports a dozen problems that name anything but the line endings — the same
  // diagnostic rabbit hole this file already paid for once on the front-matter side.
  // A SECOND begin marker inside the block means a duplicated index was appended. `splice`
  // is bounded by the FIRST begin/end pair, so a stray copy is never rewritten — it would sit
  // there permanently, with rows for notes that may not exist.
  if (readme.indexOf(BEGIN, b + BEGIN.length) !== -1 || readme.indexOf(END, e + END.length) !== -1) {
    return { headings: [], rows: [], stray: ['a second decisions-index marker pair is present — only the first is ever regenerated'], footer: null, footers: 0, blankRuns: true };
  }
  const body = readme.slice(b + BEGIN.length, e).replace(/\r\n/g, '\n').split('\n');
  const headings = [];
  const rows = []; // { group, file, line }
  const stray = [];
  let footer = null;
  let footers = 0;
  let group = null;
  // A generated markdown list needs its blank lines: with them stripped, the closing line
  // becomes a lazy continuation INSIDE the last list item and the block renders as one
  // run-on bullet. The gate is the only thing standing between that and a committed file.
  // Only a blank BETWEEN two content lines counts. The newline before the end marker is
  // always there and says nothing.
  let blankRuns = false;
  let seenContent = false;
  let pendingBlank = false;
  for (const line of body) {
    if (!line.trim()) { if (seenContent) pendingBlank = true; continue; }
    if (pendingBlank) { blankRuns = true; pendingBlank = false; }
    seenContent = true;
    if (HEADING_GROUP.has(line)) {
      headings.push(line);
      group = HEADING_GROUP.get(line);
      continue;
    }
    const m = line.match(ROW_RE);
    if (m) {
      rows.push({ group, file: m[1], line });
      continue;
    }
    if (line === FOOTER) {
      footers += 1;
      footer = line;
      continue;
    }
    stray.push(line);
  }
  return { headings, rows, stray, footer, footers, blankRuns };
}

/**
 * The CHECK assertion — weaker than `render` on purpose (#1547; see the header).
 *
 * Holds every PR to the part of the index it is actually responsible for: its own
 * note's row, rendered exactly, under the right heading, exactly once. Says nothing
 * about the order rows appear in, because two PRs merging in either order cannot
 * agree on that and neither of them is wrong.
 *
 * Returns a list of human-readable problems; empty means the index is faithful.
 */
function verify(readme, notes) {
  const { headings, rows, stray, footer, footers, blankRuns } = parseIndex(readme);
  const problems = [];

  // Stray lines are reported BEFORE the empty-scan guard: a structural problem (a second
  // marker pair) makes `rows` empty by design, and returning "the block is empty" instead of
  // naming the real cause sends the reader looking in the wrong place.
  for (const line of stray) problems.push(`unrecognized line inside the index block: ${line.slice(0, 120)}`);

  // Fail loud on an empty scan: with notes on disk and no rows parsed, every check
  // below is vacuously clean, and a gate that cannot fail is also a claim.
  if (notes.length && !rows.length) {
    if (!problems.length) problems.push('the committed index has no entries at all — the block is empty, or its rows no longer parse');
    return problems;
  }

  const byFile = new Map();
  for (const row of rows) {
    if (!byFile.has(row.file)) byFile.set(row.file, []);
    byFile.get(row.file).push(row);
  }

  for (const note of notes) {
    const found = byFile.get(note.file);
    if (!found) {
      problems.push(`${note.file}: no entry in the index — run \`npm run decisions:index\` and commit`);
      continue;
    }
    if (found.length > 1) {
      problems.push(`${note.file}: ${found.length} entries in the index — it must appear exactly once`);
      continue;
    }
    const [row] = found;
    const want = rowFor(note);
    const wantGroup = STATUS[note.status].group;
    if (row.group !== wantGroup) {
      problems.push(`${note.file}: listed under "${row.group ?? '(no heading)'}" but status ${note.status} belongs in "${wantGroup}"`);
    } else if (row.line !== want) {
      problems.push(`${note.file}: entry does not match its front-matter\n      index: ${row.line}\n      note:  ${want}`);
    }
  }

  const onDisk = new Set(notes.map((n) => n.file));
  for (const file of byFile.keys()) {
    if (!onDisk.has(file)) problems.push(`${file}: listed in the index but there is no such note — delete the entry`);
  }

  // Exactly the non-empty groups, each exactly ONCE. Set membership in both directions
  // is not enough: it accepts a duplicated heading, which silently splits a group's rows
  // into two sections that both verify clean.
  const wantHeadings = GROUPS.filter(([g]) => notes.some((n) => STATUS[n.status].group === g)).map(([, h]) => h);
  for (const h of wantHeadings) {
    const seen = headings.filter((x) => x === h).length;
    if (!seen) problems.push(`missing group heading: ${h}`);
    else if (seen > 1) problems.push(`group heading appears ${seen} times — it must appear once: ${h}`);
  }
  for (const h of new Set(headings)) if (!wantHeadings.includes(h)) problems.push(`group heading present but its group is empty: ${h}`);

  if (!footer) problems.push('the closing line is missing or edited — regenerate with `npm run decisions:index`');
  else if (footers > 1) problems.push(`the closing line appears ${footers} times — it must appear once`);
  // Without its blank lines the block is still parseable here but renders as one run-on
  // bullet, with the closing line swallowed into the last list item.
  if (rows.length && !blankRuns) problems.push('the index block has no blank lines — markdown needs them, or the list renders as one run-on item with the closing line inside it');

  return problems;
}

function splice(readme, block) {
  const b = readme.indexOf(BEGIN);
  const e = readme.indexOf(END);
  if (b === -1 || e === -1 || e < b) {
    throw new Error(`README.md is missing or has out-of-order ${BEGIN} / ${END} markers — add them, in order, under "## Current notes".`);
  }
  return readme.slice(0, b) + block + readme.slice(e + END.length);
}

function main(argv) {
  const check = argv.includes('--check');
  const { notes, errors } = collect();
  if (errors.length) {
    process.stderr.write(`decisions-index: ${errors.length} malformed note(s):\n`);
    for (const e of errors) process.stderr.write(`  ✗ ${e}\n`);
    return 1;
  }

  // The per-row cost cap fails BOTH modes: write must not emit a row it would then
  // refuse to certify, and the author needs to hear it from `npm run decisions:index`
  // rather than from a gate two commands later.
  const oversize = rowCostProblems(notes);
  if (oversize.length) {
    process.stderr.write(`decisions-index: ${oversize.length} row(s) over the ${ROW_CAP}-character cap:\n`);
    for (const p of oversize) process.stderr.write(`  ✗ ${p}\n`);
    return 1;
  }

  const readme = fs.readFileSync(README, 'utf8');

  // CHECK asserts only what a single PR can be held responsible for (#1547) —
  // never a byte-comparison against a full regeneration, which no PR sharing the
  // merge queue with another decision-doc PR can satisfy.
  if (check) {
    const problems = verify(readme, notes);
    if (!problems.length) {
      process.stdout.write(`decisions-index OK — ${notes.length} notes, each with its own entry.\n`);
      return 0;
    }
    process.stderr.write(`decisions-index WRONG — ${problems.length} problem(s) in engineering/decisions/README.md:\n`);
    for (const p of problems) process.stderr.write(`  ✗ ${p}\n`);
    process.stderr.write('Run `npm run decisions:index` and commit.\n');
    return 1;
  }

  const next = splice(readme, render(notes));
  if (next === readme) {
    process.stdout.write(`decisions-index OK — ${notes.length} notes, index already current.\n`);
    return 0;
  }
  fs.writeFileSync(README, next);
  process.stdout.write(`decisions-index: rewrote ${notes.length} notes into engineering/decisions/README.md\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { frontMatter, collect, render, rowFor, gistFor, rowCostProblems, parseIndex, verify, splice, STATUS, FOOTER, GIST_CAP, ROW_CAP };
