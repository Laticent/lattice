/**
 * Which Chrome the CLI launches. ONE resolver, moved here from lattice-emulator.js so that
 * `lattice packages trust` measures the code sandbox's OS layer on the same browser the render
 * then runs a package in: the consent text described one browser while the render used another,
 * and a user approved "OS sandbox on" for a render that ran it off (the inversion lens).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** True when `p` is a regular file this process may execute — not a directory,
 *  not a non-executable file, not a dangling path. `fs.existsSync` alone answers
 *  none of those, and every one of them reaches puppeteer as `spawn … EACCES`. */
function isLaunchableBinary(p) {
  try {
    if (!fs.statSync(p).isFile()) return false;
    fs.accessSync(p, fs.constants.X_OK); // throws when it is not executable
    return true;
  } catch { return false; }
}

// ── Puppeteer config — chrome auto-detection ─────────────────────────────
// Both the diagram render worker and the PDF rasterize step drive puppeteer, which
// needs a Chrome binary; resolution order:
//   1. PUPPETEER_EXECUTABLE_PATH env var (explicit, unconditional override)
//   2. CHROME_PATH env var, if it names an executable file
//   3. puppeteer's bundled copy — under $HOME/.cache/puppeteer/chrome, under the
//      OS's own home directory (%USERPROFILE% on Windows, which sets no HOME), AND
//      under EVERY /home/<user>/.cache/puppeteer/chrome, newest build first,
//      regardless of what HOME says. Overriding HOME therefore does NOT isolate
//      this step. Only the build for this platform counts: chrome-linux64,
//      chrome-mac-arm64 / -x64, or chrome-win64.
//   4. system Chrome / Chromium (looked up via `which`)
// If none of these resolve, we omit executablePath and let puppeteer use
// its default (which may download a Chrome on first run).
//
// STEP 2 EXISTS BECAUSE EVERYTHING AROUND US ALREADY SETS `CHROME_PATH`, and until
// #2088 this function did not read it. The SessionStart hook exports it, AGENTS.md
// and engineering/gotchas/ci.md tell you to set it, test/helpers/chrome.js reads it
// first, and test/benchmark/engine-bench.mjs goes to the trouble of resolving a
// binary and passing it down as CHROME_PATH. None of that reached the renderer.
// It looked like it worked only because the value everyone sets is the same binary
// step 3 finds on its own — measured: `CHROME_PATH=/nonexistent/chrome` still
// rendered a deck fine, and, in the one case the docs were actually written for
// (no discoverable puppeteer cache), a correct `CHROME_PATH` still failed while
// `PUPPETEER_EXECUTABLE_PATH` to the same file rendered.
//
// The two steps are deliberately NOT symmetric. Step 1 stays unconditional: an
// explicit pin that has gone missing must fail loudly, not silently render on some
// other browser — .github/workflows/overflow-nightly.yml pins a specific Chromium
// precisely so its baseline stays comparable. Step 2 falls through instead, so a
// stale or decorative CHROME_PATH lands on the cache scan exactly as it did before
// this change rather than becoming a new render failure.
//
// "Falls through" has to mean more than `existsSync`, and the first draft of this
// got it wrong. A path can exist and still not be a browser: `/Applications/Google
// Chrome.app` is a DIRECTORY, and a non-executable file is just as unlaunchable.
// Both passed `existsSync`, and both then died in puppeteer with `spawn … EACCES`
// on renders that had worked the day before — a regression manufactured by the very
// guard meant to prevent one. isFile + X_OK is what the sentence above actually
// promises.
/** Where each platform's build sits inside one puppeteer cache folder (`<cache>/chrome/<build>/…`). */
const CACHE_LAYOUTS = Object.freeze({
  linux: [['chrome-linux64', 'chrome']],
  darwin: [
    ['chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
    ['chrome-mac-x64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'],
  ],
  win32: [['chrome-win64', 'chrome.exe']],
});

/**
 * Every puppeteer-cache browser under these homes that THIS platform can run. Only this platform's
 * layout: a cache that also holds another platform's build (a synced or shared cache) must not hand
 * Linux a `chrome.exe`, and `win64-…` sorts after `linux-…` (the checker).
 */
function puppeteerCacheBrowsers(homes, platform = process.platform) {
  const candidates = [];
  const layouts = CACHE_LAYOUTS[platform] || [];
  for (const h of homes) {
    const cacheRoot = path.join(h, '.cache', 'puppeteer', 'chrome');
    if (!fs.existsSync(cacheRoot)) continue;
    try {
      for (const dir of fs.readdirSync(cacheRoot)) {
        for (const parts of layouts) {
          const bin = path.join(cacheRoot, dir, ...parts);
          if (fs.existsSync(bin)) candidates.push(bin);
        }
      }
    } catch (_e) { /* skip unreadable */ }
  }
  return candidates;
}

/** The homes whose puppeteer cache is read, own first: HOME, USERPROFILE (Windows sets no HOME), the OS's answer. */
function ownHomes(env = process.env, homedir = os.homedir) {
  const homes = [];
  let own = '';
  try { own = homedir(); } catch (_e) { /* no home for this uid */ }
  for (const h of [env.HOME, env.USERPROFILE, own]) {
    if (h && !homes.includes(h)) homes.push(h);
  }
  return homes;
}

// WINDOWS READ ONLY $HOME UNTIL #2459's probe. Windows sets USERPROFILE, not HOME, and the
// candidate list had no chrome-win64, so every Windows render printed "No Chrome binary
// detected" and then rendered on the very binary puppeteer's default found in that cache.
function detectChromeExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  if (process.env.CHROME_PATH && isLaunchableBinary(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  // Look in known puppeteer cache locations across users.
  const possibleHomes = ownHomes();
  // Many systems store puppeteer cache under /home/<user>/.cache/puppeteer
  // even when the script runs as a different user. Check common locations.
  try {
    if (fs.existsSync('/home')) {
      for (const u of fs.readdirSync('/home')) {
        const h = path.join('/home', u);
        if (!possibleHomes.includes(h)) possibleHomes.push(h);
      }
    }
  } catch (_e) { /* ignore */ }
  const candidates = puppeteerCacheBrowsers(possibleHomes);
  if (candidates.length > 0) {
    return candidates.sort().reverse()[0];
  }
  // Fall back to system chrome/chromium via PATH lookup.
  const systemBins = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  for (const bin of systemBins) {
    try {
      const which = require('child_process')
        .execSync(`which ${bin}`, { stdio: ['pipe', 'pipe', 'ignore'] })
        .toString().trim();
      if (which) return which;
    } catch (_e) { /* not found, try next */ }
  }
  return null;
}


module.exports = { detectChromeExecutable, isLaunchableBinary, ownHomes, puppeteerCacheBrowsers };
