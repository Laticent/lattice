/**
 * Unit: `lattice lint` — the published CLI's deck linter (lib/cli/lint-deck.js, dispatched from lattice.js).
 *
 * The CLI's own warnings tell an author to run `lattice lint`, and a deck written before a key rename has no other
 * way to migrate outside this repo, so these arms drive the real command: it reports a retired key and class,
 * `--fix` rewrites them in place (the 2026-11 `marks:` split), and the exit codes hold. Each test writes its own
 * deck in its own temp folder (HARD RULE #32).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, '../../../lattice.js');
const run = (...args) => spawnSync(process.execPath, [CLI, 'lint', ...args], { encoding: 'utf8' });

const OLD_DECK = [
  '---',
  'theme: indaco',
  'marks: tone ink vivid',
  '---',
  '',
  '<!-- @meta{layout=bar, class=marks-etch} -->',
  '',
  '## Revenue grew.',
  '',
  '- A `3`',
  '- B `4`',
  '',
].join('\n');

function deckIn(t, text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-lint-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'deck.md');
  fs.writeFileSync(file, text);
  return file;
}

test('lattice lint reports a retired key and class as errors, names the fix, and exits 1', (t) => {
  const file = deckIn(t, OLD_DECK);
  const r = run(file);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /marks-split/);
  assert.match(r.stderr, /Write `chart-finish: tone ink` and `color-intensity: vivid` instead\./);
  assert.match(r.stderr, /'marks-etch' is now 'chart-finish-etch'/);
  assert.equal(fs.readFileSync(file, 'utf8'), OLD_DECK, 'without --fix the deck is not touched');
});

test('lattice lint --fix rewrites the deck in place, then lints it clean', (t) => {
  const file = deckIn(t, OLD_DECK);
  const r = run('--fix', file);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /lattice lint --fix — rewrote .*deck\.md/);
  const out = fs.readFileSync(file, 'utf8');
  assert.match(out, /^chart-finish: tone ink\ncolor-intensity: vivid\n---/m);
  assert.doesNotMatch(out, /^marks:/m);
  assert.match(out, /class=chart-finish-etch/);
  // A second run finds nothing left to fix.
  assert.equal(run(file).status, 0);
});

test('lattice lint --fix keeps CRLF line endings', (t) => {
  const file = deckIn(t, OLD_DECK.replace(/\n/g, '\r\n'));
  assert.equal(run('--fix', file).status, 0);
  const out = fs.readFileSync(file, 'utf8');
  assert.match(out, /chart-finish: tone ink\r\ncolor-intensity: vivid\r\n/);
  assert.doesNotMatch(out.replace(/\r\n/g, ''), /\n/, 'every line still ends in CRLF');
});

test('lattice lint --fix keeps a byte-order mark', (t) => {
  const file = deckIn(t, `\uFEFF${OLD_DECK}`);
  assert.equal(run('--fix', file).status, 0);
  const out = fs.readFileSync(file, 'utf8');
  assert.ok(out.startsWith('\uFEFF---\n'), 'the BOM is still the first character');
  assert.match(out, /^chart-finish: tone ink$/m);
});

test('a missing file or an unknown option is a usage error, never a clean run', (t) => {
  const file = deckIn(t, OLD_DECK);
  const missing = run(path.join(path.dirname(file), 'nope.md'), file);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /no such file: .*nope\.md/);
  const typo = run('--fxi', file);
  assert.equal(typo.status, 2);
  assert.match(typo.stderr, /unknown option --fxi/);
  assert.equal(fs.readFileSync(file, 'utf8'), OLD_DECK, 'a refused run writes nothing');
});

test('--json prints the findings as JSON', (t) => {
  const file = deckIn(t, OLD_DECK);
  const r = run('--json', file);
  assert.equal(r.status, 1);
  const report = JSON.parse(r.stdout);
  assert.equal(report.errors, 2);
  assert.deepEqual(report.findings.map((f) => f.rule).sort(), ['marks-split', 'unknown-class']);
});

test('usage: --help exits 0; no file, and the repo-only --all, exit 2', () => {
  const help = run('--help');
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^Usage: lattice lint <deck\.md>/);
  const none = run();
  assert.equal(none.status, 2);
  assert.match(none.stderr, /no files matched/);
  const all = run('--all');
  assert.equal(all.status, 2);
  assert.match(all.stderr, /--all lints a Lattice checkout's own decks/);
});

// W3 (bold is emphasis): `--fix --rule bold-lead` is the one-command migration off bold-as-title outside this repo.
// It must rewrite the bold lead and ONLY the rule it names: the retired `marks:` key in the same deck stays as written.
const BOLD_DECK = [
  '---',
  'theme: indaco',
  'marks: tone ink vivid',
  '---',
  '',
  '<!-- @meta{layout=redline} -->',
  '',
  '## The amendment narrows the duty.',
  '',
  '> A business <del>shall</del> <ins>may</ins> provide one method.',
  '',
  '- **Why this matters.** The duty becomes optional.',
  '',
].join('\n');

test('--fix --rule bold-lead rewrites the bold lead and nothing else', (t) => {
  const file = deckIn(t, BOLD_DECK);
  const r = run('--fix', '--rule', 'bold-lead', file);
  const after = fs.readFileSync(file, 'utf8');
  assert.match(after, /^- Why this matters\n {2}- The duty becomes optional\.$/m, r.stderr);
  assert.doesNotMatch(after, /\*\*Why this matters/);
  assert.match(after, /^marks: tone ink vivid$/m, 'a rule --rule did not name is left alone');
  assert.match(r.stderr, /marks-split/, 'the unfixed finding is still reported');
});

test('--rule with no rule id is a usage error and writes nothing', (t) => {
  const file = deckIn(t, BOLD_DECK);
  const r = run('--fix', file, '--rule');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--rule needs a rule id/);
  assert.equal(fs.readFileSync(file, 'utf8'), BOLD_DECK);
});
