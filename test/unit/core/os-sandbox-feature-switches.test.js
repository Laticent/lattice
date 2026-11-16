/**
 * The hand-built code-sandbox launch (lib/core/os-sandbox.js `launchAsUser`) keeps puppeteer's feature switches.
 *
 * Chromium honors only the LAST `--disable-features`, so appending SANDBOX_LAUNCH_ARGS to puppeteer's defaults
 * silently re-enabled everything puppeteer turns off, `IsolateSandboxedIframes` among them. The package's sandboxed
 * frame then ran out of process, and puppeteer 23 lost its context: 23 of 40 opens under a 12-thread CPU burn in the first
 * measurement, 24 of 60 in the control run beside the fix (0 of 60 with it), and the code-package-door failures.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { mergeFeatureSwitches } = require('../../../lib/core/os-sandbox.js');
const { SANDBOX_LAUNCH_ARGS } = require('../../../lib/core/code-sandbox.js');

const switches = (args, name) => args.filter((a) => a.startsWith(`${name}=`));
const features = (args, name) => switches(args, name).flatMap((a) => a.slice(name.length + 1).split(','));

test('one switch each, holding every feature from every copy, in order', () => {
  const out = mergeFeatureSwitches(['--a', '--disable-features=X,Y', '--enable-features=E', '--b', '--disable-features=Y,Z', 'about:blank']);
  assert.deepEqual(out, ['--a', '--disable-features=X,Y,Z', '--enable-features=E', '--b', 'about:blank']);
});

test('arguments without a feature switch pass through untouched', () => {
  const args = ['--headless', '--no-first-run', 'about:blank'];
  assert.deepEqual(mergeFeatureSwitches(args), args);
});

test("the sandbox launch keeps puppeteer's disabled features, IsolateSandboxedIframes included, and adds its own", async () => {
  // `defaultArgs` returns a Promise from puppeteer 24 on, as `launchAsUser` awaits it.
  const defaults = await puppeteer.defaultArgs({ headless: true });
  const merged = mergeFeatureSwitches([...defaults, ...SANDBOX_LAUNCH_ARGS]);
  assert.equal(switches(merged, '--disable-features').length, 1, 'Chromium reads only the last copy, so there must be one');
  const off = features(merged, '--disable-features');
  for (const f of [...features(defaults, '--disable-features'), ...features([...SANDBOX_LAUNCH_ARGS], '--disable-features')]) {
    assert.ok(off.includes(f), `${f} stays disabled`);
  }
  assert.ok(off.includes('IsolateSandboxedIframes'));
  // The arm: the unmerged list's LAST switch, the one Chromium honors, drops puppeteer's list.
  const raw = [...defaults, ...SANDBOX_LAUNCH_ARGS];
  assert.ok(!switches(raw, '--disable-features').at(-1).includes('IsolateSandboxedIframes'));
});
