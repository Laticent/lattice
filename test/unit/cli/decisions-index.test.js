// Unit coverage for tools/build-decisions-index.js — the decision-doc index
// generator (engineering/decisions/README.md is rendered from front-matter).

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { frontMatter, render, splice, collect, STATUS } = require('../../../tools/build-decisions-index');

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
    test('footer tallies each group', () => {
      assert.match(out, /4 notes — 2 active, 1 shipped \(pending teardown\), 1 historical/);
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
