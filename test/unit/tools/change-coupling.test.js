const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parseGitLog, computeCoupling } = require('../../../tools/change-coupling.js');

test('parseGitLog groups files under their commit and drops single-file commits', () => {
  const raw = [
    '@@abc123',
    'lib/a.js',
    'lib/b.js',
    '',
    '@@def456',
    'lib/a.js',
    '',
    '@@ghi789',
    'lib/a.js',
    'lib/c.js',
    'lib/d.js',
  ].join('\n');

  const commits = parseGitLog(raw, { include: /.*/, exclude: /^$/ });
  assert.equal(commits.length, 2, 'the single-file commit (def456) contributes no pairs');
  assert.deepEqual(commits[0], { hash: 'abc123', files: ['lib/a.js', 'lib/b.js'] });
  assert.deepEqual(commits[1], { hash: 'ghi789', files: ['lib/a.js', 'lib/c.js', 'lib/d.js'] });
});

test('parseGitLog applies include/exclude filters per file', () => {
  const raw = ['@@abc123', 'lib/a.js', 'dist/bundle.js', 'lib/b.js'].join('\n');
  const commits = parseGitLog(raw, { include: /^lib\//, exclude: /^dist\// });
  assert.deepEqual(commits[0].files, ['lib/a.js', 'lib/b.js']);
});

test('computeCoupling counts churn and pairwise co-changes, with a Jaccard-style confidence', () => {
  const commits = [
    { hash: '1', files: ['a.js', 'b.js'] },
    { hash: '2', files: ['a.js', 'b.js'] },
    { hash: '3', files: ['a.js', 'c.js'] },
  ];
  const { fileChangeCounts, pairs } = computeCoupling(commits);

  assert.equal(fileChangeCounts.get('a.js'), 3);
  assert.equal(fileChangeCounts.get('b.js'), 2);
  assert.equal(fileChangeCounts.get('c.js'), 1);

  const ab = pairs.find((p) => p.a === 'a.js' && p.b === 'b.js');
  assert.equal(ab.coChanges, 2);
  // a.js changed 3x, b.js changed 2x, together 2x -> 2 / (3 + 2 - 2) = 2/3
  assert.equal(Math.round(ab.confidence * 100) / 100, 0.67);

  const ac = pairs.find((p) => p.a === 'a.js' && p.c === undefined && p.b === 'c.js');
  assert.equal(ac.coChanges, 1);
  assert.equal(ac.confidence, 1 / 3);
});

test('computeCoupling de-duplicates a file listed twice in the same commit', () => {
  const commits = [{ hash: '1', files: ['a.js', 'a.js', 'b.js'] }];
  const { fileChangeCounts, pairs } = computeCoupling(commits);
  assert.equal(fileChangeCounts.get('a.js'), 1);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].coChanges, 1);
});
