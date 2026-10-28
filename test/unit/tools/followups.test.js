/**
 * Unit: the followups.d/ format (tools/followups.js), which `checkFollowups` in
 * tools/check-ownership.js surfaces via build:check. Each case writes a throwaway
 * folder, so a change that makes the gate find nothing turns this red.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
// A scratch repo must not reach the REAL one. A git hook exports GIT_DIR (and GIT_INDEX_FILE,
// GIT_WORK_TREE) to everything it runs, and from a worktree that GIT_DIR names the real repo, so
// the `git init` below, and the `git check-ignore` the module runs, would act on it. Strip them
// once, at the top (the leak #2404 found). `node --test` runs each file in its own process, so
// nothing outside this file sees the change.
for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k];
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { followupProblems, listFollowups, EVIDENCE_CAP } = require(path.join(__dirname, '..', '..', '..', 'tools', 'followups.js'));

const GOOD = `---
origin: 42
priority: P1
recorded: 2026-09-22
area: engine
severity: medium
swimlane: followups.d/README.md §The contract
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

test('area must be an area:* label from .github/labels.json', () => {
  assert.ok(followupProblems(folder({ '42-p1-x.md': GOOD.replace('area: engine', 'area: backend') })).some((p) => /area:/.test(p)));
  assert.ok(followupProblems(folder({ '42-p1-x.md': GOOD.replace('area: engine\n', '') })).some((p) => /area:/.test(p)));
});

test('severity is high, medium or low — critical is sent to an issue', () => {
  assert.ok(followupProblems(folder({ '42-p1-x.md': GOOD.replace('severity: medium', 'severity: P1') })).some((p) => /severity:/.test(p)));
  const [p] = followupProblems(folder({ '42-p1-x.md': GOOD.replace('severity: medium', 'severity: critical') }));
  assert.match(p, /belongs on an issue/);
});

test('swimlane must name a path that exists', () => {
  assert.ok(followupProblems(folder({ '42-p1-x.md': GOOD.replace('swimlane: followups.d/README.md §The contract\n', '') })).some((p) => /swimlane/.test(p)));
  const [p] = followupProblems(folder({ '42-p1-x.md': GOOD.replace('followups.d/README.md', 'engineering/no-such-note.md') }));
  assert.match(p, /not a file in the repo/);
  for (const bad of ['engineering/decisions', '../outside.md']) {
    assert.ok(followupProblems(folder({ '42-p1-x.md': GOOD.replace('followups.d/README.md', bad) })).some((q) => /not a file/.test(q)), bad);
  }
});

test('the listing carries area, severity and swimlane', () => {
  const [i] = listFollowups(folder({ '42-p1-x.md': GOOD }));
  assert.deepEqual([i.area, i.severity, i.swimlane], ['engine', 'medium', 'followups.d/README.md §The contract']);
});

// ── Evidence folders: `<item name>/` beside its item, living exactly as long as it ────────────

/** Write `files` (paths may hold `/`) under a fresh followups folder. */
function tree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'followups-'));
  for (const [name, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
}
const EVIDENCE_README = '# Evidence\n\nRan against abc1234. Run: node probe.mjs\n';

test('an evidence folder beside its item, with a README, passes and is listed', () => {
  const dir = tree({ '42-p1-fix-the-thing.md': GOOD, '42-p1-fix-the-thing/README.md': EVIDENCE_README, '42-p1-fix-the-thing/probe.mjs': 'console.log(1);\n' });
  assert.deepEqual(followupProblems(dir), []);
  assert.equal(listFollowups(dir)[0].evidence, true);
});

test('an evidence folder whose item is gone is refused: it lives exactly as long as the item', () => {
  const dir = tree({ '42-p1-fix-the-thing/README.md': EVIDENCE_README });
  assert.match(followupProblems(dir).join('\n'), /its item followups\.d\/42-p1-fix-the-thing\.md is gone/);
});

test('an evidence folder needs a README naming the commit and how to run it', () => {
  const dir = tree({ '42-p1-fix-the-thing.md': GOOD, '42-p1-fix-the-thing/probe.mjs': 'x\n' });
  assert.match(followupProblems(dir).join('\n'), /needs a README\.md/);
});

test('an evidence folder holds text only, no links, and stays under the cap', () => {
  const dir = tree({ '42-p1-fix-the-thing.md': GOOD, '42-p1-fix-the-thing/README.md': EVIDENCE_README });
  fs.writeFileSync(path.join(dir, '42-p1-fix-the-thing', 'shot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1]));
  fs.symlinkSync('/etc/hostname', path.join(dir, '42-p1-fix-the-thing', 'link'));
  fs.writeFileSync(path.join(dir, '42-p1-fix-the-thing', 'corpus.txt'), 'a'.repeat(EVIDENCE_CAP + 1));
  const problems = followupProblems(dir).join('\n');
  assert.match(problems, /shot\.png: binary/);
  assert.match(problems, /link: a symbolic link/);
  assert.match(problems, /over the 524288-byte \(512 KB\) cap/);
});

test('an evidence folder is named like its item', () => {
  const dir = tree({ 'Probe Kit/README.md': EVIDENCE_README });
  assert.match(followupProblems(dir).join('\n'), /named like its item/);
});

test('the cap counts every file in every subfolder, and a folder exactly at it passes', () => {
  const dir = tree({ '42-p1-fix-the-thing.md': GOOD, '42-p1-fix-the-thing/README.md': EVIDENCE_README });
  const rest = EVIDENCE_CAP - Buffer.byteLength(EVIDENCE_README);
  fs.mkdirSync(path.join(dir, '42-p1-fix-the-thing', 'data', 'deep'), { recursive: true });
  fs.writeFileSync(path.join(dir, '42-p1-fix-the-thing', 'data', 'a.txt'), 'a'.repeat(rest - 10));
  fs.writeFileSync(path.join(dir, '42-p1-fix-the-thing', 'data', 'deep', 'b.txt'), 'b'.repeat(10));
  assert.deepEqual(followupProblems(dir), []);
  fs.appendFileSync(path.join(dir, '42-p1-fix-the-thing', 'data', 'deep', 'b.txt'), 'b');
  assert.match(followupProblems(dir).join('\n'), /524289 bytes, over the/);
});

test('what git ignores is not evidence: a stray .DS_Store neither fails a folder nor keeps one alive', () => {
  // CI checks out only what git tracks, so the gate reads the folder the same way.
  const repo = tree({ '.gitignore': '.DS_Store\n', 'followups.d/42-p1-fix-the-thing.md': GOOD, 'followups.d/42-p1-fix-the-thing/README.md': EVIDENCE_README });
  assert.equal(spawnSync('git', ['init', '-q', repo]).status, 0);
  const dir = path.join(repo, 'followups.d');
  fs.writeFileSync(path.join(dir, '42-p1-fix-the-thing', '.DS_Store'), Buffer.from([0, 1, 2]));
  fs.mkdirSync(path.join(dir, '7-p1-closed-item'));
  fs.writeFileSync(path.join(dir, '7-p1-closed-item', '.DS_Store'), Buffer.from([0, 1, 2]));
  assert.deepEqual(followupProblems(dir), []);
  // A name git could read as a pattern is still a name: it must not switch ignoring off.
  fs.writeFileSync(path.join(dir, '42-p1-fix-the-thing', ':(icase)x.DS_Store'), 'x');
  fs.appendFileSync(path.join(repo, '.gitignore'), '*.log\n');
  fs.writeFileSync(path.join(dir, '42-p1-fix-the-thing', 'b.log'), Buffer.from([0, 1]));
  assert.deepEqual(followupProblems(dir), []);
});

test('only regular files count: a named pipe is refused rather than read, and a README must be a file', () => {
  const dir = tree({ '42-p1-fix-the-thing.md': GOOD, '42-p1-fix-the-thing/README.md/x.txt': 'x' });
  const fifo = path.join(dir, '42-p1-fix-the-thing', 'pipe');
  if (spawnSync('mkfifo', [fifo]).status === 0) assert.match(followupProblems(dir).join('\n'), /pipe: not a regular file/);
  assert.match(followupProblems(dir).join('\n'), /needs a README\.md/);
});

test('a symbolic link at the top of followups.d is refused, and is not listed as evidence', () => {
  const dir = tree({ '42-p1-fix-the-thing.md': GOOD, 'elsewhere/README.md': EVIDENCE_README });
  fs.symlinkSync(path.join(dir, 'elsewhere'), path.join(dir, '42-p1-fix-the-thing'));
  assert.match(followupProblems(dir).join('\n'), /42-p1-fix-the-thing: a symbolic link/);
  assert.equal(listFollowups(dir).find((i) => i.file === '42-p1-fix-the-thing.md').evidence, false);
});

test('a new item must say why it was deferred: large, blocked or off-path', () => {
  const fresh = GOOD.replace('origin: 42', 'origin: 3001').replace('recorded: 2026-09-22', 'recorded: 2026-10-29');
  const name = '3001-p1-x.md';
  const [p] = followupProblems(folder({ [name]: fresh }));
  assert.match(p, /deferred: large\|blocked\|off-path/);
  for (const ok of ['large — rewrites the export path', 'blocked — waits on the WebKit fix', 'off-path — the Studio sidebar, not touched here']) {
    assert.deepEqual(followupProblems(folder({ [name]: fresh.replace('area:', `deferred: ${ok}\narea:`) })), [], ok);
  }
  for (const bad of ['small', 'large', 'large —', 'later — no time', 'moderate — easy']) {
    assert.equal(followupProblems(folder({ [name]: fresh.replace('area:', `deferred: ${bad}\narea:`) })).length, 1, bad);
  }
});

test('the recorded date alone triggers the deferral check; an in-flight PR item recorded earlier is exempt', () => {
  assert.deepEqual(followupProblems(folder({ '42-p1-x.md': GOOD })), [], 'old date');
  assert.equal(followupProblems(folder({ '42-p1-x.md': GOOD.replace('2026-09-22', '2026-10-29') })).length, 1, 'new date');
  // #2953 was open when the rule landed: origin above the old ledger, recorded the day before.
  const inflight = GOOD.replace('origin: 42', 'origin: 2953').replace('2026-09-22', '2026-10-28');
  assert.deepEqual(followupProblems(folder({ '2953-p1-x.md': inflight })), [], 'in-flight PR, recorded before the cutoff');
});
