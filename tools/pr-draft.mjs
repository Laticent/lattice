#!/usr/bin/env node
/**
 * Park an open PR as a draft, or mark it ready so CI runs once on its head, without the race.
 *
 * #3314 made `ci.yml`, `platform-suites.yml` and `docs-preview.yml` skip every job on a draft
 * PR, so a session iterates as a draft and marks the PR ready once to run CI
 * (engineering/workflow.md §Iterating on an open PR). Doing that by hand with the two REST
 * routes had one race: marking the PR ready about a second after a draft push left a READY PR
 * whose only `ci` run had skipped every job (#3333, 2026-11-20). GitHub had folded the ready
 * event into the push's run, which carried the draft snapshot, and a skipped `ci` reads as
 * passing. `ready` closes it:
 *
 *   1. waits until every `ci` run on the head exists and has finished (the push's skipped run);
 *   2. marks the PR ready;
 *   3. waits for a NEW `ci` run on the head and checks that its `changes` job was not skipped;
 *   4. if it was (the race lost anyway), parks the PR, waits, and marks it ready once more.
 *
 * `park` converts the PR to a draft and says so if a `ci` run is still going on it: parking does
 * not stop a run, so the next push cancels it. Never park a PR in the merge queue (converting
 * it to a draft removes it from the queue).
 *
 * Cloud sessions cannot call `gh pr ready` (GraphQL is blocked there), so both verbs use the
 * session proxy's REST routes `pulls/<n>/ccr/convert_to_draft` and `…/ccr/ready_for_review`
 * through `gh api`.
 *
 * Usage:  npm run pr:park -- <PR>      npm run pr:ready -- <PR>
 * Exit codes: 0 done · 1 `ready` could not get a real CI run on the head after one retry ·
 * 3 GitHub could not be read or written, or a wait ran out · 64 bad arguments.
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REPO = 'Laticent/lattice';
const WORKFLOW = 'ci.yml';

/** A failure that maps to an exit code. */
export class PrDraftError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** The real GitHub client: `gh api`, JSON in and out. */
export function ghApi(method, path) {
  const out = spawnSync('gh', ['api', '-X', method, path], { encoding: 'utf8' });
  if (out.status !== 0) {
    throw new PrDraftError(`gh api ${method} ${path} failed: ${(out.stderr || out.stdout || '').trim()}`, 3);
  }
  return out.stdout.trim() ? JSON.parse(out.stdout) : {};
}

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The `ci` runs GitHub has created for one head SHA on pull_request events. */
function ciRuns(api, sha) {
  const page = api('GET', `repos/${REPO}/actions/workflows/${WORKFLOW}/runs?head_sha=${sha}&event=pull_request&per_page=50`);
  return page.workflow_runs || [];
}

/** Poll `check` until it returns a value, up to `tries` times `intervalMs` apart. */
async function poll(check, { tries, intervalMs, sleep, what }) {
  for (let i = 0; i < tries; i++) {
    const value = check();
    if (value) return value;
    await sleep(intervalMs);
  }
  throw new PrDraftError(`gave up waiting for ${what}`, 3);
}

/**
 * Wait until every `ci` run already on `sha` has finished. At least one must exist when
 * `needOne` is set: a draft push makes one, and marking ready before it exists is the race.
 */
function settled(api, sha, needOne) {
  const runs = ciRuns(api, sha);
  if (needOne && runs.length === 0) return null;
  return runs.every((r) => r.status === 'completed') ? runs : null;
}

/** For a run started after ready: 'real' once `changes` is past skipping, 'skipped' if it skipped, null while unknown. */
function verdict(api, run) {
  if (run.status === 'completed' && run.conclusion === 'skipped') return 'skipped';
  const jobs = api('GET', `repos/${REPO}/actions/runs/${run.id}/jobs?per_page=100`).jobs || [];
  const changes = jobs.find((j) => j.name === 'changes');
  if (!changes) return null;
  if (changes.conclusion === 'skipped') return 'skipped';
  return 'real';
}

