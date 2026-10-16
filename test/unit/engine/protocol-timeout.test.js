/**
 * Unit: lattice.js lets the PDF writer finish before puppeteer gives up on it.
 *
 * Puppeteer's own per-call limit (`protocolTimeout`) is 180 s. `composePdfInPage` runs
 * the whole shared PDF writer inside ONE `page.evaluate`, with its own watchdog of
 * slides x 4 s. On a deck big enough to compose in more than 180 s (themes/palette-audit.md,
 * 151 slides, ~4 minutes) puppeteer's limit fired first, the writer was abandoned and
 * Chrome printed the deck instead: Type 3 fonts, a different PDF. Whether that happened
 * depended on machine speed, so one commit rendered two ways in the nightly golden bless.
 *
 * Pinned from the source because lattice.js is a script, not a module, and the failure
 * needs a four-minute render to reproduce. The numbers are read from the source, so a
 * change to the per-slide budget moves the check with it.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'lattice.js'), 'utf8');

test('the render launch passes protocolTimeout, and nothing overrides it', () => {
  const launch = src.match(/const launchOpts = \{[\s\S]*?\n  \};/);
  assert.ok(launch, 'renderExport builds launchOpts');
  assert.match(launch[0], /protocolTimeout:\s*PROTOCOL_TIMEOUT_MS/);
  assert.equal(src.match(/launchOpts\.protocolTimeout\s*=/g), null, 'no later reassignment');
  assert.equal(src.match(/\.\.\.launchOpts/g), null, 'no spread that could override it');
});

test('the ceiling sits above the compose watchdog, which is capped under it', () => {
  const ceiling = src.match(/const PROTOCOL_TIMEOUT_MS = Math\.max\((\d+), RENDER_WATCHDOG_MS \+ (\d+)\);/);
  assert.ok(ceiling, 'ceiling is derived from the guard');
  assert.ok(Number(ceiling[1]) > 180000, 'above puppeteer default');
  assert.match(src, /const COMPOSE_MAX_MS = PROTOCOL_TIMEOUT_MS - \d+;/);
  assert.match(src, /const composeMs = Math\.min\(COMPOSE_MAX_MS, Math\.max\(RENDER_WATCHDOG_MS, handles\.length \* (\d+)\)\);/);
  // An ordinary large deck's watchdog must fit under the hour: 500 slides at the source's per-slide budget.
  const perSlide = Number(src.match(/handles\.length \* (\d+)\)\);/)[1]);
  assert.ok(500 * perSlide <= Number(ceiling[1]) - 60000, '500 slides fit under the ceiling');
});

test('the evaluates around the PDF writer are guarded, not left to protocolTimeout', () => {
  const body = src.slice(src.indexOf('async function composePdfInPage'));
  const fn = body.slice(0, body.indexOf('\n}\n'));
  const bare = fn.match(/^\s*await page\.evaluate\(/gm);
  assert.equal(bare, null, 'every page.evaluate in composePdfInPage goes through g()');
});
