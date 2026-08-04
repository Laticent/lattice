/**
 * resolve-chrome.js — find a Chromium binary to drive, or say you can't.
 *
 * ONE probe, shared by every render-aware tool and test. It replaced nine
 * hand-copied bodies under two names (`resolveChrome` / `chromePath`) that had
 * drifted apart (#1327): the copy in check-geometry-parity.js shelled out to
 * `bash -lc 'ls /root/.cache/puppeteer/…'`, which hard-coded root's home and so
 * could never resolve on a GitHub runner or a developer laptop — while its eight
 * siblings probed `$HOME` first with `fs` directly. The cost of that spread was
 * that a portability fix had to be found and applied nine times, and nobody
 * could say which tools were portable without reading all nine.
 *
 * CONTRACT — returns a path string, or `undefined`. It NEVER throws and never
 * exits. Every caller owns its own "skips loudly with no Chromium" message,
 * because what to do without a browser differs: a gate skips, a build fails, a
 * test calls `t.skip()`. Returning a sentinel keeps that decision at the call
 * site instead of baking one policy in here.
 *
 * ORDER — `CHROME_PATH` first (the SessionStart hook exports it, and an explicit
 * request should always win), then puppeteer's own download cache under `$HOME`,
 * then the sandbox's `/root` cache for the case where the tool runs as a user
 * whose `$HOME` is not root's.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/**
 * Puppeteer's cache layout is `<root>/<platform>-<version>/<dir>/<binary>`, and
 * the platform prefix and binary path differ per OS. Every one of the nine
 * bodies this replaces knew only the `linux-` shape, so all nine silently
 * resolved nothing on macOS and Windows and fell through to whatever puppeteer
 * guessed. Ordered most- to least-specific per platform so an arm64 Mac does not
 * match the x64 entry.
 */
const LAYOUTS = {
  linux: [{ prefix: 'linux-', bin: ['chrome-linux64', 'chrome'] }],
  darwin: [
    { prefix: 'mac_arm-', bin: ['chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'] },
    { prefix: 'mac-', bin: ['chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'] },
  ],
  win32: [
    { prefix: 'win64-', bin: ['chrome-win64', 'chrome.exe'] },
    { prefix: 'win32-', bin: ['chrome-win32', 'chrome.exe'] },
  ],
};

/**
 * Newest build first. The nine originals used a bare lexical `.sort().reverse()`,
 * which orders `linux-99.0.4844.51` ABOVE `linux-131.0.6778.204` — a latent
 * wrong-binary pick that only stayed invisible because this sandbox installs
 * exactly one build. Numeric-aware collation compares 131 to 99 as numbers.
 */
const byVersionDesc = (a, b) => b.localeCompare(a, undefined, { numeric: true });

/**
 * @param {object} [opts]
 * @param {string} [opts.platform] - override `process.platform` (for tests).
 * @param {string[]} [opts.roots]  - override the cache roots (for tests).
 * @param {string|undefined} [opts.env] - override `CHROME_PATH` (for tests).
 * @returns {string|undefined} an existing Chromium binary, or undefined.
 */
function resolveChrome(opts = {}) {
  const env = 'env' in opts ? opts.env : process.env.CHROME_PATH;
  // Existence-checked rather than trusted: a stale exported CHROME_PATH left
  // over from a deleted cache should fall through to a real binary, not hand
  // puppeteer a path that cannot launch.
  if (env && fs.existsSync(env)) return env;

  const platform = opts.platform || process.platform;
  const layouts = LAYOUTS[platform] || LAYOUTS.linux;
  const roots = opts.roots || [
    path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'),
    '/root/.cache/puppeteer/chrome',
  ];

  for (const root of roots) {
    let entries;
    // readdir can throw on a race or a permission problem; a browser probe must
    // not take the caller down with it.
    try {
      if (!fs.existsSync(root)) continue;
      entries = fs.readdirSync(root);
    } catch { continue; }
    for (const { prefix, bin } of layouts) {
      for (const build of entries.filter((d) => d.startsWith(prefix)).sort(byVersionDesc)) {
        const exe = path.join(root, build, ...bin);
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  return undefined;
}

module.exports = { resolveChrome };
