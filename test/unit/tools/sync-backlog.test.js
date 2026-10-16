/**
 * Unit: the backlog mirror (tools/sync-backlog.js) and its listing (tools/backlog.js).
 *
 * Covers the per-issue render (status, the four axes, the two Definition of Ready fields read by
 * the triage gate's own parser), determinism (same issues, same bytes), and the CLI's folder
 * contract: it writes one file per open issue, deletes a closed issue's file, never touches the
 * hand-written README, and --check fails on drift in either direction.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const { renderBacklogFiles, renderIssueFile, statusSlug } = require(path.join(ROOT, 'tools', 'sync-backlog.js'));
const { listIssues, cards } = require(path.join(ROOT, 'tools', 'backlog.js'));

const FORM_BODY = [
  '## Summary', 'Make the thing.', '',
  '## Swimlane / governing decision doc', 'engineering/decisions/2026-09-27-plugin-system.md §7', '',
  '## Acceptance check', 'Every item below is ticked.', '',
  '## Notes / context', 'Long discussion that the mirror does not copy.',
].join('\n');

const issue = (n, labels = [], extra = {}) => ({
  number: n,
  title: `Issue ${n}`,
  labels: labels.map((name) => ({ name })),
  assignees: [],
  url: `https://github.com/Laticent/lattice/issues/${n}`,
  state: 'OPEN',
  body: '',
  ...extra,
});

describe('sync-backlog renderIssueFile', () => {
  test('front matter carries status and the four axes', () => {
    const md = renderIssueFile(issue(7, ['status:in-progress', 'priority:high', 'area:website', 'area:engine', 'type:fix', 'needs:triage'], {
      assignees: [{ login: 'octocat' }],
    }));
    assert.match(md, /^---\nissue: 7\nstatus: in-progress\narea: engine, website\ntype: fix\npriority: high\nassignees: octocat\nflags: needs:triage\n/);
    assert.match(md, /\n# Issue 7\n/);
  });

  test('an issue with no status label is `status: none`, never dropped', () => {
    assert.equal(statusSlug(issue(1, ['area:chart'])), 'none');
  });

  test('the two Definition of Ready fields come from the triage gate parser; the rest of the body does not', () => {
    const md = renderIssueFile(issue(3, ['status:backlog'], { body: FORM_BODY }));
    assert.match(md, /## Summary\n\nMake the thing\./);
    assert.match(md, /## Swimlane\n\nengineering\/decisions\/2026-09-27-plugin-system\.md §7/);
    assert.match(md, /## Done when\n\nEvery item below is ticked\./);
    assert.doesNotMatch(md, /Long discussion/);
  });

  test('a hand-written card is read through the same aliases the gate accepts', () => {
    const md = renderIssueFile(issue(4, [], { body: '## Governing doc\n\ndesign/forms.md\n\n## Definition of done\n\n- [ ] it renders' }));
    assert.match(md, /## Swimlane\n\ndesign\/forms\.md/);
    assert.match(md, /## Done when\n\n- \[ \] it renders/);
  });

  test('a missing field reads as missing, not blank', () => {
    const md = renderIssueFile(issue(5, ['status:backlog'], { body: 'A bot-filed failure log.' }));
    assert.match(md, /## Swimlane\n\n_missing — no governing doc on the issue_/);
    assert.match(md, /## Done when\n\n_missing — no acceptance check on the issue_/);
    assert.doesNotMatch(md, /## Summary/);
  });

  test('a multi-line title is one heading line', () => {
    assert.match(renderIssueFile(issue(6, [], { title: 'a\nb  c' })), /\n# a b c\n/);
  });
});

describe('sync-backlog renderBacklogFiles', () => {
  test('one file per open issue, named by number; closed issues are skipped', () => {
    const files = renderBacklogFiles([issue(2), issue(10), issue(3, [], { state: 'CLOSED' })]);
    assert.deepEqual(Object.keys(files), ['2.md', '10.md']);
  });

  test('is deterministic: same issues, identical bytes', () => {
    const list = [issue(3, ['status:ready'], { body: FORM_BODY }), issue(1, ['status:backlog'])];
    assert.deepEqual(renderBacklogFiles(list), renderBacklogFiles([...list].reverse()));
  });
});

describe('sync-backlog CLI', () => {
  const run = (args) => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'sync-backlog.js'), ...args], { encoding: 'utf8' });

  test('writes the folder, removes a closed issue, keeps the README, and --check sees drift', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backlog-d-'));
    const out = path.join(tmp, 'backlog.d');
    const input = path.join(tmp, 'issues.json');
    fs.mkdirSync(out);
    fs.writeFileSync(path.join(out, 'README.md'), '# hand-written');
    fs.writeFileSync(path.join(out, '99.md'), 'a closed issue');

    fs.writeFileSync(input, JSON.stringify([issue(1, ['status:backlog']), issue(2, ['status:ready'])]));
    assert.equal(run(['--input', input, '--out', out, '--check']).status, 1, 'drift before the write');
    assert.equal(run(['--input', input, '--out', out]).status, 0);
    assert.deepEqual(fs.readdirSync(out).sort(), ['1.md', '2.md', 'README.md']);
    assert.equal(run(['--input', input, '--out', out, '--check']).status, 0, 'clean after the write');

    fs.writeFileSync(input, JSON.stringify([issue(1, ['status:backlog'])]));
    assert.equal(run(['--input', input, '--out', out, '--check']).status, 1, 'a closed issue is drift too');
  });

  test('refuses an input with an entry that has no issue number, and writes nothing', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backlog-d-'));
    const out = path.join(tmp, 'backlog.d');
    const input = path.join(tmp, 'issues.json');
    // The shape a half-failed fetch produced: real issues plus an error object.
    fs.writeFileSync(input, JSON.stringify([issue(1), { message: 'HTTP 403' }]));
    const r = run(['--input', input, '--out', out]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /no issue number/);
    assert.equal(fs.existsSync(out), false);
  });
});

describe('backlog listing', () => {
  test('reads the mirror files back into rows', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backlog-list-'));
    const files = renderBacklogFiles([issue(8, ['status:ready', 'priority:high', 'area:chart', 'needs:definition'])]);
    for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), body);
    fs.writeFileSync(path.join(dir, 'README.md'), '# not a row');
    const [row] = listIssues(dir);
    assert.deepEqual([row.id, row.status, row.severity, row.areas, row.flags, row.title],
      ['#8', 'ready', 'high', ['chart'], ['needs:definition'], 'Issue 8']);
    assert.equal(listIssues(dir).length, 1);
  });

  test('banner grammar agrees at one and at many', () => {
    assert.equal(cards(1), '1 card needs');
    assert.equal(cards(2), '2 cards need');
  });

  test('the CLI runs on the real tree', () => {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'tools', 'backlog.js'), '--followups', '--min', 'high'], { encoding: 'utf8' });
    assert.match(out, /followup\(s\) in followups\.d\//);
  });
});
