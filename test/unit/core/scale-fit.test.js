/**
 * Unit: lib/core/scale-fit.js — STEP, the Fit-Ladder move that absorbs the
 * projection font scale (engineering/decisions/2026-09-25-font-scale-fit.md).
 *
 * The kernel's DECISIONS are tested here against a fake section whose "does it
 * clip?" answer is a function of the `--fs-scale` currently applied, so every rule
 * can be driven without a browser. What a real Chromium does with the inline
 * `--fs-scale` is the integration tier's job; this file pins the policy:
 *
 *   · the designed size is never written to (rule 1) — the property that lets the
 *     step ship to every render path with no golden moving;
 *   · TWO SIZES AT MOST: a slide that does not fit at its scale lands on 1x, never on
 *     an in-between step, and never below 1 (owner ruling, fit-policy.md fork 2);
 *   · 1x does not fit either → the requested scale is put back (rule 2);
 *   · a cut the geometry probe cannot see (a code line past the pane) counts, and
 *     one confined to the footer does not (rule 3);
 *   · a second call undoes the first (rule 4), so a shortened slide gets its size back;
 *   · a specimen is left alone (rule 5), and so is a `fit-report` slide (rule 6);
 *   · the injected source survives `new Function` and carries the same floor.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { fitScaleStep, SCALE_FLOOR, SCALE_STEP_ATTR, SCALE_FIT_SRC } = require('../../../lib/core/scale-fit');

/**
 * A section stand-in. `classScale` is what the class rule resolves to; an inline
 * `--fs-scale` wins over it, as it does in CSS. `fitsAt(scale)` is the page's answer.
 */
function fakeSection({ classScale = 1, fitsAt = () => true, cutAt = () => false, chromeOnly = false, notes = '', classes = [] } = {}) {
  const attrs = new Map();
  const inline = new Map();
  const writes = [];
  const s = {
    writes,
    hasAttribute: (k) => attrs.has(k),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => { writes.push(`attr ${k}`); attrs.set(k, String(v)); },
    removeAttribute: (k) => { writes.push(`-attr ${k}`); attrs.delete(k); },
    style: {
      getPropertyValue: (k) => inline.get(k) || '',
      setProperty: (k, v) => { writes.push(`${k}=${v}`); inline.set(k, String(v)); },
      removeProperty: (k) => { writes.push(`-${k}`); inline.delete(k); },
    },
    classList: { contains: (c) => classes.includes(c) },
    querySelector: (sel) => (sel === 'aside.lattice-notes' && notes ? { textContent: notes } : null),
    scale: () => (inline.has('--fs-scale') ? parseFloat(inline.get('--fs-scale')) : classScale),
  };
  s.deps = {
    probeSectionOverflow: () => ({ over: !fitsAt(s.scale()), clipSuspect: cutAt(s.scale()) }),
    probeContentClipped: () => ({ cut: cutAt(s.scale()), chromeOnly }),
  };
  return s;
}

const OPTS = { clipSel: '.c', ignoreSel: '.i', bearerSel: '.b', tol: 12 };

function run(s) {
  const prev = globalThis.getComputedStyle;
  globalThis.getComputedStyle = (el) => ({ getPropertyValue: (k) => (k === '--fs-scale' ? ` ${el.scale()}` : '') });
  try { return fitScaleStep(s, s.deps, OPTS); } finally { globalThis.getComputedStyle = prev; }
}

test('rule 1: at the designed size the section is read and never written', () => {
  const s = fakeSection({ classScale: 1, fitsAt: () => false });
  assert.equal(run(s), null);
  assert.deepEqual(s.writes, []);
});

test('a slide that fits at its requested scale is left exactly as it is', () => {
  const s = fakeSection({ classScale: 1.3 });
  assert.equal(run(s), null);
  assert.deepEqual(s.writes, []);
});

