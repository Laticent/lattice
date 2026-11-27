/**
 * One Chromium resolver for the render-backed test tiers.
 *
 * TWO things were wrong with resolving the browser inline, and both let a gate go
 * quiet without anyone noticing:
 *
 *  1. `process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || null` is
 *     not "is there a browser". CI's integration jobs never export either variable —
 *     they let `npm ci` populate `~/.cache/puppeteer` and let puppeteer find its own
 *     download. A suite guarded on the env var therefore SKIPPED on every scheduled
 *     run while reading as green, which is how three gates written for #1674 were
 *     merged into a workflow that never executed one of them.
 *  2. `node --test` reports a skipped suite as `ok` with `skipped: 0` at the file
 *     level, so no log scan finds it either. A gate that cannot fail is not a gate.
 *
 * So: resolve the way `tools/screenshot.js` does (explicit path, then the puppeteer
 * cache), and in CI treat "no browser at all" as a FAILURE rather than a skip — a
 * scheduled runner that lost its Chromium is an infrastructure regression the job
 * should shout about, not swallow.
 */

const fs = require('node:fs');

/** Best-effort Chromium path: an explicit env pin, else the puppeteer cache. */
function resolveChrome() {
  for (const env of ['CHROME_PATH', 'PUPPETEER_EXECUTABLE_PATH']) {
    if (process.env[env] && fs.existsSync(process.env[env])) return process.env[env];
  }
  // The puppeteer cache, in every platform's layout (lib/core/chrome-exec.js owns the layouts), newest build first.
  const { ownHomes, puppeteerCacheBrowsers } = require('../../lib/core/chrome-exec.js');
  const found = puppeteerCacheBrowsers([...new Set([...ownHomes(), '/root'])]).sort().reverse();
  if (found.length) return found[0];
  // No call to puppeteer's own resolver here: from puppeteer 24 on `executablePath()` returns a
  // Promise, and this resolver has to stay synchronous for `describe(…, { skip })`. The cache scan
  // above is where that resolver looks by default.
  return undefined;
}

/**
 * The `skip` value for a `describe(…, { skip })` on a render-backed suite.
 *
 * `false` when a browser is available — the ordinary case, here and on any CI job that
 * expects one.
 *
 * With no browser the answer depends on whether one was SUPPOSED to be there:
 *
 *  - `PUPPETEER_SKIP_DOWNLOAD` set → the job declared itself render-free and told
 *    `npm ci` not to fetch Chromium. ci.yml's `lint` and `unit` jobs both set it, on
 *    purpose: the unit tier is contractually browser-free. Skip, with the reason.
 *  - otherwise under `CI` → a job that was meant to have a browser and does not. That is
 *    an infrastructure regression, and the whole point of this helper is that it must not
 *    vanish into a green run — so return `false` and let the launch fail loudly.
 *  - otherwise → a developer machine without one. Skip; not everyone renders.
 *
 * The first branch is not a loophole, it is the same declaration read from both ends: the
 * workflow states "no browser here" in the env, and the suite believes it. A job that
 * wants these gates simply does not set the variable — which is exactly what
 * integration-nightly does.
 */
/** An env flag that is set to something other than '', '0' or 'false' (so `CI=false` and `PUPPETEER_SKIP_DOWNLOAD=0` read as unset). */
function flag(name) {
  const v = process.env[name];
  return v !== undefined && v !== '' && v !== '0' && v.toLowerCase() !== 'false';
}

function skipWithoutChrome(chrome) {
  if (chrome) return false;
  if (flag('PUPPETEER_SKIP_DOWNLOAD')) return 'render-free job (PUPPETEER_SKIP_DOWNLOAD)';
  if (flag('CI')) return false;
  return 'no Chromium (CHROME_PATH / puppeteer cache)';
}

/**
 * The general form, for any tool or build output a test needs (HARD RULE #33): `{ skip: skipUnlessCI(!built, 'dist/
 * is not built') }`. On a laptop a missing prerequisite skips with the reason; under CI it returns false, so the test
 * runs and fails loudly, because a CI job that lost its tool must not read as green. A prerequisite that CI genuinely
 * never has belongs in a `// ci-skip: <which job runs it instead>` note, not here.
 */
function skipUnlessCI(missing, reason) {
  if (!missing) return false;
  if (flag('CI')) return false;
  return reason;
}

/**
 * What the machine looked like when a Chrome launch failed, as one line of `key=value` pairs.
 *
 * Why it exists: `calco-chips.test.js` once failed in its `before` hook with puppeteer's "Timed out after
 * 30000 ms while waiting for the WS endpoint URL", under a loaded run, and the hunt for the cause
 * (engineering/decisions/2026-11-27-shared-chrome-for-tests.md, and PR #3577) could not reproduce it in
 * 4,469 timed launches. Puppeteer's error says only that the endpoint never appeared. This records the
 * state a cause would leave a trace in: how long the launch waited, load, free memory, how many Chrome
 * processes were alive, and free space where puppeteer writes its temp profile.
 *
 * Every field is best effort: a reading that fails on this platform is left out, never thrown.
 */
function launchDiagnostics(elapsedMs) {
  const os = require('node:os');
  const parts = [`waited=${Math.round(elapsedMs)}ms`];
  const tryAdd = (fn) => {
    try {
      const v = fn();
      if (v) parts.push(v);
    } catch {}
  };
  tryAdd(() => `load=${os.loadavg().map((n) => n.toFixed(2)).join('/')} cpus=${os.cpus().length}`);
  tryAdd(() => `mem_free=${Math.round(os.freemem() / 2 ** 20)}MiB/${Math.round(os.totalmem() / 2 ** 20)}MiB`);
  tryAdd(() => {
    let n = 0;
    for (const d of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(d)) continue;
      try {
        if (/chrom/i.test(fs.readFileSync(`/proc/${d}/comm`, 'utf8'))) n++;
      } catch {}
    }
    return `chrome_procs=${n}`;
  });
  tryAdd(() => {
    const st = fs.statfsSync(os.tmpdir());
    return `tmp_free=${Math.round((st.bavail * st.bsize) / 2 ** 20)}MiB`;
  });
  return `launch diagnostics: ${parts.join(' ')}`;
}

/**
 * `puppeteer.launch(opts)`, and on failure the same error with `launchDiagnostics` appended to its
 * message. It adds no retry and no timeout of its own (HARD RULE #33): it changes what a failure says,
 * never whether one happens.
 */
async function launchOrExplain(puppeteer, opts) {
  const t0 = process.hrtime.bigint();
  try {
    return await puppeteer.launch(opts);
  } catch (e) {
    const note = launchDiagnostics(Number(process.hrtime.bigint() - t0) / 1e6);
    if (e && typeof e === 'object' && typeof e.message === 'string') {
      e.message = `${e.message}\n${note}`;
      throw e;
    }
    throw new Error(`${String(e)}\n${note}`);
  }
}

module.exports = { resolveChrome, skipWithoutChrome, skipUnlessCI, flag, launchDiagnostics, launchOrExplain };
