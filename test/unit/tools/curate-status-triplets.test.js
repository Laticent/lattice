/**
 * Unit: every brand theme meets THE STATUS TRIPLET contract as shipped (engineering/decisions/2026-11-16-status-triplets.md),
 * checked by the tool that solves it, so a hand edit to a theme's status block cannot drift off the contract with every
 * other gate green: fill 4.5:1 off the slide, ink 4.5:1 on the fill, the edge the fill itself, fail never quieter than
 * warn, every fill clear of the accent, the signal rings, and the colorblind ratchet. Also pins which status slots fell
 * back to a stock band hue because the theme has no color near it, so a theme that loses an anchor is noticed.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { themeFacts } = require('../../../tools/curate-status-triplets.js');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BRAND = ['ardesia', 'atelier', 'brina', 'burgundy', 'carbone', 'carta', 'concrete', 'crepuscolo', 'cuoio', 'indaco', 'laguna', 'magnolia', 'mustard', 'onyx'];

test('every brand theme meets the status triplet contract (curate-status-triplets --check)', () => {
  let out;
  try {
    out = execFileSync(process.execPath, [path.join(ROOT, 'tools/curate-status-triplets.js'), '--check'], { encoding: 'utf8' });
  } catch (e) {
    assert.fail(`curate-status-triplets --check failed:\n${e.stdout}${e.stderr}`);
  }
  for (const t of BRAND) assert.match(out, new RegExp(`^${t}\\s+ok$`, 'm'), `${t} meets the contract`);
});

test('the status slots that fall back to a stock band hue are the recorded ones', () => {
  // A slot falls back when the theme has no brand or chart color within the status's hue band. ardesia is a slate
  // palette with no green, amber or red at all; the others miss one band each.
  const RECORDED = ['ardesia:pass', 'ardesia:warn', 'ardesia:fail', 'atelier:pass', 'brina:warn', 'crepuscolo:fail', 'laguna:warn'];
  const now = BRAND.flatMap((t) => ['pass', 'warn', 'fail', 'info'].filter((s) => themeFacts(t).anchor[s].from === 'band').map((s) => `${t}:${s}`));
  assert.deepEqual(now.sort(), RECORDED.sort());
});
