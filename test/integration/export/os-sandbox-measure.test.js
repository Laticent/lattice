/**
 * Integration: the OS sandbox layer is MEASURED on every platform the code door runs on (threat-model
 * note engineering/decisions/2026-10-16-npm-plugin-threat-model.md §6 decision 13, owner 2026-10-19).
 * Linux reads each renderer's seccomp mode, macOS asks `sandbox_check` for each renderer pid, and
 * Windows reads Chromium's `chrome://sandbox` page (lib/core/os-sandbox.js `rendererSandboxed`).
 *
 *   MEASURED  launchCodeSandbox's layer is never `unmeasured`; on macOS and Windows, whose CI runners
 *             start Chromium's sandbox, it reads `on`. (A Linux runner may read OFF: Ubuntu 24.04's
 *             AppArmor blocks it. That is a real reading, and the per-PR CI is that runner.)
 *   CONTROL   the same probe on a browser started with `--no-sandbox` reads `false`, so a probe that
 *             cannot see a missing sandbox fails here instead of reading `on` everywhere.
 *
 * Runs in the per-PR integration tier on Linux, and on real macOS and Windows runners as the
 * `os-sandbox-measure` platform suite (.github/platform-suites.json). When a reading fails, the
 * assertion prints what the probe saw, which is how a new Chromium's page or process layout shows up.
 *
 * Needs Chromium.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { launchCodeSandbox, rendererSandboxed } = require('../../../lib/core/os-sandbox.js');
const { launchSandboxBrowser } = require('../../../lib/core/code-sandbox.js');

const TIMEOUT = 180000;
const CHROME = process.env.CHROME_PATH || undefined;

test(`MEASURED: the code sandbox's OS layer is read, not assumed, on ${process.platform}`, { timeout: TIMEOUT }, async () => {
  const sandbox = await launchCodeSandbox(puppeteer, { executablePath: CHROME });
  try {
    const { layer } = sandbox;
    const diag = {};
    // Read again with the diagnostics on, so a failure says what the probe saw.
    // Read again with the diagnostics on, OFF included: when the launch itself measured OFF, this is what shows why.
    const again = await rendererSandboxed(sandbox.browser, sandbox.pid, process.platform, diag);
    assert.notEqual(layer.os, 'unmeasured', `the layer could not be measured here: ${layer.summary}; the probe saw ${JSON.stringify(diag.seen ?? [])}`);
    if (process.platform === 'darwin' || process.platform === 'win32') {
      assert.equal(layer.os, 'on', `${process.platform} runs Chromium's sandbox, and the layer read ${layer.os}: ${layer.summary}; tried ${layer.tried.join('; ')}; the probe saw ${JSON.stringify(diag.seen ?? [])}`);
      assert.equal(again, true, `the second read did not agree: the probe saw ${JSON.stringify(diag.seen ?? [])}`);
    }
  } finally {
    await sandbox.close();
  }
});

test(`CONTROL: on ${process.platform}, a browser started without the sandbox reads false`, { timeout: TIMEOUT }, async () => {
  const browser = await launchSandboxBrowser(puppeteer, { headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  try {
    const diag = {};
    const on = await rendererSandboxed(browser, browser.process()?.pid, process.platform, diag);
    assert.equal(on, false, `the probe did not see the missing sandbox; it saw ${JSON.stringify(diag.seen ?? [])}`);
  } finally {
    await browser.close();
  }
});

// TEMPORARY PROBE (not for merge; removed before the merge ask): on Windows only, ten fresh launches of 40 reads, printing
// every reading that needed a second read, so a real runner shows a starting renderer settle. Never fails; elsewhere it
// returns at once.
test(`PROBE: Windows settle, 10 launches x 40 reads`, { timeout: 1800000 }, async (t) => {
  if (process.platform !== 'win32') return;
  const tally = {};
  for (let launch = 0; launch < 10; launch++) {
    const sandbox = await launchCodeSandbox(puppeteer, { executablePath: CHROME });
    try {
      tally[`launch:${sandbox.layer.os}`] = (tally[`launch:${sandbox.layer.os}`] || 0) + 1;
      for (let i = 0; i < 40; i++) {
        const diag = {};
        const on = await rendererSandboxed(sandbox.browser, sandbox.pid, process.platform, diag);
        const reads = new Set((diag.seen ?? []).map((r) => /^read (\d+):/.exec(r)?.[1]).filter(Boolean)).size;
        tally[`${on}/${reads || 1}reads`] = (tally[`${on}/${reads || 1}reads`] || 0) + 1;
        if (on !== true || reads > 1) t.diagnostic(`launch ${launch} read ${i}: ${on} ${JSON.stringify(diag.seen ?? [])}`);
      }
    } finally {
      await sandbox.close();
    }
  }
  t.diagnostic(`tally ${JSON.stringify(tally)}`);
});
