/**
 * Unit: backlog mirror (tools/sync-backlog.js).
 *
 * Covers the pure render: column routing from `status:` labels, priority
 * sorting, the meta suffix, the Inbox catch-all, and determinism (same issues
 * → same bytes, so the mirror only churns on a real queue change).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { renderBacklog, columnFor, INBOX } = require(path.join(__dirname, '..', '..', '..', 'tools', 'sync-backlog.js'));

const issue = (n, labels = [], extra = {}) => ({
  number: n,
  title: `Issue ${n}`,
  labels: labels.map((name) => ({ name })),
  assignees: [],
  url: `https://github.com/Laticent/lattice/issues/${n}`,
  state: 'OPEN',
  ...extra,
});

describe('sync-backlog columnFor', () => {
  test('routes by status label, falls back to Inbox', () => {
    assert.equal(columnFor(issue(1, ['status:ready'])), 'Ready');
    assert.equal(columnFor(issue(2, ['status:in-progress'])), 'In progress');
    assert.equal(columnFor(issue(3, ['status:review'])), 'In review');
    assert.equal(columnFor(issue(4, ['status:backlog'])), 'Backlog');
    assert.equal(columnFor(issue(5, ['area:chart'])), INBOX);
  });
});

describe('sync-backlog renderBacklog', () => {
  test('groups under every column header with counts', () => {
    const md = renderBacklog([issue(1, ['status:ready']), issue(2, ['status:ready'])]);
    assert.match(md, /## Ready \(2\)/);
    assert.match(md, /## Backlog \(0\)/);
    assert.match(md, /_none_/); // empty columns render a placeholder
    assert.match(md, /\*\*2 open\*\* items/);
  });

  test('sorts a column by priority then issue number', () => {
    const md = renderBacklog([
      issue(10, ['status:ready', 'priority:low']),
      issue(11, ['status:ready', 'priority:critical']),
      issue(12, ['status:ready', 'priority:high']),
    ]);
    const order = ['#11', '#12', '#10'].map((s) => md.indexOf(s));
    assert.ok(order[0] < order[1] && order[1] < order[2], 'critical < high < low');
  });

  test('renders area + priority + assignee meta', () => {
    const md = renderBacklog([
      issue(7, ['status:in-progress', 'priority:high', 'area:engine'], { assignees: [{ login: 'octocat' }] }),
    ]);
    assert.match(md, /\[#7\]\(https:[^)]+\) Issue 7 — high · engine · @octocat/);
  });

  test('excludes closed issues', () => {
    const md = renderBacklog([issue(1, ['status:ready']), issue(2, ['status:ready'], { state: 'CLOSED' })]);
    assert.match(md, /## Ready \(1\)/);
    assert.doesNotMatch(md, /#2\b/);
  });

  test('is deterministic — same issues yield identical bytes', () => {
    const list = [issue(3, ['status:ready']), issue(1, ['status:backlog'])];
    assert.equal(renderBacklog(list), renderBacklog(list));
  });

  test('empty queue renders the zero-state', () => {
    const md = renderBacklog([]);
    assert.match(md, /\*\*0 open\*\* items/);
    assert.match(md, /## Inbox \(no status\) \(0\)/);
  });

  test('surfaces a triage banner listing needs:triage cards', () => {
    const md = renderBacklog([
      issue(5, ['status:backlog', 'needs:triage']),
      issue(9, ['status:backlog', 'needs:triage', 'area:engine']),
      issue(2, ['status:ready', 'area:docs', 'type:docs', 'priority:low']),
    ]);
    assert.match(md, /⚠️ \*\*2 cards need triage\*\*/);
    assert.match(md, /\[#5\]\(.*?\), \[#9\]\(.*?\)/); // sorted by number, only the flagged ones
    assert.doesNotMatch(md, /need triage\*\*[^\n]*#2\b/); // the compliant card isn't listed
  });

  test('no triage banner when the queue is clean', () => {
    const md = renderBacklog([issue(1, ['status:backlog', 'area:docs', 'type:docs', 'priority:low'])]);
    assert.doesNotMatch(md, /need triage/);
  });
});
