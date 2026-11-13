/**
 * THE PHONE PAGE'S SPACING STEPS ARE THE CSS's, NOT A COPY THAT CAN DRIFT.
 *
 * shared/chart-phone.js `PHONE_STEPS` holds `--sp-md` and `--sp-sm` in page px at mobile, story, 4:5 and square, and
 * the stacked-height estimates of kanban, roadmap, journey and timeline add them up to decide whether a chart fits a
 * page or splits. They were measured in Chromium once. This recomputes each one from its sources: the token's
 * coefficient of the slide's 1% (lib/base/base.tokens.css), the 1% of a 1080-wide page, and the page's
 * `--canvas-scale` (lib/adaptive/families.js `canvasScaleFor`). A change to either moves the estimate, and this fails.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { phoneSteps } = require('../../../lib/plugins/chart-family/shared/chart-phone.js');
const { canvasScaleFor } = require('../../../lib/adaptive/families.js');

const TOKENS = readFileSync(join(__dirname, '..', '..', '..', 'lib', 'base', 'base.tokens.css'), 'utf8');
/** The coefficient of `--sp-<step>` in units of the slide's 1%, read from its declaration. */
function coefficient(step) {
  const decl = TOKENS.split('\n').find((l) => l.trim().startsWith(`--sp-${step}:`));
  assert.ok(decl, `--sp-${step} is declared in base.tokens.css`);
  assert.ok(decl.includes('_sec-1cqi') && decl.includes('--canvas-scale'), `--sp-${step} is still sized by the slide's 1% and the canvas scale: ${decl.trim()}`);
  return Number(decl.split('calc(')[1].trim().split(/\s/)[0]);
}

test('PHONE_STEPS equals --sp-md and --sp-sm at every phone page shape', () => {
  const md = coefficient('md');
  const sm = coefficient('sm');
  const pagePct = 1080 / 100;
  for (const [name, h] of [['mobile', 2340], ['story', 1920], ['4:5', 1350], ['square', 1080]]) {
    const aspect = 1080 / h;
    const scale = canvasScaleFor(aspect);
    const [gotMd, gotSm] = phoneSteps(aspect);
    assert.ok(Math.abs(gotMd - md * pagePct * scale) < 0.05, `${name}: --sp-md ${gotMd} vs CSS ${(md * pagePct * scale).toFixed(2)}`);
    assert.ok(Math.abs(gotSm - sm * pagePct * scale) < 0.05, `${name}: --sp-sm ${gotSm} vs CSS ${(sm * pagePct * scale).toFixed(2)}`);
  }
});
