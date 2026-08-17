// Unit coverage for tools/build-decisions-index.js — the decision-doc index
// generator (engineering/decisions/README.md is rendered from front-matter).

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { frontMatter, render, rowFor, gistFor, rowCostProblems, verify, splice, collect, STATUS, FOOTER, GIST_CAP, ROW_CAP } = require('../../../tools/build-decisions-index');

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
    // The row is what `verify` compares, so a truncated gist must still round-trip.
    test('a truncated row still verifies against its own note', () => {
      const note = { file: '2026-06-01-x.md', created: '2026-06-01', status: 'shipped', summary: `${'long '.repeat(80)}tail.` };
      assert.deepEqual(verify(`# R\n\n${render([note])}\n`, [note]), []);
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
    test('sorts newest-first within a group', () => {
      assert.ok(out.indexOf('2026-06-17-b.md') < out.indexOf('2026-06-10-a.md'));
    });
    test('uses the status glyph and links superseded-by', () => {
      assert.match(out, new RegExp(`${STATUS.proposed.glyph} \\[2026-06-17-b\\.md\\]`));
      assert.match(out, /gone → \[2026-06-17-b\.md\]\(2026-06-17-b\.md\)/);
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

  // #1547 — the CHECK assertion, which is deliberately weaker than `render`.
  //
  // `engineering/decisions/README.md` is generated from EVERY note and committed, so a
  // PR adding a note commits an index that is correct only until the next decision-doc
  // PR merges. The merge queue rebases onto current `main` and re-runs CI there, so a
  // byte-comparison ejected the second PR to merge — green on its own head, red on a
  // `main` it had never seen. These cases pin both halves of the relaxation: the
  // concurrent-PR states must PASS, and a PR wrong about its OWN note must still FAIL.
  describe('verify (the --check assertion)', () => {
    const notes = [
      { file: '2026-06-17-b.md', created: '2026-06-17', status: 'proposed', summary: 'newer active' },
      { file: '2026-06-10-a.md', created: '2026-06-10', status: 'in-progress', summary: 'older active' },
      { file: '2026-05-01-s.md', created: '2026-05-01', status: 'shipped', summary: 'a shipped one' },
      { file: '2026-04-01-h.md', created: '2026-04-01', status: 'superseded', summary: 'gone', supersededBy: '2026-06-17-b.md' },
    ];
    const readme = (notesForBlock) => `# R\n\n${render(notesForBlock)}\n\ntrailer\n`;

    test('the canonical rendering verifies clean', () => {
      assert.deepEqual(verify(readme(notes), notes), []);
    });

    // What decides the shape of the race is WHERE the two rows insert — measured with
    // `git merge-file`: two insertions at the same position conflict, two at any
    // different positions merge cleanly, even adjacent ones. Dates do not decide it,
    // and #1535 is the counterexample to the intuitive guess that they do (its two
    // notes shared a date, with a third same-date note sorting between them).
    describe('states two concurrent decision-doc PRs actually produce', () => {
      // DIFFERENT insertion points → git merges cleanly and the rebased tree is
      // genuinely correct about both notes. Deleting the tally is what fixes this
      // case: with no aggregate line left, a cleanly-merged index is byte-canonical
      // again, so this state passes a byte-comparison too. Asserted anyway because
      // `verify` must not reject a note it has never seen before.
      test('passes when a rebase brought in ANOTHER PR\'s note and its row', () => {
        const theirs = { file: '2026-07-04-other.md', created: '2026-07-04', status: 'shipped', summary: 'landed on main first' };
        assert.deepEqual(verify(readme([...notes, theirs]), [...notes, theirs]), []);
      });

      // SAME insertion point → a real git conflict. Resolving it mechanically by
      // keeping both sides (HARD RULE #16) leaves the two rows in MERGE order rather
      // than sort order, which a byte-comparison rejects in turn. Relaxing row order
      // is the half of the fix that closes THIS case — it is the only one of these two
      // that a byte-comparison still fails once the tally is gone.
      test('passes when rows sit in merge order rather than sort order', () => {
        const canonical = readme(notes);
        const swapped = canonical.replace(
          `${rowFor(notes[0])}\n${rowFor(notes[1])}`,
          `${rowFor(notes[1])}\n${rowFor(notes[0])}`,
        );
        assert.notEqual(swapped, canonical, 'the fixture must actually have reordered two rows');
        assert.deepEqual(verify(swapped, notes), []);
      });
    });

    describe('still fails on what a PR IS responsible for', () => {
      test('its own note has no entry', () => {
        const missing = readme(notes.filter((n) => n.file !== '2026-06-17-b.md'));
        const problems = verify(missing, notes);
        assert.equal(problems.length, 1);
        assert.match(problems[0], /2026-06-17-b\.md: no entry/);
      });
      test('the entry drifted from the front-matter (summary edited in the note)', () => {
        const stale = verify(readme(notes), notes.map((n) => (n.file === '2026-05-01-s.md' ? { ...n, summary: 'rewritten' } : n)));
        assert.equal(stale.length, 1);
        assert.match(stale[0], /2026-05-01-s\.md: entry does not match its front-matter/);
      });
      test('the status changed, so the row is under the wrong heading', () => {
        const moved = verify(readme(notes), notes.map((n) => (n.file === '2026-06-17-b.md' ? { ...n, status: 'shipped' } : n)));
        assert.ok(moved.some((p) => /2026-06-17-b\.md: listed under "active"/.test(p)), moved.join('\n'));
      });
      test('a row survives a note that was deleted', () => {
        const orphaned = verify(readme(notes), notes.slice(1));
        assert.equal(orphaned.length, 1);
        assert.match(orphaned[0], /2026-06-17-b\.md: listed in the index but there is no such note/);
      });
      test('a note is listed twice', () => {
        const doubled = readme(notes).replace(rowFor(notes[2]), `${rowFor(notes[2])}\n${rowFor(notes[2])}`);
        assert.match(verify(doubled, notes).join('\n'), /2026-05-01-s\.md: 2 entries/);
      });
      test('an unresolved conflict marker is left inside the block', () => {
        const conflicted = readme(notes).replace(rowFor(notes[0]), `<<<<<<< HEAD\n${rowFor(notes[0])}\n>>>>>>> main`);
        const problems = verify(conflicted, notes);
        assert.equal(problems.length, 2, problems.join('\n'));
        for (const p of problems) assert.match(p, /unrecognized line inside the index block/);
      });
      test('the closing line was deleted', () => {
        const noFooter = readme(notes).split('\n').filter((l) => !l.startsWith('_Generated by')).join('\n');
        assert.match(verify(noFooter, notes).join('\n'), /closing line is missing/);
      });
      // Three shapes the byte-comparison rejected and the first cut of verify() accepted,
      // found by the red team. All three are states a human would have to look at.
      test('the block lost its blank lines — markdown renders it as one run-on item', () => {
        const canonical = readme(notes);
        const squashed = canonical.replace(/<!-- decisions-index:begin -->[\s\S]*?<!-- decisions-index:end -->/,
          (m) => m.split('\n').filter((l) => l.trim()).join('\n'));
        assert.notEqual(squashed, canonical, 'the fixture must actually have removed blank lines');
        assert.match(verify(squashed, notes).join('\n'), /no blank lines/);
      });
      test('the closing line is duplicated', () => {
        const doubled = readme(notes).replace(FOOTER, `${FOOTER}\n${FOOTER}`);
        assert.match(verify(doubled, notes).join('\n'), /closing line appears 2 times/);
      });
      test('a SECOND marker pair was appended — splice would never rewrite it', () => {
        const extra = `${readme(notes)}\n<!-- decisions-index:begin -->\n- ☑ [ghost.md](ghost.md) — not a real note\n<!-- decisions-index:end -->\n`;
        assert.match(verify(extra, notes).join('\n'), /second decisions-index marker pair/);
      });

      // Set membership in both directions accepts a DUPLICATED heading, which splits a
      // group's rows into two sections that each verify clean. The decision note claims
      // the headings are "exactly the non-empty groups", so it has to mean exactly once.
      test('a group heading is duplicated', () => {
        const doubled = readme(notes).replace('### Active', '### Active — proposed · in-progress · blocked\n\n### Active');
        assert.match(verify(doubled, notes).join('\n'), /appears 2 times/);
      });
    });

    // The block is compared line-for-line against generated text, so a CRLF-saved README
    // would otherwise leave a trailing \r on every line and report a dozen problems that
    // name anything but the line endings. `frontMatter` already normalizes; so does this.
    test('a CRLF-saved README verifies the same as an LF one', () => {
      assert.deepEqual(verify(readme(notes).replace(/\n/g, '\r\n'), notes), []);
    });

    // A gate that cannot fail is also a claim (the same guard #1535 added to
    // checkNoSafeDefaultTokens): with notes on disk and an empty block, every
    // per-note assertion above is vacuously clean.
    test('fails loud on an empty block rather than reporting clean', () => {
      const empty = readme([]);
      const problems = verify(empty, notes);
      assert.ok(problems.length, 'an empty index against a non-empty corpus must not pass');
      assert.match(problems[0], /no entries at all/);
    });
    test('an empty corpus and an empty block is legitimately clean', () => {
      assert.deepEqual(verify(readme([]), []), []);
    });

    test('markers missing entirely still throws', () => {
      assert.throws(() => verify('# no markers here\n', notes), /markers/);
    });
  });

  describe('splice', () => {
    test('replaces only the marked region', () => {
      const readme = 'pre\n<!-- decisions-index:begin -->\nOLD\n<!-- decisions-index:end -->\npost\n';
      const next = splice(readme, '<!-- decisions-index:begin -->\nNEW\n<!-- decisions-index:end -->');
      assert.equal(next, 'pre\n<!-- decisions-index:begin -->\nNEW\n<!-- decisions-index:end -->\npost\n');
    });
    test('throws when markers are missing', () => {
      assert.throws(() => splice('no markers here', 'x'), /markers/);
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
