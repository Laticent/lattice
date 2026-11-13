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
const os = require('node:os');
const path = require('node:path');

/** Best-effort Chromium path: an explicit env pin, else the puppeteer cache. */
function resolveChrome() {
  for (const env of ['CHROME_PATH', 'PUPPETEER_EXECUTABLE_PATH']) {
    if (process.env[env] && fs.existsSync(process.env[env])) return process.env[env];
  }
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
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

module.exports = { resolveChrome, skipWithoutChrome, skipUnlessCI, flag };
