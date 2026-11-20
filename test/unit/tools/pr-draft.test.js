/**
 * Unit: tools/pr-draft.mjs — `npm run pr:park` / `npm run pr:ready`, the helpers behind the
 * draft-iterate procedure (engineering/workflow.md §Iterating on an open PR).
 *
 * The dangerous direction is a READY PR with no real CI run on its head: its `ci` reads
 * `skipped`, which GitHub counts as passing. #3333 hit it by marking ready a second after a
 * draft push. Every case runs against an in-memory fake of the GitHub REST calls; `sleep` is a
 * fake that advances the fake's clock, so nothing waits on wall time or reaches the network.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE = pathToFileURL(path.join(__dirname, '../../../tools/pr-draft.mjs')).href;
const SHA = 'c'.repeat(40);

/**
 * A fake GitHub holding one PR. `onReady(gh)` decides what run the ready event creates;
 * `onTick(gh)` runs on every fake sleep, which is how runs appear and finish over time.
 */
function fakeGitHub({ draft = true, runs = [], onReady = defaultReady, onTick = () => {} } = {}) {
  const gh = { draft, runs: [...runs], jobs: {}, calls: [], nextId: 100, ticks: 0 };
  gh.addRun = (status, conclusion, changes) => {
    const id = gh.nextId++;
    gh.runs.push({ id, status, conclusion, html_url: `https://example.test/runs/${id}` });
    if (changes) gh.jobs[id] = [{ name: 'changes', status: changes === 'queued' ? 'queued' : 'completed', conclusion: changes === 'queued' ? null : changes }];
    return id;
  };
  gh.api = (method, p) => {
    gh.calls.push(`${method} ${p.replace(/\?.*$/, '')}`);
    if (method === 'GET' && /\/pulls\/\d+$/.test(p)) return { draft: gh.draft, head: { sha: SHA } };
    if (method === 'GET' && p.includes('/workflows/ci.yml/runs')) return { workflow_runs: gh.runs.map((r) => ({ ...r })) };
    if (method === 'GET' && /\/actions\/runs\/\d+\/jobs/.test(p)) return { jobs: gh.jobs[Number(p.match(/runs\/(\d+)/)[1])] || [] };
    if (method === 'GET' && /\/actions\/runs\/\d+$/.test(p)) return { ...gh.runs.find((r) => r.id === Number(p.match(/runs\/(\d+)$/)[1])) };
    if (method === 'POST' && p.endsWith('/ccr/convert_to_draft')) {
      gh.draft = true;
      return { draft: true };
    }
    if (method === 'POST' && p.endsWith('/ccr/ready_for_review')) {
      gh.draft = false;
      onReady(gh);
      return { draft: false };
    }
    throw new Error(`fake GitHub has no route for ${method} ${p}`);
  };
  gh.sleep = async () => {
    gh.ticks++;
    onTick(gh);
  };
  return gh;
}

/** The common case: the ready event starts a run whose `changes` job is queued, not skipped. */
function defaultReady(gh) {
  gh.addRun('queued', null, 'queued');
}

const opts = (gh) => ({ api: gh.api, sleep: gh.sleep, tries: 5, intervalMs: 1 });

test('ready: a draft whose push run has finished goes ready and confirms a real run', async () => {
  const { ready } = await import(MODULE);
  const gh = fakeGitHub({ runs: [{ id: 1, status: 'completed', conclusion: 'skipped', html_url: 'u1' }] });
  const lines = await ready(3333, opts(gh));
  assert.match(lines.at(-1), /is ready; ci is running on ccccccc: https:\/\/example\.test\/runs\/100/);
  assert.equal(gh.draft, false);
  assert.equal(gh.calls.filter((c) => c.endsWith('/ccr/ready_for_review')).length, 1);
});

test('ready: waits for the push run to exist and finish before marking ready (the #3333 race)', async () => {
  const { ready } = await import(MODULE);
  // No run yet: the push's skipped run appears on tick 1 and finishes on tick 2.
  const gh = fakeGitHub({
    onTick: (g) => {
      if (g.ticks === 1) g.addRun('queued', null);
      if (g.ticks === 2) Object.assign(g.runs[0], { status: 'completed', conclusion: 'skipped' });
    },
  });
  await ready(3333, opts(gh));
  const readyAt = gh.calls.findIndex((c) => c.endsWith('/ccr/ready_for_review'));
  assert.ok(gh.ticks >= 2, 'it must wait for the push run before the ready event');
  assert.ok(readyAt > 0);
  // Every runs read before the ready call happened while a draft run was missing or going.
  const runReadsBefore = gh.calls.slice(0, readyAt).filter((c) => c.includes('/workflows/ci.yml/runs')).length;
  assert.ok(runReadsBefore >= 3, `expected repeated reads before ready, saw ${runReadsBefore}`);
});

