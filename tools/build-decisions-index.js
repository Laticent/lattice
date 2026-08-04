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
 *   node tools/build-decisions-index.js --check    # exit 1 if it would change
 *                                                   # or any note is malformed
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
  ['shipped', '### Shipped — pending teardown (absorb into canon, then delete)'],
  ['historical', '### Historical — superseded'],
];

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

function render(notes) {
  const lines = [BEGIN, ''];
  const counts = Object.fromEntries(GROUPS.map(([g]) => [g, 0]));
  for (const [group, heading] of GROUPS) {
    const inGroup = notes
      .filter((n) => STATUS[n.status].group === group)
      .sort((a, b) => b.created.localeCompare(a.created) || a.file.localeCompare(b.file));
    if (!inGroup.length) continue;
    counts[group] = inGroup.length;
    lines.push(heading, '');
    for (const n of inGroup) {
      const tail = n.supersededBy ? ` → [${n.supersededBy}](${n.supersededBy})` : '';
      lines.push(`- ${STATUS[n.status].glyph} [${n.file}](${n.file}) — ${n.summary}${tail}`);
    }
    lines.push('');
  }
  const total = notes.length;
  lines.push(
    `_${total} notes — ${counts.active} active, ${counts.shipped} shipped (pending teardown), ` +
    `${counts.historical} historical. Generated by \`npm run decisions:index\`; edit a note's ` +
    `front-matter, not this list._`,
    '',
    END,
  );
  return lines.join('\n');
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
  const readme = fs.readFileSync(README, 'utf8');
  const next = splice(readme, render(notes));
  if (next === readme) {
    if (!check) process.stdout.write(`decisions-index OK — ${notes.length} notes, index already current.\n`);
    else process.stdout.write(`decisions-index OK — ${notes.length} notes.\n`);
    return 0;
  }
  if (check) {
    process.stderr.write('decisions-index STALE — run `npm run decisions:index` and commit.\n');
    return 1;
  }
  fs.writeFileSync(README, next);
  process.stdout.write(`decisions-index: rewrote ${notes.length} notes into engineering/decisions/README.md\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { frontMatter, collect, render, splice, STATUS };
