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

// HELD PROFILE: the profile removal survives a file Windows still holds (#3276). On Windows, Chromium's helper
// processes can hold `Default/Cache/Cache_Data/sqldb0` for a moment after the browser exits, and a single
// `fs.rmSync` threw EBUSY (platform-suites run 44011046237). Here a PowerShell child opens that file with no sharing,
// the way Chromium's cache does, says `locked`, and lets go about a second later. While it holds the file, a bare
// `rmSync` must fail; that proves the lock is real. `removeProfile` must then remove the folder. Only Windows can hold
// a file against deletion, so elsewhere this checks only that the folder goes.
test(`HELD PROFILE: removeProfile outlasts a file held open on ${process.platform}`, { timeout: TIMEOUT }, async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawn } = require('node:child_process');
  const { removeProfile } = require('../../../lib/core/os-sandbox.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-code-sandbox-'));
  const file = path.join(dir, 'Default', 'Cache', 'Cache_Data', 'sqldb0');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'cache');
  if (process.platform !== 'win32') {
    removeProfile(dir);
    assert.equal(fs.existsSync(dir), false);
    return;
  }
  const script = `$f = [System.IO.File]::Open($env:HELD, 'Open', 'ReadWrite', 'None'); [Console]::Out.WriteLine('locked'); [Console]::Out.Flush(); Start-Sleep -Milliseconds 1200; $f.Close()`;
  const holder = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, HELD: file }, stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = new Promise((resolve) => holder.once('exit', resolve));
  // The signal, not a duration: go on once the child says it holds the file.
  await new Promise((resolve, reject) => {
    let out = '';
    holder.stdout.on('data', (d) => {
      out += d;
      if (out.includes('locked')) resolve();
    });
    holder.once('exit', (code) => reject(new Error(`the holder exited (${code}) before it locked the file`)));
  });
  try {
    assert.throws(() => fs.rmSync(dir, { recursive: true, force: true }), (e) => ['EBUSY', 'EPERM'].includes(e.code), 'a bare rmSync removed a folder whose file is held: the lock is not real, so this test proves nothing');
    removeProfile(dir);
    assert.equal(fs.existsSync(dir), false, 'removeProfile left the folder behind');
  } finally {
    await exited;
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
