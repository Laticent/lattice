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
 *   · it stops at the FIRST rung that fits, top to bottom, and never below 1;
 *   · no rung fits → the requested scale is put back (rule 2);
 *   · a cut the geometry probe cannot see (a code line past the pane) counts, and
 *     one confined to the footer does not (rule 3);
 *   · a second call undoes the first (rule 4), so a shortened slide gets its size back;
 *   · a specimen is left alone (rule 5), and so is a `fit-report` slide (rule 6);
 *   · the ladder literal inside the injected source matches SCALE_STEPS and the CSS;
 *   · LEVEL puts every slide that asked for one scale on one rung, the highest all of
 *     them fit (rule 7), and gives the size back when the binding slide is trimmed;
 *   · the export's SCALE lines name the slides to trim for each rung.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  fitScaleStep, levelScaleSteps, scaleLevelReport, SCALE_STEPS, SCALE_FLOOR, SCALE_STEP_ATTR, SCALE_FIT_ATTR, SCALE_FIT_SRC, SCALE_LEVEL_SRC,
} = require('../../../lib/core/scale-fit');

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
    classList: { contains: (c) => classes.includes(c) },
    ownerDocument: fakeSection.doc,
    hasAttribute: (k) => attrs.has(k),
    getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
    setAttribute: (k, v) => { writes.push(`attr ${k}`); attrs.set(k, String(v)); },
    removeAttribute: (k) => { writes.push(`-attr ${k}`); attrs.delete(k); },
    style: {
      getPropertyValue: (k) => inline.get(k) || '',
      setProperty: (k, v) => { writes.push(`${k}=${v}`); inline.set(k, String(v)); },
      removeProperty: (k) => { writes.push(`-${k}`); inline.delete(k); },
    },
    querySelector: (sel) => (sel === 'aside.lattice-notes' && notes ? { textContent: notes } : null),
    scale: () => (inline.has('--fs-scale') ? parseFloat(inline.get('--fs-scale')) : classScale),
  };
  s.deps = {
    probeSectionOverflow: () => ({ over: !fitsAt(s.scale()), clipSuspect: cutAt(s.scale()) }),
    probeContentClipped: () => ({ cut: cutAt(s.scale()), chromeOnly }),
  };
  return s;
}

fakeSection.doc = undefined;
const OPTS = { clipSel: '.c', ignoreSel: '.i', bearerSel: '.b', tol: 12 };

function withStyle(fn) {
  const prev = globalThis.getComputedStyle;
  globalThis.getComputedStyle = (el) => ({ getPropertyValue: (k) => (k === '--fs-scale' ? ` ${el.scale()}` : '') });
  try { return fn(); } finally { globalThis.getComputedStyle = prev; }
}

function run(s) {
  return withStyle(() => fitScaleStep(s, s.deps, OPTS));
}

