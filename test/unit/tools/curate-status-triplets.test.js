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
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { themeFacts, KANBAN } = require('../../../tools/curate-status-triplets.js');
const { mergedVars } = require('../../../tools/composed-contrast.js');

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

test('the kanban surfaces the solver models are the mixes the kanban CSS paints', () => {
  // The solver copies these mixes to recompute a washed card for every candidate fill; a retuned card in the CSS that the
  // copy does not follow would leave every curated pill measured against a card the board no longer draws.
  const css = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\s+/g, ' ');
  const kanban = css('lib/plugins/chart-family/kinds/kanban/kanban.styles.css');
  const family = css('lib/plugins/chart-family/chart-family.styles.css');
  const asCss = (mix, st) => mix.replace('var(--cstx-hue)', `var(--state-${st}-hue)`).replace('var(--cstx-wash)', 'var(--status-fill)').replace('var(--cstx-lift)', KANBAN.lift);
  assert.ok(kanban.includes(`background: light-dark( var(--bg-alt), ${KANBAN.lift})`), 'the plain card and its dark lift');
  assert.ok(kanban.includes(`background: light-dark( ${KANBAN.keyline.light}, ${KANBAN.keyline.dark})`), 'the keyline card');
  assert.ok(kanban.includes(`background: light-dark( ${asCss(KANBAN.card.light)}, ${asCss(KANBAN.card.dark)})`), 'the washed card');
  for (const [mix, st] of [[KANBAN.wash, 'pass'], [KANBAN.mute, 'mute']]) {
    assert.ok(family.includes(`--state-${st}-fill: light-dark(${asCss(mix.light, st)}, ${asCss(mix.dark, st)})`), `the --state-${st}-fill wash`);
  }
});

test('a status mark is checked against every kanban card it can sit on', () => {
  const names = (face, st) => themeFacts('onyx')[face].surfaces(st, '#808080').map((x) => x.name);
  for (const st of ['pass', 'warn', 'fail', 'info', 'mute']) {
    assert.ok(names('light', st).includes('its washed kanban card'), `${st} light: washed card`);
    assert.ok(names('dark', st).includes('a kanban card'), `${st} dark: lifted card`);
    assert.ok(names('dark', st).includes('a keyline kanban card') || names('dark', st).length >= 5, `${st} dark: keyline card`);
  }
});

test('a surface the tool cannot resolve stops it rather than being skipped', () => {
  // A dropped surface would let --check pass a fill it never measured against that surface.
  const V = { ...mergedVars('onyx'), 'accent-soft': 'currentColor' };
  assert.throws(() => themeFacts('onyx', V).light.surfaces('pass', '#808080'), /accent-soft/);
});
