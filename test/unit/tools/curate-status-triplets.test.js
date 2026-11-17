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
const { themeFacts, audit, KANBAN } = require('../../../tools/curate-status-triplets.js');
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

test('a light-face status mark is checked against every kanban card it can sit on', () => {
  // The dark face is a chart solid held to the slide alone; its status-ink edge stands it off a card.
  const names = (st) => themeFacts('onyx').light.surfaces(st, '#808080').map((x) => x.name);
  for (const st of ['pass', 'warn', 'fail', 'info', 'mute']) {
    assert.ok(names(st).includes('its washed kanban card'), `${st}: washed card`);
    assert.ok(names(st).includes('a keyline kanban card') || names(st).length >= 5, `${st}: keyline card`);
  }
});

test('the dark-face audit holds a status to the chart-solid contract', () => {
  // Each arm breaks one dark rule on indaco and must be reported; the shipped values must report nothing.
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/status-fill-cvd-baseline.json'), 'utf8'));
  const V0 = mergedVars('indaco');
  const run = (patch) => audit('indaco', themeFacts('indaco', { ...V0, ...patch }), baseline, 1);
  assert.deepEqual(run({}), [], 'indaco as shipped');
  const darkOf = (tok) => V0[tok].replace(/^light-dark\((#[0-9A-Fa-f]{6}),.*$/, '$1');
  const arms = {
    'a glowing fill under the one ink': [{ 'pass-mark': `light-dark(${darkOf('pass-mark')}, #85C67C)` }, /pass-on-mark .*on its fill/],
    'a fill too deep to stand off the slide': [{ 'fail-mark': `light-dark(${darkOf('fail-mark')}, #3A0A10)` }, /fail-mark.*against the slide/],
    'a night ink instead of the one ink': [{ 'warn-on-mark': 'light-dark(#FFFFFF, #001D33)' }, /warn-on-mark/],
    'an edge in the fill instead of the status ink': [{ 'pass-edge-mark': V0['pass-mark'] }, /edge of --pass-mark is not its status ink/],
    'a shade that steps toward the ink': [{ 'status-shade-mark': 'light-dark(#000000, #FFFFFF)' }, /dark --status-shade-mark/],
  };
  for (const [name, [patch, re]] of Object.entries(arms)) assert.ok(run(patch).some((b) => re.test(b)), `${name}: ${run(patch).join(' | ')}`);
});

test('deferred is a gray in the theme\'s own neutral', () => {
  // The fourth scoring found a cool slate deferred on every warm theme; mustard's is warm, and a slate one must report.
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/status-fill-cvd-baseline.json'), 'utf8'));
  const V0 = mergedVars('mustard');
  const run = (patch) => audit('mustard', themeFacts('mustard', { ...V0, ...patch }), baseline, 1);
  assert.deepEqual(run({}), [], 'mustard as shipped');
  const dark = V0['mute-mark'].replace(/^light-dark\(#[0-9A-Fa-f]{6},\s*(#[0-9A-Fa-f]{6})\)$/, '$1');
  const bad = run({ 'mute-mark': `light-dark(#565D6F, ${dark})` });
  assert.ok(bad.some((b) => /light muted --mute-mark hue .* off the theme's neutral/.test(b)), bad.join(' | '));
  // And it stands apart from done: cuoio's deferred once sat 0.050 from its olive done, and the two read as one drab.
  // The arm is an olive-gray 0.039 from cuoio's done.
  const C0 = mergedVars('cuoio');
  const cuoio = (patch) => audit('cuoio', themeFacts('cuoio', { ...C0, ...patch }), baseline, 1);
  assert.deepEqual(cuoio({}), [], 'cuoio as shipped');
  const cDark = C0['mute-mark'].replace(/^light-dark\(#[0-9A-Fa-f]{6},\s*(#[0-9A-Fa-f]{6})\)$/, '$1');
  const near = cuoio({ 'mute-mark': `light-dark(#4A4A38, ${cDark})` });
  assert.ok(near.some((b) => /light muted --mute-mark sits .* from done/.test(b)), near.join(' | '));
  // And it recedes: mustard's deferred once went to #44402E (L 0.37), the heaviest pill on the slide.
  const heavy = run({ 'mute-mark': `light-dark(#44402E, ${dark})` });
  assert.ok(heavy.some((b) => /light muted --mute-mark sits at L .* darker than done or blocked/.test(b)), heavy.join(' | '));
  // And it clears pilot: on concrete, a cool neutral, deferred once sat 0.039 from its pilot (#004E5C) and the two bars
  // read as twins.
  const K0 = mergedVars('concrete');
  const concrete = (patch) => audit('concrete', themeFacts('concrete', { ...K0, ...patch }), baseline, 1);
  assert.deepEqual(concrete({}), [], 'concrete as shipped');
  const kDark = K0['info-mark'].replace(/^light-dark\(#[0-9A-Fa-f]{6},\s*(#[0-9A-Fa-f]{6})\)$/, '$1');
  const twin = concrete({ 'info-mark': `light-dark(#004E5C, ${kDark})` });
  assert.ok(twin.some((b) => /light muted --mute-mark sits .* from pilot/.test(b)), twin.join(' | '));
  // And pilot clears the trio: pushed deep to clear deferred, concrete's pilot (#00343F) landed 0.053 from its done.
  const deep = concrete({ 'info-mark': `light-dark(#00343F, ${kDark})` });
  assert.ok(deep.some((b) => /light muted --info-mark sits .* from --pass-mark/.test(b)), deep.join(' | '));
});

test('blocked stands off the first category, which a chart also paints as no status', () => {
  // Onyx's blocked once sat 0.048 from its crimson first category, and a gantt's no-status bar read as blocked.
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/status-fill-cvd-baseline.json'), 'utf8'));
  const O0 = mergedVars('onyx');
  const run = (patch) => audit('onyx', themeFacts('onyx', { ...O0, ...patch }), baseline, 1);
  assert.deepEqual(run({}), [], 'onyx as shipped');
  const dark = O0['fail-mark'].replace(/^light-dark\(#[0-9A-Fa-f]{6},\s*(#[0-9A-Fa-f]{6})\)$/, '$1');
  const bad = run({ 'fail-mark': `light-dark(#9E001A, ${dark})` });
  assert.ok(bad.some((b) => /light muted --fail-mark sits .* from --chart-cat1/.test(b)), bad.join(' | '));
});

test('a surface the tool cannot resolve stops it rather than being skipped', () => {
  // A dropped surface would let --check pass a fill it never measured against that surface.
  const V = { ...mergedVars('onyx'), 'accent-soft': 'currentColor' };
  assert.throws(() => themeFacts('onyx', V).light.surfaces('pass', '#808080'), /accent-soft/);
});

test('blocked stays red, and on light at risk sits above it', () => {
  // A raspberry or magenta blocked reads as a category, and two exceptions at one lightness read as one heavy mass.
  const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/status-fill-cvd-baseline.json'), 'utf8'));
  const V0 = mergedVars('indaco');
  const run = (patch) => audit('indaco', themeFacts('indaco', { ...V0, ...patch }), baseline, 1);
  const darkOf = (tok) => V0[tok].replace(/^light-dark\(#[0-9A-Fa-f]{6},\s*(#[0-9A-Fa-f]{6})\)$/, '$1');
  const arms = {
    'a raspberry blocked on light': [{ 'fail-mark': `light-dark(#9B0057, ${darkOf('fail-mark')})` }, /light muted --fail-mark hue .* outside the red range/],
    'a magenta blocked on dark': [{ 'fail-mark': V0['fail-mark'].replace(/,\s*#[0-9A-Fa-f]{6}\)$/, ', #D9007A)') }, /dark muted --fail-mark hue .* outside the red range/],
    'at risk as deep as blocked on light': [{ 'warn-mark': `light-dark(#6E3F00, ${darkOf('warn-mark')})` }, /light muted: at risk sits .* above blocked/],
    // The fourth scoring's two dark and light defects: a neon blocked (indaco's own pre-cap value) and a borrowed slate.
    'a neon blocked on dark': [{ 'fail-mark': V0['fail-mark'].replace(/,\s*#[0-9A-Fa-f]{6}\)$/, ', #DB0038)') }, /dark muted --fail-mark chroma .* louder than the cap/],
  };
  for (const [name, [patch, re]] of Object.entries(arms)) assert.ok(run(patch).some((b) => re.test(b)), `${name}: ${run(patch).join(' | ')}`);
});