// The three callers' order: STEP each slide, then LEVEL the deck.
function runDeck(deck, level = levelScaleSteps) {
  return withStyle(() => {
    for (const s of deck) fitScaleStep(s, s.deps, OPTS);
    return level(deck);
  });
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

test('it stops at the FIRST rung that fits, walking down from the requested scale', () => {
  const s = fakeSection({ classScale: 1.5, fitsAt: (k) => k <= 1.15 });
  assert.deepEqual(run(s), { from: 1.5, to: 1.15 });
  assert.equal(s.style.getPropertyValue('--fs-scale'), '1.15');
  assert.equal(s.getAttribute(SCALE_STEP_ATTR), '1.5>1.15');
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
  assert.deepEqual(run(s), { from: 1.3, to: 1.15 });
});

test('rule 3: a cut confined to the footer band is not a reason to step', () => {
  const s = fakeSection({ classScale: 1.3, cutAt: () => true, chromeOnly: true });
  assert.equal(run(s), null);
  assert.deepEqual(s.writes, []);
});

test('rule 4: a second pass undoes the first, so a shortened slide gets its full scale back', () => {
  let long = true;
  const s = fakeSection({ classScale: 1.3, fitsAt: (k) => !long || k <= 1.15 });
  assert.deepEqual(run(s), { from: 1.3, to: 1.15 });
  long = false; // the author trimmed the slide
  assert.equal(run(s), null);
  assert.equal(s.scale(), 1.3);
  assert.equal(s.hasAttribute(SCALE_STEP_ATTR), false);
});

test('rule 4: an inline --fs-scale the author wrote is restored, not deleted', () => {
  const s = fakeSection({ classScale: 1, fitsAt: (k) => k <= 1.15 });
  s.style.setProperty('--fs-scale', '1.5');
  assert.deepEqual(run(s), { from: 1.5, to: 1.15 });
  s.deps.probeSectionOverflow = () => ({ over: false, clipSuspect: false });
  run(s);
  assert.equal(s.style.getPropertyValue('--fs-scale'), '1.5');
});

test('rule 5: a stress-slide specimen overflows on purpose and is never stepped', () => {
  const s = fakeSection({ classScale: 1.3, fitsAt: () => false, notes: 'stress-slide' });
  assert.equal(run(s), null);
  assert.deepEqual(s.writes, []);
});

test('the ladder inside the INJECTED source is SCALE_STEPS, and SCALE_STEPS is the CSS', () => {
  const literal = SCALE_FIT_SRC.match(/const STEPS = \[([^\]]+)\]/);
  assert.ok(literal, 'the injected function carries its own ladder literal');
  assert.deepEqual(literal[1].split(',').map(Number), [...SCALE_STEPS]);
  const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.modifiers.css'), 'utf8');
  const declared = [...css.matchAll(/section\.scale-(?:l|xl|2xl)\s*\{\s*--fs-scale:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  assert.deepEqual([...declared, 1].sort((a, b) => b - a), [...SCALE_STEPS]);
});

test('the injected source is self-contained — it survives new Function round-tripping', () => {
  const f = new Function(`return (${SCALE_FIT_SRC})`)();
  const s = fakeSection({ classScale: 1.3, fitsAt: (k) => k <= 1.15 });
  const prev = globalThis.getComputedStyle;
  globalThis.getComputedStyle = (el) => ({ getPropertyValue: () => String(el.scale()) });
  try { assert.deepEqual(f(s, s.deps, OPTS), { from: 1.3, to: 1.15 }); } finally { globalThis.getComputedStyle = prev; }
});

test('rule 7: every slide that asked for one scale renders at the highest rung all of them fit', () => {
  const deck = [
    fakeSection({ classScale: 1.3 }),
    fakeSection({ classScale: 1.3, fitsAt: (k) => k <= 1.15 }),
    fakeSection({ classScale: 1.3, fitsAt: (k) => k <= 1 }),
    fakeSection({ classScale: 1.3 }),
  ];
  const { changed, groups } = runDeck(deck);
  assert.deepEqual(deck.map((s) => s.scale()), [1, 1, 1, 1]);
  assert.deepEqual(deck.map((s) => s.getAttribute(SCALE_STEP_ATTR)), ['1.3>1', '1.3>1', '1.3>1', '1.3>1']);
  assert.equal(changed.length, 3, 'the slide STEP already put at 1 does not move again');
  assert.deepEqual(groups, [{ from: 1.3, to: 1, size: 4, binding: [{ index: 1, fit: 1.15 }, { index: 2, fit: 1 }], unfit: [] }]);
});

test('rule 7: a deck where every slide fits is not written to', () => {
  const deck = [fakeSection({ classScale: 1.3 }), fakeSection({ classScale: 1.3 })];
  const { changed } = runDeck(deck);
  assert.equal(changed.length, 0);
  assert.deepEqual(deck.flatMap((s) => s.writes), []);
});

test('rule 6 at the designed size: nothing is read into a group and nothing is written', () => {
  const deck = [fakeSection({ classScale: 1, fitsAt: () => false }), fakeSection({ classScale: 1 })];
  assert.deepEqual(runDeck(deck), { changed: [], groups: [] });
  assert.deepEqual(deck.flatMap((s) => s.writes), []);
});

test('rule 2 + 7: a slide no rung fixes does not drag the deck down, and renders at the shared rung', () => {
  const deck = [
    fakeSection({ classScale: 1.3, fitsAt: () => false }),
    fakeSection({ classScale: 1.3, fitsAt: (k) => k <= 1.15 }),
    fakeSection({ classScale: 1.3 }),
  ];
  const { groups } = runDeck(deck);
  assert.equal(groups[0].to, 1.15);
  assert.deepEqual(groups[0].unfit, [0]);
  assert.deepEqual(deck.map((s) => s.scale()), [1.15, 1.15, 1.15]);
  const [, detail] = scaleLevelReport(groups);
  assert.match(detail, /^ {4}Page 1 clips at every size/);
});

test('rule 7: two different asks are levelled separately', () => {
  const deck = [
    fakeSection({ classScale: 1.3, fitsAt: (k) => k <= 1.15 }),
    fakeSection({ classScale: 1.3 }),
    fakeSection({ classScale: 1.5, fitsAt: (k) => k <= 1.3 }),
    fakeSection({ classScale: 1 }),
  ];
  runDeck(deck);
  assert.deepEqual(deck.map((s) => s.scale()), [1.15, 1.15, 1.3, 1]);
});

test('rule 4 + 7: trimming the binding slide gives the whole deck its size back', () => {
  let long = true;
  const deck = [
    fakeSection({ classScale: 1.3, fitsAt: (k) => !long || k <= 1 }),
    fakeSection({ classScale: 1.3 }),
  ];
  deck[1].style.setProperty('--fs-scale', '1.3'); // an author inline value, to be restored
  runDeck(deck);
  assert.deepEqual(deck.map((s) => s.scale()), [1, 1]);
  long = false;
  // The live runtime re-measures only the edited slide; LEVEL still sees the deck.
  withStyle(() => fitScaleStep(deck[0], deck[0].deps, OPTS));
  const { changed } = withStyle(() => levelScaleSteps(deck));
  assert.deepEqual(changed, [deck[1]]);
  assert.deepEqual(deck.map((s) => s.scale()), [1.3, 1.3]);
  assert.equal(deck[1].style.getPropertyValue('--fs-scale'), '1.3');
  assert.equal(deck[0].hasAttribute(SCALE_FIT_ATTR), false);
  assert.equal(deck[1].hasAttribute(SCALE_STEP_ATTR), false);
});

test('rule 5 + 7: a specimen neither sets the rung nor is moved to it', () => {
  const deck = [
    fakeSection({ classScale: 1.3, fitsAt: () => false, notes: 'stress-slide' }),
    fakeSection({ classScale: 1.3, fitsAt: (k) => k <= 1.15 }),
  ];
  runDeck(deck);
  assert.deepEqual(deck.map((s) => s.scale()), [1.3, 1.15]);
});

test('LEVEL is idempotent: a second pass over a levelled deck changes nothing', () => {
  const deck = [fakeSection({ classScale: 1.3, fitsAt: (k) => k <= 1 }), fakeSection({ classScale: 1.3 })];
  runDeck(deck);
  assert.equal(runDeck(deck).changed.length, 1, 'STEP undoes and re-steps its own slide; LEVEL re-lowers only the other');
  assert.equal(withStyle(() => levelScaleSteps(deck)).changed.length, 0);
});

test('the SCALE report names the slides to trim for each rung above the one the deck landed on', () => {
  const lines = scaleLevelReport([{ from: 1.3, to: 1, size: 70, binding: [{ index: 5, fit: 1.15 }, { index: 3, fit: 1 }], unfit: [] }]);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /1\.3x was asked for and all 70 slides that asked for it render at 1x, so they stay one size/);
  assert.match(lines[1], /Stepping the scale clips nothing\./);
  assert.match(lines[1], /for 1\.15x, trim page 4; for 1\.3x, trim pages 4, 6\./);
  assert.deepEqual(scaleLevelReport([{ from: 1.3, to: 1.3, size: 3, binding: [], unfit: [] }]), []);
  assert.doesNotMatch(scaleLevelReport([{ from: 1.3, to: 1.15, size: 1, binding: [{ index: 0, fit: 1.15 }], unfit: [] }])[0], /one size/);
});

test('the injected LEVEL source is self-contained — it survives new Function round-tripping', () => {
  const level = new Function(`return (${SCALE_LEVEL_SRC})`)();
  const deck = [fakeSection({ classScale: 1.3, fitsAt: (k) => k <= 1.15 }), fakeSection({ classScale: 1.3 })];
  runDeck(deck, level);
  assert.deepEqual(deck.map((s) => s.scale()), [1.15, 1.15]);
});

test('rule 6: `fit: report` — a fit-report slide is never stepped, however far it overflows', () => {
  const s = fakeSection({ classScale: 1.3, fitsAt: () => false, classes: ['fit-report'] });
  assert.equal(run(s), null);
  assert.deepEqual(s.writes, []);
});

test('rule 6 + 7: a fit-report slide neither sets the shared rung nor is moved to it', () => {
  const deck = [
    fakeSection({ classScale: 1.3, fitsAt: (k) => k <= 1, classes: ['fit-report'] }),
    fakeSection({ classScale: 1.3, fitsAt: (k) => k <= 1.15 }),
    fakeSection({ classScale: 1.3 }),
  ];
  runDeck(deck);
  assert.deepEqual(deck.map((s) => s.scale()), [1.3, 1.15, 1.15]);
  assert.deepEqual(deck[0].writes, []);
});

test('the floor is the designed size', () => {
  assert.equal(SCALE_FLOOR, 1);
  assert.equal(SCALE_STEPS[SCALE_STEPS.length - 1], SCALE_FLOOR);
});

test('a host cap: LEVEL never lands above the rung a whole-deck measurement found', () => {
  const capAttrs = new Map([['data-lattice-scale-cap', '1.3>1']]);
  fakeSection.doc = { documentElement: { getAttribute: (k) => capAttrs.get(k) ?? null } };
  try {
    const deck = [fakeSection({ classScale: 1.3 })]; // the one slide this document shows; it fits
    runDeck(deck);
    assert.equal(deck[0].scale(), 1);
    assert.equal(deck[0].getAttribute(SCALE_STEP_ATTR), '1.3>1');
    capAttrs.delete('data-lattice-scale-cap'); // the binding slide was trimmed
    runDeck(deck);
    assert.equal(deck[0].scale(), 1.3);
    capAttrs.set('data-lattice-scale-cap', '1.5>1.15'); // a cap for another ask does not apply
    runDeck(deck);
    assert.equal(deck[0].scale(), 1.3);
  } finally {
    fakeSection.doc = undefined;
  }
});
