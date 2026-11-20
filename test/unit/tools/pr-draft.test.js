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
  const gh = { draft, runs: [...runs], jobs: {}, calls: [], nextId: 100, ticks: 0, headSha: SHA };
  gh.addRun = (status, conclusion, changes) => {
    const id = gh.nextId++;
    gh.runs.push({ id, status, conclusion, html_url: `https://example.test/runs/${id}` });
    // `changes` is 'queued' / 'in_progress' (no conclusion yet) or a conclusion ('skipped', 'success', 'cancelled').
    if (changes) gh.jobs[id] = [{ name: 'changes', status: ['queued', 'in_progress'].includes(changes) ? changes : 'completed', conclusion: ['queued', 'in_progress'].includes(changes) ? null : changes }];
    return id;
  };
  gh.api = (method, p) => {
    gh.calls.push(`${method} ${p.replace(/\?.*$/, '')}`);
    if (method === 'GET' && /\/pulls\/\d+$/.test(p)) return { draft: gh.draft, head: { sha: gh.headSha, ref: 'feature', repo: { full_name: gh.headRepo || 'Laticent/lattice' } } };
    if (method === 'GET' && p.includes('/workflows/ci.yml/runs')) {
      // A run with no `sha` belongs to whatever head is asked about; one with a `sha` only to that commit.
      const asked = p.match(/head_sha=([0-9a-f]+)/)[1];
      return { workflow_runs: gh.runs.filter((r) => !r.sha || r.sha === asked).map((r) => ({ ...r })) };
    }
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

/** The common case: the ready event starts a run whose `changes` job is running, not skipped. */
function defaultReady(gh) {
  gh.addRun('in_progress', null, 'in_progress');
}

// `pushed` stands in for `git ls-remote`: by default the remote tip is whatever GitHub shows.
const opts = (gh) => ({ api: gh.api, sleep: gh.sleep, tries: 5, intervalMs: 1, pushed: () => gh.headSha });

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
      else g.addRun('in_progress', null, 'in_progress');
    },
  });
  const lines = await ready(3333, opts(gh));
  assert.equal(readies, 2);
  assert.ok(lines.some((l) => /did not run its jobs.*parking and marking ready again/.test(l)));
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
  const gh = fakeGitHub({ draft: false });
  gh.addRun('in_progress', null, 'in_progress');
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
      else g.addRun('in_progress', null, 'in_progress');
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

test('ready: a ready PR whose only run is a draft snapshot still going is NOT left alone (marked ready by hand mid-race)', async () => {
  const { ready } = await import(MODULE);
  const gh = fakeGitHub({
    draft: false,
    // GitHub finishes the all-skipped run within seconds.
    onTick: (g) => {
      for (const r of g.runs) if (r.status === 'in_progress' && g.jobs[r.id]?.[0]?.conclusion === 'skipped') Object.assign(r, { status: 'completed', conclusion: 'skipped' });
    },
  });
  gh.addRun('in_progress', null, 'skipped'); // conclusion still null: the old shortcut trusted this
  const lines = await ready(3333, opts(gh));
  assert.match(lines[0], /was ready with no real ci run/);
  assert.match(lines.at(-1), /is ready; ci is running/);
  assert.equal(gh.calls.filter((c) => c.endsWith('/ccr/ready_for_review')).length, 1);
});

test('ready: a canceled run on a ready PR does not count as tested', async () => {
  const { ready } = await import(MODULE);
  const gh = fakeGitHub({ draft: false });
  gh.addRun('completed', 'cancelled', 'success'); // `changes` ran, then a push canceled the run
  const lines = await ready(3333, opts(gh));
  assert.match(lines[0], /was ready with no real ci run/);
  assert.match(lines.at(-1), /is ready; ci is running/);
});

