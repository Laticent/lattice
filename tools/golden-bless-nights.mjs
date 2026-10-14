#!/usr/bin/env node
// The bless bot's dry-run nights as one table — the data goldens rollout step 4 is set from.
//
// The verdict comment on the bless PR is edited in place, so it shows only the latest night.
// Every run of `.github/workflows/golden-bless.yml` also uploads a `golden-bless` artifact
// (kept 90 days) holding that night's verdict.json and check.json. This fetches each one,
// replays rule 4 (which PRs a person merged showed which goldens), and prints one row per
// night with an empty column for a person's label: "would I have accepted this unseen?".
//
// Each row also scores the night's DELTA, the goldens the previous night did not already
// carry, because an unmerged bless PR carries every earlier night's goldens forward and one
// unseen golden then fails every later night (tools/lib/golden-bless-nights.mjs).
//
// Needs `gh` (REST only) and the git history back to the oldest window's start; a shallow
// clone gets it with `git fetch --filter=blob:none --shallow-since=<date> origin main`.
// Downloads and PR reads are cached under .scratch/golden-bless-nights/.
// Design: engineering/decisions/2026-10-06-goldens-bot-blessed.md §5 (step 4).
//
// Usage:
//   node tools/golden-bless-nights.mjs                 # every run with a verdict, as markdown
//   node tools/golden-bless-nights.mjs --since 2026-10-09
//   node tools/golden-bless-nights.mjs --json

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { nightRows, nightsMarkdown } from './lib/golden-bless-nights.mjs';
import { parseShownGoldens, prNumber, seenFromPrs } from './lib/golden-bless-verdict.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.scratch', 'golden-bless-nights');
const args = process.argv.slice(2);
const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : '';
const asJson = args.includes('--json');

const repo = process.env.GITHUB_REPOSITORY || 'Laticent/lattice';
const run = (cmd, a, opts = {}) => execFileSync(cmd, a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 << 20, ...opts });
// `gh pr view` goes through GraphQL, which some environments refuse; the REST API is enough.
const api = (path) => JSON.parse(run('gh', ['api', '--paginate', '--slurp', path])).flat();

mkdirSync(OUT, { recursive: true });
const prCacheFile = join(OUT, 'prs.json');
const prCache = existsSync(prCacheFile) ? JSON.parse(readFileSync(prCacheFile, 'utf8')) : {};

function pr(n) {
  if (!prCache[n]) {
    const [p] = api(`repos/${repo}/pulls/${n}`);
    const shown = api(`repos/${repo}/issues/${n}/comments?per_page=100`).map((c) => parseShownGoldens(c.body)).filter(Boolean);
    prCache[n] = {
      number: n,
      title: p.title,
      authorIsBot: p.user?.type === 'Bot' || /\[bot\]$/.test(p.user?.login || ''),
      shown: shown.length ? shown.at(-1) : null,
    };
  }
  return prCache[n];
}

// Rule 4's seen set for one night, as golden-bless.mjs builds it (prsSince + seenFromPrs).
function seenFor(windowFrom, renderedFrom) {
  if (!windowFrom) return null;
  const subjects = run('git', ['log', '--first-parent', '--format=%s', `${windowFrom}..${renderedFrom}`]).split('\n').filter(Boolean);
  return seenFromPrs(subjects.map(prNumber).filter(Boolean).map(pr));
}

function artifactFiles(runId) {
  const dir = join(OUT, String(runId));
  if (!existsSync(join(dir, 'verdict.json'))) {
    const art = api(`repos/${repo}/actions/runs/${runId}/artifacts`).flatMap((p) => p.artifacts || p).find((a) => a.name === 'golden-bless');
    if (!art || art.expired) return null;
    mkdirSync(dir, { recursive: true });
    // The zip comes from blob storage, which answers a busy 503 now and then: try three times.
    for (let attempt = 1; ; attempt += 1) {
      try {
        writeFileSync(join(dir, 'a.zip'), run('gh', ['api', `repos/${repo}/actions/artifacts/${art.id}/zip`], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] }));
        break;
      } catch (err) {
        if (attempt === 3) throw err;
        execFileSync('sleep', [String(5 * attempt)]);
      }
    }
    try {
      run('unzip', ['-qo', 'a.zip', 'verdict.json', 'check.json'], { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return null; // a run that crashed before scoring has no verdict
    }
  }
  if (!existsSync(join(dir, 'verdict.json')) || !existsSync(join(dir, 'check.json'))) return null;
  return {
    verdict: JSON.parse(readFileSync(join(dir, 'verdict.json'), 'utf8')),
    check: JSON.parse(readFileSync(join(dir, 'check.json'), 'utf8')),
  };
}

const runs = api(`repos/${repo}/actions/workflows/golden-bless.yml/runs?per_page=100`)
  .flatMap((p) => p.workflow_runs || p)
  .filter((r) => r.status === 'completed' && r.created_at.slice(0, 10) >= since)
  .sort((a, b) => a.created_at.localeCompare(b.created_at));

const nights = [];
for (const r of runs) {
  const files = artifactFiles(r.id);
  if (!files) continue;
  nights.push({
    date: r.created_at.slice(0, 10),
    runUrl: r.html_url,
    ...files,
    seen: seenFor(files.verdict.windowFrom, files.verdict.renderedFrom),
  });
}
writeFileSync(prCacheFile, JSON.stringify(prCache));

const rows = nightRows(nights);
if (asJson) {
  console.log(JSON.stringify(rows.map(({ rowsByGolden, ...r }) => r), null, 2));
} else {
  console.log(nightsMarkdown(rows));
}
