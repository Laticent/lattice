/**
 * Unit: a component reflows by TEXT ROOM at one of three shared thresholds.
 *
 * The rule (lib/base/base.elements.css, beside `container-name: lattice`): a slide is the
 * `lattice` size container, its font size is `--fs-body`, and `em` in a container query resolves
 * against the container's own font size. So `@container lattice (width < Nem)` reads "under about
 * 2N characters of body text a line", whatever the box or venue. Three thresholds are shared:
 * 34em (medium), 23em (narrow) and 17em (tight). A fourth value written into one component would
 * make that component reflow at a text room no other layout knows about, and the fit harness
 * (`npm run fit:harness`) would be the only place to find out.
 *
 * WHAT THIS ASSERTS
 *   1. Every `@container lattice (…)` in engine CSS is exactly one of the three width queries.
 *      (`aspect-ratio` on the container was retired in #1218 and is gated in
 *      tools/check-ownership.js; this test rejects it too, since it is not a width.)
 *   2. None of the thresholds reaches a landscape box: hd's 53.89em at laptop over the largest
 *      `--fs-scale` in the source (1.5 today, 35.9em), so a 16:9 deck renders as it did before.
 *   3. The shared tokens exist: `--col-min` is 19ch (24 characters), and `--fluid-cols` is declared
 *      on every element under a slide, which is what lets a grid's own `--col-max` take effect.
 *   4. The tier-1 layouts (the six the fit ratchet named unreadable at a narrow box,
 *      followups.d/2962-p3-…) each carry a text-room rule, so deleting one fails here before
 *      the nightly ratchet finds the crammed pages again.
 *
 * WHAT THIS DOES NOT PROVE: that a rule makes its pages readable. That is the fit harness's
 * readability probe on real renders, ratcheted nightly in test/fit/baseline.json.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const THRESHOLDS = ['34em', '23em', '17em'];

function cssFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...cssFiles(p));
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const ENGINE_CSS = [...cssFiles(path.join(ROOT, 'lib')), ...cssFiles(path.join(ROOT, 'themes'))];

test('every @container lattice query is one of the three text-room thresholds', () => {
  const bad = [];
  let seen = 0;
  for (const f of ENGINE_CSS) {
    const css = stripComments(fs.readFileSync(f, 'utf8'));
    for (const m of css.matchAll(/@container\s+lattice\s*([^{]*)\{/g)) {
      seen++;
      const cond = m[1].trim();
      const ok = THRESHOLDS.some((t) => cond === `(width < ${t})`);
      if (!ok) bad.push(`${path.relative(ROOT, f)}: @container lattice ${cond}`);
    }
  }
  assert.ok(seen > 0, 'expected at least one text-room rule in engine CSS');
  assert.deepEqual(bad, [], `use (width < 34em), (width < 23em) or (width < 17em):\n${bad.join('\n')}`);
});

test('no threshold reaches an hd box, even at the largest type scale', () => {
  // Measured on a real render (2026-10-29, `size: hd`, through lattice.js): the content box is
  // 1152px against a 21.38px section font at laptop, 53.89em. Type and padding are both
  // width-relative, so every landscape box (hd, standard, 4K) measures the same, and the room
  // shrinks only by the type scale. So the narrowest landscape room is 53.89em over the LARGEST
  // `--fs-scale` any class sets (venues and `scale-*`; they do not multiply). Read from the
  // source, so a larger scale fails here rather than silently moving hd under a threshold.
  const css = stripComments(fs.readFileSync(path.join(ROOT, 'lib/base/base.modifiers.css'), 'utf8'));
  const scales = [...css.matchAll(/--fs-scale:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(scales.length >= 3, 'expected the venue and scale-* classes to set --fs-scale');
  const HD_LAPTOP_EM = 53.89;
  const narrowest = HD_LAPTOP_EM / Math.max(...scales);
  for (const t of THRESHOLDS) {
    assert.ok(parseFloat(t) < narrowest - 1, `${t} reaches a landscape box at --fs-scale ${Math.max(...scales)} (${narrowest.toFixed(1)}em)`);
  }
});

test('the shared column tokens exist', () => {
  const tokens = stripComments(fs.readFileSync(path.join(ROOT, 'lib/base/base.tokens.css'), 'utf8'));
  assert.match(tokens, /--col-min:\s*19ch;/, '--col-min is 24 characters of body text, about 19ch');
  assert.match(tokens, /--col-max:\s*1;/);
  const elements = stripComments(fs.readFileSync(path.join(ROOT, 'lib/base/base.elements.css'), 'utf8'));
  const decl = /:where\(section\)\s*:where\(\*\)\s*\{[^}]*?--fluid-cols:([^;]+);/.exec(elements);
  assert.ok(decl, '--fluid-cols must be declared on every element under a slide, at zero specificity');
  for (const v of ['--col-min', '--col-max', '--col-gap']) assert.ok(decl[1].includes(`var(${v})`), `--fluid-cols reads ${v}`);
});

test('each tier-1 layout carries a text-room rule', () => {
  const TIER_1 = [
    'lib/components/inventory/agenda/agenda.styles.css',
    'lib/components/inventory/checklist/checklist.styles.css',
    'lib/components/inventory/list/list.styles.css',
    'lib/components/progression/list-steps/list-steps.styles.css',
    'lib/components/legal/statute-stack/statute-stack.styles.css',
    'lib/components/legal/regulatory-update/regulatory-update.styles.css',
    'lib/components/legal/authority-chain/authority-chain.styles.css',
  ];
  const missing = TIER_1.filter((f) => !/@container\s+lattice\s*\(width </.test(stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'))));
  assert.deepEqual(missing, []);
  // The split cover is shared by every split, so its lead-in carries one too.
  assert.match(stripComments(fs.readFileSync(path.join(ROOT, 'lib/base/base.modifiers.css'), 'utf8')),
    /@container\s+lattice\s*\(width < 17em\)\s*\{\s*\.split-cover-lead/);
});
