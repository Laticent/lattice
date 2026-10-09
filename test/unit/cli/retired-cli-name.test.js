/**
 * The CLI's old name stays retired.
 *
 * `lattice-emulator` was renamed `lattice` for 1.0.0 (#2601): lattice.js, dist/lattice.js,
 * tools/build-cli.js, the `cli:*` scripts. The CLI stopped emulating Marp long before the
 * name caught up. Branches that were open across the rename still say the old name, and a
 * path to a file that no longer exists fails loudly, but PROSE with the old name merges
 * silently and teaches the next reader a command that is gone. This scan keeps it out of
 * every live file.
 *
 * History keeps the old name on purpose, because it records what was true when written:
 * dated decision notes, changelog fragments and the changelog, the generated backlog, the
 * route-budget history. Anything else that must name it is sanctioned below with its reason,
 * and a sanction that no longer matches fails, so the list cannot rot.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..');

const HISTORY = [
  /^engineering\/decisions\//,
  /^changelog\.d\//,
  /^changelog\//,
  /^CHANGELOG\.md$/,
  /^backlog\.d\//,
  /^BACKLOG\.md$/,
  /^docs\/route-budget\.history\.md$/,
];

const SANCTIONED = Object.freeze({
  'test/unit/cli/retired-cli-name.test.js': 'this test names what it keeps out',
  'test/unit/cli/cli.test.js': 'asserts the help never shows the old name',
  'test/unit/core/marp-bundle.test.js': 'asserts the Marp bundle README never names the old file',
  'docs/route-budget.d/2601-cli-rename.md': 'the budget note for the rename itself; folded into the history on the next reset',
  'engineering/gotchas/lattice-internals.md': 'the gotcha that maps an old citation to the new file',
});

function filesNamingOldCli() {
  let out = '';
  try {
    out = execFileSync('git', ['grep', '-l', '-I', '-e', 'lattice-emulator', '-e', 'build-emulator'], { cwd: ROOT, encoding: 'utf8' });
  } catch (e) {
    if (e.status !== 1) throw e; // 1 = no match
  }
  return out.split('\n').filter(Boolean);
}

test('no live file names the retired CLI (lattice-emulator / build-emulator)', () => {
  const live = filesNamingOldCli().filter((f) => !HISTORY.some((re) => re.test(f)) && !(f in SANCTIONED));
  assert.deepEqual(
    live,
    [],
    'these files name the retired CLI. Use lattice.js / dist/lattice.js / tools/build-cli.js / ' +
      '`npx lattice` (see engineering/gotchas/lattice-internals.md), or sanction the file here with its reason.',
  );
});

test('every sanction still matches', () => {
  const hits = new Set(filesNamingOldCli());
  const stale = Object.keys(SANCTIONED).filter((f) => !hits.has(f));
  assert.deepEqual(stale, [], 'these sanctions no longer name the old CLI; delete them');
});