test('ready: a run that skipped every job after ready gets one re-park and retry', async () => {
  const { ready } = await import(MODULE);
  let readies = 0;
  const gh = fakeGitHub({
    runs: [{ id: 1, status: 'completed', conclusion: 'skipped', html_url: 'u1' }],
    onReady: (g) => {
      readies++;
      if (readies === 1) g.addRun('completed', 'skipped', 'skipped'); // the race lost: a draft-snapshot run
      else g.addRun('queued', null, 'queued');
    },
  });
  const lines = await ready(3333, opts(gh));
  assert.equal(readies, 2);
  assert.ok(lines.some((l) => /skipped every job.*parking and marking ready again/.test(l)));
  assert.match(lines.at(-1), /is ready; ci is running/);
  assert.equal(gh.calls.filter((c) => c.endsWith('/ccr/convert_to_draft')).length, 1);
});

test('ready: two skipped runs in a row fail with exit code 1, never a silent "ready"', async () => {
  const { ready, PrDraftError } = await import(MODULE);
  const gh = fakeGitHub({
    runs: [{ id: 1, status: 'completed', conclusion: 'skipped', html_url: 'u1' }],
    onReady: (g) => g.addRun('completed', 'skipped', 'skipped'),
  });
  await assert.rejects(ready(3333, opts(gh)), (err) => err instanceof PrDraftError && err.code === 1);
});

test('ready: a ready PR with a real run on its head is left alone', async () => {
  const { ready } = await import(MODULE);
  const gh = fakeGitHub({ draft: false, runs: [{ id: 1, status: 'in_progress', conclusion: null, html_url: 'u1' }] });
  const lines = await ready(3333, opts(gh));
  assert.match(lines[0], /already ready and has a ci run/);
  assert.equal(gh.calls.filter((c) => c.startsWith('POST')).length, 0);
});

test('ready: a ready PR whose only run skipped is parked and marked ready cleanly', async () => {
  const { ready } = await import(MODULE);
  const gh = fakeGitHub({ draft: false, runs: [{ id: 1, status: 'completed', conclusion: 'skipped', html_url: 'u1' }] });
  const lines = await ready(3333, opts(gh));
  assert.match(lines[0], /was ready with no real ci run/);
  assert.match(lines.at(-1), /is ready; ci is running/);
});

test('ready: a wait that runs out exits 3 and never marks ready', async () => {
  const { ready, PrDraftError } = await import(MODULE);
  const gh = fakeGitHub(); // the push run never appears
  await assert.rejects(ready(3333, opts(gh)), (err) => err instanceof PrDraftError && err.code === 3);
  assert.equal(gh.calls.filter((c) => c.endsWith('/ccr/ready_for_review')).length, 0);
});

test('park: converts to a draft and warns that a running ci run keeps going', async () => {
  const { park } = await import(MODULE);
  const gh = fakeGitHub({ draft: false, runs: [{ id: 1, status: 'in_progress', conclusion: null, html_url: 'u1' }] });
  const lines = await park(3333, { api: gh.api });
  assert.equal(gh.draft, true);
  assert.match(lines[0], /parked as a draft/);
  assert.match(lines[1], /parking does not stop it/);
});

test('park: an already-draft PR is not touched', async () => {
  const { park } = await import(MODULE);
  const gh = fakeGitHub({ draft: true });
  const lines = await park(3333, { api: gh.api });
  assert.match(lines[0], /already a draft/);
  assert.equal(gh.calls.filter((c) => c.startsWith('POST')).length, 0);
});

test('ready: a run still going whose changes job skipped counts as skipped, not real', async () => {
  const { ready } = await import(MODULE);
  let readies = 0;
  const gh = fakeGitHub({
    runs: [{ id: 1, status: 'completed', conclusion: 'skipped', html_url: 'u1' }],
    onReady: (g) => {
      readies++;
      // The run has not finished, but its `changes` job already skipped: a draft-snapshot run.
      if (readies === 1) g.addRun('in_progress', null, 'skipped');
      else g.addRun('queued', null, 'queued');
    },
    // GitHub finishes a run whose jobs all skipped within seconds; the retry waits for that.
    onTick: (g) => {
      for (const r of g.runs) if (r.status === 'in_progress' && g.jobs[r.id]?.[0]?.conclusion === 'skipped') Object.assign(r, { status: 'completed', conclusion: 'skipped' });
    },
  });
  const lines = await ready(3333, opts(gh));
  assert.equal(readies, 2, 'a skipped changes job must trigger the re-park and retry');
  assert.match(lines.at(-1), /is ready; ci is running on ccccccc: https:\/\/example\.test\/runs\/101/);
});
