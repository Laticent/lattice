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
  // Last resort: puppeteer's own resolver. It throws when nothing is installed.
  try {
    const p = require('puppeteer').executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch { /* no browser */ }
  return undefined;
}

/**
 * The `skip` value for a `describe(…, { skip })` on a render-backed suite.
 *
 * `false` when a browser is available. On a developer machine without one, a reason
 * string (skip locally — not everyone renders). Under CI, `false` even with no
 * browser, so the suite runs and fails on the launch instead of vanishing.
 */
function skipWithoutChrome(chrome) {
  if (chrome) return false;
  if (process.env.CI) return false;
  return 'no Chromium (CHROME_PATH / puppeteer cache)';
}

module.exports = { resolveChrome, skipWithoutChrome };
