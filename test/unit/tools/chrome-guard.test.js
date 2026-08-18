/**
 * `skipWithoutChrome` decides whether a render-backed suite runs, skips, or fails — and it
 * got that wrong in CI once already, in both directions.
 *
 * First it guarded on `CHROME_PATH || PUPPETEER_EXECUTABLE_PATH`, which no CI job here
 * exports; three browser suites written for #1674 skipped on every scheduled run while
 * reading as green. The fix — "under CI, never skip" — then failed the render-free `unit`
 * job, which sets `PUPPETEER_SKIP_DOWNLOAD=1` precisely to say it has no browser and wants
 * none.
 *
 * The rule has three branches and a real job depends on each, so they are asserted
 * directly rather than through a suite that happens to have a browser on hand.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { skipWithoutChrome } = require('../../helpers/chrome.js');

/** Run `fn` with exactly these env vars set and every other relevant one cleared. */
function withEnv(vars, fn) {
  const keys = ['CI', 'PUPPETEER_SKIP_DOWNLOAD'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    for (const [k, v] of Object.entries(vars)) process.env[k] = v;
    return fn();
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

describe('skipWithoutChrome', () => {
  test('a browser means run, in every environment', () => {
    for (const env of [{}, { CI: 'true' }, { PUPPETEER_SKIP_DOWNLOAD: '1' }]) {
      assert.equal(withEnv(env, () => skipWithoutChrome('/path/to/chrome')), false);
    }
  });

  test('no browser in a job that declared itself render-free is a SKIP', () => {
    // ci.yml's `lint` and `unit` jobs set this so `npm ci` does not fetch ~150 MB of
    // Chromium. Failing there would break a job that is correct as written.
    const answer = withEnv({ CI: 'true', PUPPETEER_SKIP_DOWNLOAD: '1' }, () => skipWithoutChrome(undefined));
    assert.equal(typeof answer, 'string', 'must skip, not run');
    assert.match(answer, /render-free/);
  });

  test('no browser in a CI job that expects one is a FAILURE, not a skip', () => {
    // integration-nightly does not set PUPPETEER_SKIP_DOWNLOAD — it caches and installs a
    // browser. If one is missing there, the suite must run and die on the launch: a
    // skipped suite reports `ok` with `skipped: 0`, so silence is indistinguishable from
    // success and the gate stops being a gate.
    assert.equal(withEnv({ CI: 'true' }, () => skipWithoutChrome(undefined)), false);
  });

  test('no browser on a developer machine is a SKIP', () => {
    const answer = withEnv({}, () => skipWithoutChrome(undefined));
    assert.equal(typeof answer, 'string');
    assert.match(answer, /no Chromium/);
  });
});