/** Convert the PR to a draft. Returns the lines to print. */
export async function park(pr, { api = ghApi } = {}) {
  const lines = [];
  const before = api('GET', `repos/${REPO}/pulls/${pr}`);
  if (before.draft) {
    lines.push(`#${pr} is already a draft; pushes run no CI.`);
    return lines;
  }
  const running = ciRuns(api, before.head.sha).filter((r) => r.status !== 'completed');
  api('POST', `repos/${REPO}/pulls/${pr}/ccr/convert_to_draft`);
  lines.push(`#${pr} parked as a draft. Push freely, run the local gates, then: npm run pr:ready -- ${pr}`);
  if (running.length) {
    lines.push(`note: a ci run is still going on ${before.head.sha.slice(0, 7)} (${running[0].html_url}); parking does not stop it, and your next push cancels it.`);
  }
  return lines;
}

/** Mark the PR ready and confirm a real CI run started on its head. Returns the lines to print. */
export async function ready(pr, { api = ghApi, sleep = realSleep, tries = 36, intervalMs = 5000 } = {}) {
  const lines = [];
  const opts = { tries, intervalMs, sleep };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const pull = api('GET', `repos/${REPO}/pulls/${pr}`);
    const sha = pull.head.sha;
    const short = sha.slice(0, 7);
    if (attempt === 1 && !pull.draft) {
      const real = ciRuns(api, sha).find((r) => r.conclusion !== 'skipped');
      if (real) {
        lines.push(`#${pr} is already ready and has a ci run on ${short}: ${real.html_url}`);
        return lines;
      }
      api('POST', `repos/${REPO}/pulls/${pr}/ccr/convert_to_draft`);
      lines.push(`#${pr} was ready with no real ci run on ${short}; parked it to mark it ready cleanly.`);
    }
    // 1. The push's own (skipped) run must exist and be finished before the ready event.
    const seen = await poll(() => settled(api, sha, attempt === 1 && pull.draft), { ...opts, what: `the draft run on ${short} to finish` });
    const seenIds = new Set(seen.map((r) => r.id));
    // 2. Mark it ready.
    api('POST', `repos/${REPO}/pulls/${pr}/ccr/ready_for_review`);
    // 3. A new run must appear, and its `changes` job must not skip.
    const run = await poll(() => ciRuns(api, sha).find((r) => !seenIds.has(r.id)), { ...opts, what: `a ci run on ${short} after marking it ready` });
    const result = await poll(() => verdict(api, api('GET', `repos/${REPO}/actions/runs/${run.id}`)), {
      ...opts,
      what: `the ci run ${run.html_url} to start its changes job`,
    });
    if (result === 'real') {
      lines.push(`#${pr} is ready; ci is running on ${short}: ${run.html_url}`);
      return lines;
    }
    // 4. The ready event landed in a draft-snapshot run. Park and try once more.
    lines.push(`the ci run after ready skipped every job (${run.html_url}); parking and marking ready again.`);
    api('POST', `repos/${REPO}/pulls/${pr}/ccr/convert_to_draft`);
  }
  throw new PrDraftError(`#${pr}: no real ci run started on its head after two tries; mark it ready by hand and check the run`, 1);
}

async function main(argv) {
  const [verb, pr] = argv;
  if (!['park', 'ready'].includes(verb) || !/^\d+$/.test(pr || '')) {
    console.error('usage: npm run pr:park -- <PR>   |   npm run pr:ready -- <PR>');
    return 64;
  }
  try {
    const lines = verb === 'park' ? await park(Number(pr)) : await ready(Number(pr));
    for (const line of lines) console.log(line);
    return 0;
  } catch (err) {
    console.error(`pr:${verb}: ${err.message}`);
    return err instanceof PrDraftError ? err.code : 3;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
