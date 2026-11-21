/**
 * Every CI job that restores puppeteer's browser cache installs Chrome by name after `npm ci`.
 *
 * Why: puppeteer's postinstall catches a failed Chrome download, prints "ERROR: Failed to set up chrome" and
 * exits 0, and npm hides a passing script's output. On a cold `~/.cache/puppeteer` a failed download left a
 * green `npm ci` and no browser; integration shard 4/4 of run 43974960155 then failed 41 tests and canceled 186
 * with "Could not find Chrome", while shards 1-3 on the same cache miss downloaded fine.
 * .github/actions/puppeteer-chrome runs `puppeteer browsers install chrome`, which exits 1 on a failure, so the
 * job goes red at a step that names the cause.
 *
 * The contract: in every workflow job, a step that caches `~/.cache/puppeteer` implies a
 * `uses: ./.github/actions/puppeteer-chrome` step AFTER the job's root `npm ci` (not `npm ci --prefix …`, not a
 * `working-directory:` one) and BEFORE any step that resolves or launches the browser, which in these jobs all
 * come after it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const WORKFLOWS = path.join(ROOT, '.github', 'workflows');
const ACTION = './.github/actions/puppeteer-chrome';

const isPuppeteerCache = (s) =>
  typeof s.uses === 'string' && s.uses.startsWith('actions/cache') && /~\/\.cache\/puppeteer\b/.test(String(s.with?.path ?? ''));

// The root install: `npm ci` with no --prefix and no working-directory, whatever its flags.
const isRootNpmCi = (s) =>
  typeof s.run === 'string' && !s['working-directory'] && /^\s*npm ci(\s|$)/m.test(s.run) && !/--prefix/.test(s.run);

const isChromeStep = (s) => s.uses === ACTION;

/** Every job of every workflow, with its steps. */
function jobs() {
  const out = [];
  for (const file of fs.readdirSync(WORKFLOWS).filter((f) => /\.ya?ml$/.test(f)).sort()) {
    const doc = YAML.parse(fs.readFileSync(path.join(WORKFLOWS, file), 'utf8'));
    for (const [id, job] of Object.entries(doc?.jobs ?? {})) {
      if (Array.isArray(job?.steps)) out.push({ where: `${file}::${id}`, steps: job.steps });
    }
  }
  return out;
}

/** A problem with one job's steps, or null when it keeps the contract. */
function violation(steps) {
  if (!steps.some(isPuppeteerCache)) return null;
  const ci = steps.findIndex(isRootNpmCi);
  const chrome = steps.findIndex(isChromeStep);
  if (ci < 0) return 'restores the puppeteer cache but has no root `npm ci` to follow';
  if (chrome < 0) return `restores the puppeteer cache but never runs ${ACTION}`;
  if (chrome < ci) return `runs ${ACTION} before the root \`npm ci\` that installs puppeteer`;
  return null;
}

test('every job that restores ~/.cache/puppeteer installs Chrome by name after npm ci', () => {
  const covered = jobs().filter((j) => j.steps.some(isPuppeteerCache));
  // Today: ci.yml's integration, golden-diff and player-webkit, plus seven scheduled workflows. A floor, so a parse
  // that finds nothing cannot pass vacuously.
  assert.ok(covered.length >= 10, `expected at least 10 jobs that cache puppeteer, found ${covered.length}`);
  const bad = covered.map((j) => [j.where, violation(j.steps)]).filter(([, v]) => v);
  assert.deepEqual(bad, [], bad.map(([w, v]) => `${w}: ${v}`).join('\n'));
});

test('the check rejects a job that drops the step or runs it too early', () => {
  const cache = { uses: 'actions/cache@v4', with: { path: '~/.cache/puppeteer', key: 'k' } };
  const ci = { run: 'npm ci' };
  const chrome = { uses: ACTION };
  assert.equal(violation([cache, ci, chrome]), null);
  assert.match(violation([cache, ci]), /never runs/);
  assert.match(violation([cache, chrome, ci]), /before the root/);
  // A docs-folder install does not count as the root one.
  assert.match(violation([cache, { run: 'npm ci --prefix docs' }, chrome]), /no root/);
  assert.match(violation([cache, { run: 'npm ci', 'working-directory': 'docs' }, chrome]), /no root/);
  // A job without the cache owes nothing.
  assert.equal(violation([ci]), null);
});

test('the action fails its step when the download fails, and tries three times', () => {
  const action = YAML.parse(fs.readFileSync(path.join(ROOT, '.github', 'actions', 'puppeteer-chrome', 'action.yml'), 'utf8'));
  const run = action.runs.steps.map((s) => s.run ?? '').join('\n');
  assert.equal(action.runs.using, 'composite');
  assert.match(run, /npx --no-install puppeteer browsers install chrome/);
  assert.match(run, /for try in 1 2 3/);
  // The step must NAME the cause, not only go red: the warning per retry and the error that says what failed.
  assert.match(run, /::warning::Chrome download failed \(try \$try of 3\)/);
  assert.match(run, /::error::puppeteer could not download its Chrome/);
  assert.match(run, /exit 1\s*$/);
});

test('the self-test proves the action fails on a real runner of each OS, and runs when the action changes', () => {
  const wf = YAML.parse(fs.readFileSync(path.join(WORKFLOWS, 'puppeteer-chrome-selftest.yml'), 'utf8'));
  assert.ok(wf.on.pull_request.paths.includes('.github/actions/puppeteer-chrome/**'), 'runs when the action changes');
  const job = wf.jobs['fails-by-name'];
  assert.deepEqual(job.strategy.matrix.os.map((o) => o.split('-')[0]).sort(), ['macos', 'ubuntu', 'windows']);
  const steps = job.steps;
  const chrome = steps.findIndex(isChromeStep);
  assert.ok(chrome >= 0, `the self-test runs ${ACTION}`);
  assert.equal(steps[chrome]['continue-on-error'], true, 'its failure is the expected result, read by the next step');
  const unwritable = steps.findIndex((s) => /PUPPETEER_CACHE_DIR=/.test(s.run ?? ''));
  assert.ok(unwritable >= 0 && unwritable < chrome, 'the cache is made unwritable before the action runs');
  const verdict = steps.slice(chrome + 1).map((s) => `${JSON.stringify(s.env ?? {})}\n${s.run ?? ''}`).join('\n');
  assert.match(verdict, /steps\.chrome\.outcome/);
  assert.match(verdict, /!= "failure"[\s\S]*exit 1/, 'the job goes red when the action does not fail');
});
