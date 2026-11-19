/**
 * A stand-in for lib/packages/code-door-worker.js that launches the real code sandbox the same way (launchCodeSandbox
 * with an `onLaunch` that writes the state file the host reaps from), opens a page so the renderer and the other helper
 * processes exist, says `ready` on stdout, and then waits to be killed. `REAPED` in
 * test/integration/export/os-sandbox-measure.test.js kills it mid-render and calls the host's `reap()`.
 *
 * argv[2]: the state file.
 */
const fs = require('node:fs');
const puppeteer = require('puppeteer');
const { launchCodeSandbox } = require('../../lib/core/os-sandbox.js');

(async () => {
  const launched = [];
  const onLaunch = ({ pid, dir }) => {
    launched.push({ pid, dir });
    fs.writeFileSync(process.argv[2], JSON.stringify(launched));
  };
  const sandbox = await launchCodeSandbox(puppeteer, { executablePath: process.env.CHROME_PATH || undefined, onLaunch });
  const page = await sandbox.browser.newPage();
  await page.setContent('<p>mid-render</p>');
  process.stdout.write('ready\n');
  // Hold the event loop open until the test kills this process.
  setInterval(() => {}, 1 << 30);
})().catch((e) => {
  process.stdout.write(`fatal ${e.message}\n`);
  process.exit(1);
});
