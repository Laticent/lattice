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
 * needs a four-minute render to reproduce.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'lattice.js'), 'utf8');

test('the render launch sets a protocolTimeout above the PDF writer watchdog', () => {
  const launch = src.match(/const launchOpts = \{[\s\S]*?\n  \};/);
  assert.ok(launch, 'renderExport builds launchOpts');
  assert.match(launch[0], /protocolTimeout:\s*PROTOCOL_TIMEOUT_MS/);
  const ms = Number(src.match(/const PROTOCOL_TIMEOUT_MS = ([\d_]+);/)?.[1]);
  assert.ok(ms > 180000, 'above puppeteer default');
  // The writer's watchdog is max(RENDER_WATCHDOG_MS, slides x 4000): a 500-slide deck is 2000 s.
  assert.ok(ms >= 500 * 4000, 'covers the writer watchdog for a 500-slide deck');
});