test('two sizes at most: a slide that does not fit at its scale lands on 1x, not an in-between step', () => {
  // It would fit at 1.15x — the old ladder stopped there. The ruling puts it at 1x.
  const s = fakeSection({ classScale: 1.5, fitsAt: (k) => k <= 1.15 });
  assert.deepEqual(run(s), { from: 1.5, to: 1 });
  assert.equal(s.style.getPropertyValue('--fs-scale'), '1');
  assert.equal(s.getAttribute(SCALE_STEP_ATTR), '1.5>1');
});

test('it never goes below the designed size', () => {
  const s = fakeSection({ classScale: 1.3, fitsAt: (k) => k <= 1 });
  assert.deepEqual(run(s), { from: 1.3, to: 1 });
  assert.equal(s.scale(), 1);
});

test('rule 2: when no rung fits, the requested scale is put back and nothing is recorded', () => {
  const s = fakeSection({ classScale: 1.3, fitsAt: () => false });
  assert.deepEqual(run(s), { from: 1.3, to: null });
  assert.equal(s.style.getPropertyValue('--fs-scale'), '');
  assert.equal(s.scale(), 1.3);
  assert.equal(s.hasAttribute(SCALE_STEP_ATTR), false);
});

test('rule 3: a cut the geometry probe cannot see still counts — a code line past the pane', () => {
  // `over` is false at every scale: the pane clips its own line, so the box "fits".
  const s = fakeSection({ classScale: 1.3, cutAt: (k) => k > 1.15 });
  assert.deepEqual(run(s), { from: 1.3, to: 1 });
});

test('rule 3: a cut confined to the footer band is not a reason to step', () => {
  const s = fakeSection({ classScale: 1.3, cutAt: () => true, chromeOnly: true });
  assert.equal(run(s), null);
  assert.deepEqual(s.writes, []);
});

test('rule 4: a second pass undoes the first, so a shortened slide gets its full scale back', () => {
  let long = true;
  const s = fakeSection({ classScale: 1.3, fitsAt: (k) => !long || k <= 1.15 });
  assert.deepEqual(run(s), { from: 1.3, to: 1 });
  long = false; // the author trimmed the slide
  assert.equal(run(s), null);
  assert.equal(s.scale(), 1.3);
  assert.equal(s.hasAttribute(SCALE_STEP_ATTR), false);
});

test('rule 4: an inline --fs-scale the author wrote is restored, not deleted', () => {
  const s = fakeSection({ classScale: 1, fitsAt: (k) => k <= 1.15 });
  s.style.setProperty('--fs-scale', '1.5');
  assert.deepEqual(run(s), { from: 1.5, to: 1 });
  s.deps.probeSectionOverflow = () => ({ over: false, clipSuspect: false });
  run(s);
  assert.equal(s.style.getPropertyValue('--fs-scale'), '1.5');
});

test('rule 5: a stress-slide specimen overflows on purpose and is never stepped', () => {
  const s = fakeSection({ classScale: 1.3, fitsAt: () => false, notes: 'stress-slide' });
  assert.equal(run(s), null);
  assert.deepEqual(s.writes, []);
});

test('rule 6: `fit: report` — a fit-report slide is never stepped, however far it overflows', () => {
  const s = fakeSection({ classScale: 1.3, fitsAt: () => false, classes: ['fit-report'] });
  assert.equal(run(s), null);
  assert.deepEqual(s.writes, []);
});

test('the floor is the designed size, in the module and in the injected source alike', () => {
  assert.equal(SCALE_FLOOR, 1);
  assert.match(SCALE_FIT_SRC, /const FLOOR = 1;/);
});

test('the injected source is self-contained — it survives new Function round-tripping', () => {
  const f = new Function(`return (${SCALE_FIT_SRC})`)();
  const s = fakeSection({ classScale: 1.3, fitsAt: (k) => k <= 1.15 });
  const prev = globalThis.getComputedStyle;
  globalThis.getComputedStyle = (el) => ({ getPropertyValue: () => String(el.scale()) });
  try { assert.deepEqual(f(s, s.deps, OPTS), { from: 1.3, to: 1 }); } finally { globalThis.getComputedStyle = prev; }
});
