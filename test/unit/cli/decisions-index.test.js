// Unit coverage for tools/build-decisions-index.js — the decision-doc index
// generator (dist/engineering/decisions.md is rendered from front-matter, never committed).

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { frontMatter, render, rowFor, gistFor, rowCostProblems, main, collect, STATUS, GIST_CAP, ROW_CAP, LINK_BASE } = require('../../../tools/build-decisions-index');

describe('decisions-index', () => {
  describe('frontMatter', () => {
    test('parses a flat leading --- block', () => {
      const fm = frontMatter('---\nstatus: shipped\nsummary: did a thing\n---\n\n# Title\n');
      assert.equal(fm.status, 'shipped');
      assert.equal(fm.summary, 'did a thing');
    });
    test('returns null when there is no front-matter', () => {
      assert.equal(frontMatter('# Just a heading\n'), null);
    });
    test('strips wrapping quotes and ignores a body --- rule', () => {
      const fm = frontMatter('---\nstatus: "proposed"\nsummary: x\n---\n\n## H\n\n---\n');
      assert.equal(fm.status, 'proposed');
    });

    // #1310: a flat-only reader parsed `summary: >` as the literal string ">",
    // which is non-empty and so passed every guard — 59 of 346 notes rendered an
    // index row reading "— >" with the summary silently dropped.
    describe('YAML block scalars', () => {
      test('folds `summary: >` into the one line the index row renders', () => {
        const fm = frontMatter('---\nstatus: shipped\nsummary: >\n  First line of the summary\n  and its continuation.\n---\n\n# T\n');
        assert.equal(fm.summary, 'First line of the summary and its continuation.');
        assert.equal(fm.status, 'shipped', 'keys before the block still parse');
      });
      test('folds `|` too, and tolerates chomping / indentation indicators', () => {
        for (const head of ['|', '>-', '|+', '>2', '|2-']) {
          const fm = frontMatter(`---\nstatus: shipped\nsummary: ${head}\n  one\n  two\n---\n`);
          assert.equal(fm.summary, 'one two', `\`summary: ${head}\` should fold`);
        }
      });
      test('a key AFTER the block still parses — the block stops at column 0', () => {
        const fm = frontMatter('---\nsummary: >\n  folded text\n  more text\nstatus: superseded\nsuperseded-by: 2026-01-01-x.md\n---\n');
        assert.equal(fm.summary, 'folded text more text');
        assert.equal(fm.status, 'superseded');
        assert.equal(fm['superseded-by'], '2026-01-01-x.md');
      });
      test('blank lines inside and trailing the block collapse away', () => {
        const fm = frontMatter('---\nstatus: shipped\nsummary: >\n  one\n\n  two\n\n---\n');
        assert.equal(fm.summary, 'one two');
      });
      test('a bare indicator with NO block beneath stays bare, so collect() can reject it', () => {
        const fm = frontMatter('---\nstatus: shipped\nsummary: >\n---\n');
        assert.equal(fm.summary, '', 'nothing to fold → empty, never the literal ">"');
      });
      test('a `>` INSIDE a normal value is not mistaken for a block header', () => {
        const fm = frontMatter('---\nstatus: shipped\nsummary: a > b, and b > c\n---\n');
        assert.equal(fm.summary, 'a > b, and b > c');
      });
    });
  });

  // A row carries a one-line GIST, not the whole summary. Rendering all 406
  // summaries in full made README.md 390 KB (~137k tokens) — an index that cost
  // more to read than the notes it points at, so it went unread and the corpus
  // went unfound. Nothing is lost: the full summary stays in the note.
  describe('gistFor', () => {
    test('a short summary passes through untouched', () => {
      assert.equal(gistFor('did a thing'), 'did a thing');
    });
    test('keeps only the first sentence when a summary runs on', () => {
      assert.equal(
        gistFor('The root cause was a stale token. Then four more paragraphs of detail followed.'),
        'The root cause was a stale token.',
      );
    });
    test('a mid-sentence period is not a sentence end', () => {
      // The period must sit PAST the {20,} floor, or the floor alone carries the test and
      // it passes with the sentence-end guard deleted — which is how it shipped first.
      // Without `(\\s|$)`, this cuts to "…mermaid v1." — 48 live rows depend on the guard.
      const summary = 'The renderer pins mermaid v1.2 because the v2 parser drops init blocks';
      assert.equal(gistFor(summary), summary);
      assert.ok(summary.indexOf('.') > 20, 'the fixture must exercise the guard, not the floor');
    });

    // A first sentence that ends on an abbreviation, or is too short to identify a note,
    // used to be accepted — and being under the cap it got NO ellipsis, so a half-clause
    // rendered as a complete claim. Both live rows are named in the tool's comment.
    test('a sentence ending on an abbreviation reads on', () => {
      const out = gistFor('The Studio sorts people into a reduced newcomer surface vs. the full surface with a hidden boolean.');
      assert.ok(out.startsWith('The Studio sorts people into a reduced newcomer surface vs. the full surface'), out);
    });
    test('an uninformatively short first sentence reads on', () => {
      const out = gistFor('G8 Studio performance. Profiling overturned the premise about where the time went.');
      assert.match(out, /Profiling overturned/);
    });
    test('a cut never leaves an unbalanced code span', () => {
      const out = gistFor(`A chart binds ONE axis — \`height:100cqh\` ${'and more text '.repeat(20)}end.`);
      assert.equal((out.match(/`/g) ?? []).length % 2, 0, `odd backtick count: ${out}`);
    });
    test('caps an over-long first sentence and MARKS the cut', () => {
      const long = `${'word '.repeat(60)}end.`;
      const out = gistFor(long);
      assert.ok(out.length <= GIST_CAP + 1, `got ${out.length} chars`);
      assert.ok(out.endsWith('…'), 'a truncation the reader cannot see is a sentence that lies');
    });
    test('cuts on a word boundary when one is close enough', () => {
      const source = `${'alpha beta '.repeat(20)}gamma.`;
      const body = gistFor(source).slice(0, -1); // drop the … marker
      assert.ok(source.startsWith(body), 'the gist must be a prefix of the summary');
      assert.equal(source[body.length], ' ', 'the cut landed mid-word instead of on a space');
    });
    test('folds whitespace so a block-scalar summary renders as one row', () => {
      assert.equal(gistFor('  one\n  two   three  '), 'one two three');
    });
    test('a truncated row still renders as exactly one line', () => {
      const note = { file: '2026-06-01-x.md', created: '2026-06-01', status: 'shipped', summary: `${'long '.repeat(80)}tail.` };
      const rows = render([note]).split('\n').filter((l) => l.startsWith('- '));
      assert.equal(rows.length, 1);
      assert.ok(rows[0].endsWith('…'));
    });
  });

  describe('rowCostProblems (the per-row budget)', () => {
    const note = (file, summary) => ({ file, created: file.slice(0, 10), status: 'shipped', summary });

    test('a row inside the cap is silent', () => {
      assert.deepEqual(rowCostProblems([note('2026-06-01-short.md', 'A perfectly ordinary summary sentence.')]), []);
    });
    test('a long filename trips it — the filename is paid TWICE per row', () => {
      const long = `2026-06-01-${'a'.repeat(160)}.md`;
      const [problem] = rowCostProblems([note(long, 'Short.')]);
      assert.match(problem, /over the 285 cap/);
      assert.match(problem, /rendered twice per row/);
    });
    test('a maximal gist alone cannot trip it — GIST_CAP already bounds that half', () => {
      const maximal = note('2026-06-01-a-name-of-perfectly-typical-length.md', `${'word '.repeat(80)}end.`);
      assert.ok(rowFor(maximal).length > GIST_CAP, 'sanity: the gist really is at its cap');
      assert.deepEqual(rowCostProblems([maximal]), []);
    });
    // The pointer's length is set by the SUCCESSOR's filename, which this note's author
    // did not choose. Billing a note for it would be the same aggregate mistake #1547
    // taught this generator to stop making, one row down.
    test('the superseded-by pointer is excluded from the measured cost', () => {
      const n = note('2026-06-01-a-name-of-perfectly-typical-length.md', `${'word '.repeat(80)}end.`);
      n.status = 'superseded';
      n.supersededBy = `2026-06-02-${'b'.repeat(90)}.md`;
      assert.ok(rowFor(n).length > ROW_CAP, 'sanity: the whole row IS over the cap');
      assert.deepEqual(rowCostProblems([n]), []);
    });
    // The exclusion is keyed on `supersededBy`, NOT on the row's shape. A regex anchored
    // at end-of-row cannot tell a pointer from a gist that ends in a markdown link, and
    // would unbill it — letting an oversize row through by up to a whole gist.
    test('a gist that ENDS in a link is billed in full — only a real pointer is excluded', () => {
      const n = note(`2026-06-01-${'a'.repeat(100)}.md`, `The chain ends at → [${'x'.repeat(40)}](y)`);
      assert.ok(!n.supersededBy, 'sanity: this note has no successor');
      assert.equal(rowCostProblems([n]).length, 1);
    });
    // NO aggregate over the corpus here — not even "the widest row is still near the cap".
    // A PR that shortens or deletes the longest note would fail such an assertion for doing
    // exactly what the cap's error message asks of it. Per-note is the only safe shape
    // (#1547); the cap's ratchet value is a design fact, recorded in the tool's header.
    test('every note in the live corpus is inside the cap', () => {
      assert.deepEqual(rowCostProblems(collect().notes), []);
    });
  });

  describe('render', () => {
    const notes = [
      { file: '2026-06-17-b.md', created: '2026-06-17', status: 'proposed', summary: 'newer active' },
      { file: '2026-06-10-a.md', created: '2026-06-10', status: 'in-progress', summary: 'older active' },
      { file: '2026-05-01-s.md', created: '2026-05-01', status: 'shipped', summary: 'a shipped one' },
      { file: '2026-04-01-h.md', created: '2026-04-01', status: 'superseded', summary: 'gone', supersededBy: '2026-06-17-b.md' },
    ];
    const out = render(notes);

    test('groups by status into Active / Shipped / Historical', () => {
      assert.match(out, /### Active/);
      assert.match(out, /### Shipped/);
      assert.match(out, /### Historical/);
    });
    // A–Z by topic slug, NOT newest-first: date order put every new note at the top of
    // its group, so two PRs adding a note always inserted at the same line and GitHub
    // (which ignores `merge=union`) reported the PR `dirty`. See `bySlug`.
    test('sorts A–Z by topic slug within a group, not by date', () => {
      assert.ok(out.indexOf('2026-06-10-a.md') < out.indexOf('2026-06-17-b.md'));
    });
    test('breaks a slug tie newest-first, and ignores the date otherwise', () => {
      const tied = render([
        { file: '2025-01-01-same.md', created: '2025-01-01', status: 'shipped', summary: 'old' },
        { file: '2026-01-01-same.md', created: '2026-01-01', status: 'shipped', summary: 'new' },
        { file: '2026-09-29-aardvark.md', created: '2026-09-29', status: 'shipped', summary: 'x' },
      ]);
      const at = (f) => tied.indexOf(`[${f}]`);
      assert.ok(at('2026-09-29-aardvark.md') < at('2026-01-01-same.md'));
      assert.ok(at('2026-01-01-same.md') < at('2025-01-01-same.md'));
    });
    test('uses the status glyph and links superseded-by', () => {
      assert.match(out, new RegExp(`${STATUS.proposed.glyph} \\[2026-06-17-b\\.md\\]`));
      assert.match(out, /gone → \[2026-06-17-b\.md\]\(\.\.\/\.\.\/engineering\/decisions\/2026-06-17-b\.md\)/);
    });
    // The output lives in dist/engineering/, two levels below the repo root, so every
    // link must climb back out to the notes. A bare `2026-…md` target would resolve to
    // dist/engineering/2026-…md, which does not exist.
    test('links point from dist/engineering/ back to the notes', () => {
      assert.equal(LINK_BASE, '../../engineering/decisions/');
      const path = require('node:path');
      const out = path.join('dist', 'engineering');
      assert.equal(path.normalize(path.join(out, LINK_BASE)), path.join('engineering', 'decisions') + path.sep);
      for (const line of render(notes).split('\n').filter((l) => l.startsWith('- '))) {
        for (const [, target] of line.matchAll(/\]\(([^)]+)\)/g)) assert.ok(target.startsWith(LINK_BASE), line);
      }
    });
    // The cap governs what the author controls. The link prefix is constant and added at
    // render time, so it must not count against a note's row.
    test('the row cap measures the row without the link prefix', () => {
      const note = notes[0];
      assert.ok(!rowFor(note).includes(LINK_BASE));
      assert.ok(rowFor(note, LINK_BASE).includes(LINK_BASE));
    });
    // #1547: the footer USED to tally (`_377 notes — 149 active, …_`). That tally is
    // the one line two concurrent decision-doc PRs cannot both be right about — both
    // rewrite it to the same `+1` text, git takes it without a conflict, and the
    // committed count lands one short. It is gone rather than tolerated.
    test('the closing line carries no totals', () => {
      assert.doesNotMatch(out, /\d+ notes —/);
      assert.match(out, /Generated by `npm run decisions:index`/);
    });
  });

  // The CLI path, against the live corpus: CHECK validates the notes and reads no output
  // (there is no committed copy), and WRITE never fails, because it runs inside
  // `npm install`.
  describe('main', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    test('--check passes on the live notes without any output on disk', () => {
      assert.equal(main(['--check'], { out: path.join(os.tmpdir(), 'does-not-exist', 'decisions.md') }), 0);
    });
    test('write creates the output folder and one row per note', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decisions-out-'));
      try {
        const out = path.join(dir, 'nested', 'decisions.md');
        assert.equal(main([], { out }), 0);
        const rows = fs.readFileSync(out, 'utf8').split('\n').filter((l) => l.startsWith('- '));
        assert.equal(rows.length, collect().notes.length);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('the live decisions/ folder', () => {
    test('every note has valid closed-vocab front-matter (collect() is clean)', () => {
      const { notes, errors } = collect();
      assert.deepEqual(errors, [], `malformed notes:\n${errors.join('\n')}`);
      assert.ok(notes.length >= 100, `expected the full corpus, got ${notes.length}`);
      for (const n of notes) assert.ok(STATUS[n.status], `${n.file}: bad status ${n.status}`);
    });
  });
});
