/**
 * Unit: tools/night-eligible.mjs, the rules a night merge must pass.
 *
 * The merge gate runs this check itself before each night-mode merge, so every
 * never-merge class the owner named (2026-11-21) is pinned here: a card below VERY HIGH,
 * a card older than the head, red CI, CI or hook or canonical-doc paths, export and
 * fonts, a **Breaking:** fragment, security, releases, bots, and the desk's own PR.
 */
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const TOOL = path.join(__dirname, '..', '..', '..', 'tools', 'night-eligible.mjs');
let reasons;
before(async () => {
  ({ reasons } = await import(TOOL));
});

const CARD = (level, graded = 'checker agent (Opus), 2 rounds') =>
  `\`\`\`\n🚦 Pre-merge — #42 a fix\nreply: merge | hold\n\nBOTTOM LINE\n  confidence\n    ${level} · limited by: none\n  graded by\n    ${graded}\n\`\`\``;

const good = (over = {}) => ({
  pr: 42,
  session: 'session_night',
  state: 'open',
  draft: false,
  mergeableState: 'clean',
  author: 'saden1',
  headRef: 'claude/fix',
  headSha: 'abcdef1234567',
  headDate: '2026-11-21T22:00:00Z',
  title: 'fix(chart): a fix',
  body: 'https://claude.ai/code/session_worker',
  labels: [],
  files: ['lib/components/chart/bar/bar.css'],
  breakingFragments: [],
  checks: [{ name: 'ci', status: 'completed', conclusion: 'success' }],
  comments: [{ body: CARD('VERY HIGH'), createdAt: '2026-11-21T23:00:00Z' }],
  ...over,
});

test('a clean VERY HIGH PR graded after its head, with green ci, may merge', () => {
  assert.deepEqual(reasons(good()), []);
  assert.deepEqual(reasons(good({ mergeableState: 'behind' })), [], 'behind main is fine: the queue re-tests it');
});

test('below VERY HIGH, not graded by a checker, or graded before the head: no', () => {
  assert.match(reasons(good({ comments: [{ body: CARD('HIGH'), createdAt: '2026-11-21T23:00:00Z' }] })).join(), /not VERY HIGH/);
  assert.match(reasons(good({ comments: [{ body: CARD('VERY HIGH', 'the maker'), createdAt: '2026-11-21T23:00:00Z' }] })).join(), /not graded by a checker/);
  assert.match(reasons(good({ comments: [{ body: CARD('VERY HIGH'), createdAt: '2026-11-21T21:00:00Z' }] })).join(), /older than its head/);
  assert.match(reasons(good({ comments: [] })).join(), /no 🚦 pre-merge card/);
  const newerHigh = [
    { body: CARD('VERY HIGH'), createdAt: '2026-11-21T23:00:00Z' },
    { body: CARD('HIGH'), createdAt: '2026-11-21T23:30:00Z' },
  ];
  assert.match(reasons(good({ comments: newerHigh })).join(), /not VERY HIGH/, 'the NEWEST card decides');
});

test('red, missing or pending ci, a draft, a closed PR or a dirty merge state: no', () => {
  assert.match(reasons(good({ checks: [{ name: 'ci', status: 'completed', conclusion: 'failure' }] })).join(), /is failure/);
  assert.match(reasons(good({ checks: [] })).join(), /no `ci` check/);
  assert.match(reasons(good({ checks: [{ name: 'ci', status: 'in_progress', conclusion: null }] })).join(), /in_progress/);
  assert.match(reasons(good({ draft: true })).join(), /draft/);
  assert.match(reasons(good({ state: 'closed' })).join(), /is closed/);
  assert.match(reasons(good({ mergeableState: 'dirty' })).join(), /dirty, not clean/);
});

test('every never-merge class the owner named is refused, even at VERY HIGH', () => {
  for (const file of [
    '.github/workflows/ci.yml',
    'lefthook.yml',
    '.claude/hooks/owner-merge-gate.mjs',
    '.claude/settings.json',
    'CLAUDE.md',
    'engineering/workflow.md',
    'tools/night-eligible.mjs',
    'lib/export/marp-bundle.js',
    'lib/fonts/inter.css',
    'package.json',
  ]) {
    assert.match(reasons(good({ files: [file] })).join(), /never touches/, file);
  }
  assert.match(reasons(good({ breakingFragments: ['changelog.d/x.changed.md'] })).join(), /Breaking/);
  assert.match(reasons(good({ labels: ['security'] })).join(), /labeled security/);
  assert.match(reasons(good({ headRef: 'release/v1.2.0' })).join(), /is a release/);
  assert.match(reasons(good({ author: 'dependabot[bot]' })).join(), /dependabot\[bot\]/);
  assert.match(reasons(good({ body: 'Claude-Session: https://claude.ai/code/session_night' })).join(), /no self-approval/);
});
