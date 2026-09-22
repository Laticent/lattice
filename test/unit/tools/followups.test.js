/**
 * Unit: the followups.d/ format (tools/followups.js), which `checkFollowups` in
 * tools/check-ownership.js surfaces via build:check. Each case writes a throwaway
 * folder, so a change that makes the gate find nothing turns this red.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { followupProblems, listFollowups } = require(path.join(__dirname, '..', '..', '..', 'tools', 'followups.js'));

const GOOD = `---
origin: 42
priority: P1
recorded: 2026-09-22
---

# Fix the thing

where     — lib/x.js
done when — the thing is fixed
`;

function folder(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'followups-'));
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

test('a well-formed item and the README pass', () => {
  const dir = folder({ 'README.md': '# anything', '42-p1-fix-the-thing.md': GOOD });
  assert.deepEqual(followupProblems(dir), []);
  assert.deepEqual(listFollowups(dir).map((i) => [i.origin, i.priority, i.title]), [['42', 'P1', 'Fix the thing']]);
});

test('a closing fence with trailing spaces still parses', () => {
  assert.deepEqual(followupProblems(folder({ '42-p1-x.md': GOOD.replace('\n---\n\n#', '\n---  \n\n#') })), []);
});

test('a missing folder is a defect, not a pass', () => {
  assert.equal(followupProblems(path.join(os.tmpdir(), 'no-such-followups-dir')).length, 1);
});

test('a bad file name is reported', () => {
  const [p] = followupProblems(folder({ 'fix-the-thing.md': GOOD }));
  assert.match(p, /name must be/);
});

test('origin and priority must match the file name', () => {
  const problems = followupProblems(folder({ '43-p2-x.md': GOOD }));
  assert.ok(problems.some((p) => /origin: 43/.test(p)));
  assert.ok(problems.some((p) => /priority: P2/.test(p)));
});

test('missing front matter fields are reported', () => {
  const problems = followupProblems(folder({ '42-p1-x.md': GOOD.replace('recorded: 2026-09-22\n', '') }));
  assert.ok(problems.some((p) => /recorded/.test(p)));
});

test('a `done when` line is required, and a title mentioning it does not count', () => {
  const body = GOOD.replace('done when — the thing is fixed\n', '').replace('# Fix the thing', '# Is it done when X');
  assert.ok(followupProblems(folder({ '42-p1-x.md': body })).some((p) => /done when/.test(p)));
});

test('a backfilled item is exempt from the `done when` line', () => {
  const body = GOOD.replace('done when — the thing is fixed\n', '').replace('recorded:', 'backfill: true\nrecorded:');
  assert.deepEqual(followupProblems(folder({ '42-p1-x.md': body })), []);
});

test('a heading inside a code fence is not the title', () => {
  const body = GOOD.replace('# Fix the thing\n', '```text\n# not a title\n```\n');
  assert.ok(followupProblems(folder({ '42-p1-x.md': body })).some((p) => /heading/.test(p)));
});