test('ready: a draft whose real run is still going fails fast with exit 3 and marks nothing ready', async () => {
  const { ready, PrDraftError } = await import(MODULE);
  const gh = fakeGitHub({ draft: true });
  gh.addRun('in_progress', null, 'in_progress'); // parked mid-run, no push since
  await assert.rejects(ready(3333, opts(gh)), (err) => err instanceof PrDraftError && err.code === 3 && /still going/.test(err.message));
  assert.equal(gh.calls.filter((c) => c.startsWith('POST')).length, 0);
  assert.equal(gh.ticks, 0, 'it must not wait out the real run');
});

test('ready: a run whose changes job is still queued is not called real until it starts', async () => {
  const { ready } = await import(MODULE);
  const gh = fakeGitHub({
    runs: [{ id: 1, status: 'completed', conclusion: 'skipped', html_url: 'u1' }],
    onReady: (g) => g.addRun('queued', null, 'queued'),
    onTick: (g) => {
      for (const jobs of Object.values(g.jobs)) if (jobs[0].status === 'queued') Object.assign(jobs[0], { status: 'in_progress' });
    },
  });
  const lines = await ready(3333, opts(gh));
  assert.ok(gh.ticks >= 1, 'it must wait for the queued changes job to start');
  assert.match(lines.at(-1), /is ready; ci is running/);
});

test('ghApi: a missing gh says so instead of an empty error', async () => {
  const { ghApi, PrDraftError } = await import(MODULE);
  const saved = process.env.PATH;
  process.env.PATH = '/nonexistent';
  try {
    assert.throws(() => ghApi('GET', 'repos/x/y'), (err) => err instanceof PrDraftError && err.code === 3 && /could not run gh/.test(err.message));
  } finally {
    process.env.PATH = saved;
  }
});

test('ready: run straight after a push, it waits for GitHub to show the pushed commit as the head (#3342 live)', async () => {
  const { ready } = await import(MODULE);
  const OLD = 'a'.repeat(40);
  const NEW = SHA;
  const gh = fakeGitHub({
    draft: true,
    onTick: (g) => {
      // GitHub catches up: the PR's head moves to the pushed commit, whose draft run then finishes.
      if (g.ticks === 1) g.headSha = NEW;
      if (g.ticks === 2) Object.assign(g.runs.find((r) => r.sha === NEW), { status: 'completed', conclusion: 'skipped' });
    },
  });
  gh.headSha = OLD;
  gh.runs.push({ id: 1, sha: OLD, status: 'in_progress', conclusion: null, html_url: 'old' });
  gh.jobs[1] = [{ name: 'changes', status: 'completed', conclusion: 'success' }]; // the old commit's real run, still going
  gh.runs.push({ id: 2, sha: NEW, status: 'queued', conclusion: null, html_url: 'new-draft' });
  const lines = await ready(3333, { ...opts(gh), pushed: (ref) => (ref === 'feature' ? NEW : null) });
  assert.match(lines.at(-1), /is ready; ci is running on ccccccc/);
});

test('ready: a fork PR never waits on this repo\'s remote', async () => {
  const { ready } = await import(MODULE);
  const gh = fakeGitHub({ runs: [{ id: 1, status: 'completed', conclusion: 'skipped', html_url: 'u1' }] });
  gh.headRepo = 'someone/lattice';
  const lines = await ready(3333, { ...opts(gh), pushed: () => 'f'.repeat(40) });
  assert.match(lines.at(-1), /is ready; ci is running/);
  assert.equal(gh.ticks, 0);
});

test('ready: an unreadable remote does not block (no wait, same as before the fix)', async () => {
  const { ready } = await import(MODULE);
  const gh = fakeGitHub({ runs: [{ id: 1, status: 'completed', conclusion: 'skipped', html_url: 'u1' }] });
  const lines = await ready(3333, { ...opts(gh), pushed: () => null });
  assert.match(lines.at(-1), /is ready; ci is running/);
  assert.equal(gh.ticks, 0);
});
