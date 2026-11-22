/**
 * Unit: tools/night-eligible.mjs, the rules a night merge must pass.
 *
 * The merge gate runs this check itself (from origin/main) before each night-mode merge.
 * Each rule the owner chose on 2026-11-21, and each hole the red team, the inversion and
 * the checker found in the first draft, is pinned here: a stranger's or a fork's PR, a
 * forged or edited card, a card that names an older head, the night session's own PR,
 * a red main, a renamed path, visual and control-plane paths, a breaking fragment.
 */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const TOOL = path.join(__dirname, '..', '..', '..', 'tools', 'night-eligible.mjs');
let reasons;
let pathReason;
before(async () => {
  ({ reasons, pathReason } = await import(TOOL));
});

const HEAD = 'abcdef1234567890';
const CARD = (level, graded = 'checker agent (Opus), 2 rounds', head = 'abcdef1') =>
  `\`\`\`\n🚦 Pre-merge — #42 a fix\nreply: merge | hold\n\nBOTTOM LINE\n  confidence\n    ${level} · limited by: none\n  graded by\n    ${graded}\n\nPROOF\n  ran\n    CI ${head}\n\`\`\``;
const comment = (body, over = {}) => ({ body, author: 'saden1', createdAt: '2026-11-21T23:00:00Z', updatedAt: '2026-11-21T23:00:00Z', ...over });

const good = (over = {}) => ({
  pr: 42,
  session: 'session_night01',
  state: 'open',
  draft: false,
  mergeableState: 'clean',
  author: 'saden1',
  headRepo: 'Laticent/lattice',
  headRef: 'claude/fix',
  headSha: HEAD,
  title: 'fix(tools): a fix',
  labels: [],
  changedFiles: 1,
  files: [{ filename: 'tools/merge-order.mjs' }],
  breakingFragments: [],
  commitMessages: ['fix(tools): a fix\n\nClaude-Session: https://claude.ai/code/session_worker02'],
  checks: [{ name: 'ci', app: 'github-actions', status: 'completed', conclusion: 'success' }],
  redOnMain: [],
  comments: [comment(CARD('VERY HIGH'))],
  ...over,
});
const why = (over) => reasons(good(over)).join(' | ');

test("the owner's clean, non-visual VERY HIGH PR whose card names its head may merge", () => {
  assert.deepEqual(reasons(good()), []);
  assert.deepEqual(reasons(good({ mergeableState: 'behind' })), [], 'behind main is fine: the queue re-tests it');
});

test("a stranger's PR, a fork, or a card from another account or edited after posting: no", () => {
  assert.match(why({ author: 'someone-else' }), /not the owner's account/);
  assert.match(why({ headRepo: 'someone/lattice' }), /not Laticent\/lattice/);
  assert.match(why({ comments: [comment(CARD('VERY HIGH'), { author: 'someone-else' })] }), /card was posted by someone-else/);
  assert.match(why({ comments: [comment(CARD('VERY HIGH'), { updatedAt: '2026-11-22T01:00:00Z' })] }), /edited after it was posted/);
});

test('the card is read by its structure: level line, grader line, and the head it names', () => {
  assert.match(why({ comments: [comment(CARD('HIGH'))] }), /not VERY HIGH/);
  assert.match(why({ comments: [comment(CARD('VERY HIGH', 'the maker, not a checker'))] }), /not graded by a checker/);
  const quoted = `${CARD('HIGH')}\nAn earlier round read:\n  confidence\n    VERY HIGH`;
  assert.match(why({ comments: [comment(quoted)] }), /not VERY HIGH/, 'a quoted VERY HIGH lower down does not count');
  assert.match(why({ comments: [comment(CARD('VERY HIGH', undefined, '1111111'))] }), /does not name its head abcdef1/);
  assert.match(why({ comments: [] }), /no 🚦 pre-merge card/);
  const newerHigh = [comment(CARD('VERY HIGH')), comment(CARD('HIGH'), { createdAt: '2026-11-21T23:30:00Z', updatedAt: '2026-11-21T23:30:00Z' })];
  assert.match(why({ comments: newerHigh }), /not VERY HIGH/, 'the NEWEST card decides');
});

test("the night session's own PR, or a missing session id, is refused", () => {
  const own = ['x\n\nClaude-Session: https://claude.ai/code/session_night01'];
  assert.match(why({ commitMessages: own }), /no self-approval/);
  assert.match(why({ session: '' }), /session id is missing/);
  assert.match(why({ session: 'caf08b78-bd62-5d23-b7a8-b8ef817cf86c' }), /session id is missing/, 'the local UUID is the wrong form');
});

test('red, missing or foreign ci, a red main, a draft, a closed or dirty PR: no', () => {
  assert.match(why({ checks: [{ name: 'ci', app: 'github-actions', conclusion: 'failure' }] }), /is failure/);
  assert.match(why({ checks: [{ name: 'ci', app: 'some-other-app', conclusion: 'success' }] }), /no `ci` check from GitHub Actions/);
  assert.match(why({ checks: [] }), /no `ci` check/);
  assert.match(why({ redOnMain: ['Golden bless (nightly)'] }), /Golden bless \(nightly\) run on main is red/);
  assert.match(why({ draft: true }), /draft/);
  assert.match(why({ state: 'closed' }), /is closed/);
  for (const state of ['dirty', 'unstable', 'unknown', null]) assert.match(why({ mergeableState: state }), /not clean/);
});

test('every path, old name and new, must be under an allowed root and outside every never-merge class', () => {
  for (const file of [
    '.github/workflows/ci.yml',
    'lefthook.yml',
    '.claude/hooks/owner-merge-gate.mjs',
    '.claude/settings.json',
    '.claude/skills/desk-night/owner.md',
    '.claude/agents/checker.md',
    'CLAUDE.md',
    'lattice.js',
    'docs/package.json',
    'docs/src/components/studio/Studio.tsx',
    'themes/indaco/indaco.css',
    'examples/fix.md',
    'engineering/workflow.md',
    'tools/night-eligible.mjs',
    'tools/card.js',
    'tools/flaky-test-baseline.json',
    'lib/authoring/lint-core.js',
    'lib/core/sanitize-style-text.mjs',
    'lib/export/marp-bundle.js',
    'lib/components/chart/bar/bar.css',
    'lib/engine/x.css',
    'test/fixtures/golden.png',
    'test/unit/tools/owner-merge-gate.test.js',
  ]) {
    assert.ok(pathReason(file), file);
  }
  for (const file of ['tools/merge-order.mjs', 'test/unit/tools/merge-order.test.js', 'engineering/decisions/x.md', 'lib/engine/render.js', 'followups.d/1-p1-x.md']) {
    assert.equal(pathReason(file), '', file);
  }
  assert.match(why({ files: [{ filename: 'tools/old-ci.yml', previous: '.github/workflows/ci.yml' }] }), /\.github\/workflows\/ci\.yml/, 'a rename out of a never path');
});

test('an incomplete or oversized file list, a breaking fragment, a release, a guarded label: no', () => {
  assert.match(why({ changedFiles: 2 }), /could not be read in full/);
  assert.match(why({ changedFiles: 301, files: [] }), /over the night limit/);
  assert.match(why({ breakingFragments: ['changelog.d/x.changed.md'] }), /breaking-change/);
  assert.match(why({ title: 'chore(release): v2.0.0' }), /is a release/);
  assert.match(why({ headRef: 'release/v1.2.0' }), /is a release/);
  for (const label of ['security', 'Type: Security', 'release', 'dependencies', 'Breaking change']) {
    assert.match(why({ labels: [label] }), /is labeled/, label);
  }
});
