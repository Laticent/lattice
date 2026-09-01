#!/usr/bin/env node
/**
 * calibrate.mjs — the calibration itself: where the population is EMPTY.
 *
 * The classifier's two constants are only defensible if the measured population has
 * a hole where they sit. So instead of asking "does 15% separate the labels", this
 * asks the label-free question: sort every card's S (and A) and find the widest
 * interval containing NO card. A threshold inside that interval yields exactly the
 * same split as any other value inside it; its margin is its distance to each edge.
 */
import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).filter((r) => r.setL);
const cards = raw.map((r) => {
  const slack = r.lead + r.trail;
  return { ...r, slack, S: r.H > 0 ? slack / r.H : 0, A: slack > 0 ? (r.trail - r.lead) / slack : null };
});
const SIZES = ['landscape', 'portrait', 'square'];
const pct = (x) => `${(x * 100).toFixed(1)}%`;

/** Widest interval containing no observation, restricted to [lo, hi]. */
function widestHole(vals, lo, hi) {
  const v = [lo, ...vals.filter((x) => x > lo && x < hi).sort((a, b) => a - b), hi];
  let best = { lo, hi: lo, w: 0 };
  for (let i = 1; i < v.length; i += 1) {
    const w = v[i] - v[i - 1];
    if (w > best.w) best = { lo: v[i - 1], hi: v[i], w };
  }
  return best;
}

console.log('══ ASYMMETRY AXIS — where is the population empty?');
console.log('   (A is undefined when total slack <= 0: that card OVERFLOWS, which is the');
console.log('    overflow probe\'s question, not this one. Those cards are excluded.)');
const defA = cards.filter((c) => c.A !== null && c.lead >= -1 && c.trail >= -1 && c.slack > 1);
for (const size of [...SIZES, 'ALL']) {
  const g = size === 'ALL' ? defA : defA.filter((c) => c.size === size);
  const h = widestHole(g.map((c) => c.A), 0, 1);
  console.log(`  ${size.padEnd(10)} n=${String(g.length).padStart(4)}  widest empty A-interval (${h.lo.toFixed(3)}, ${h.hi.toFixed(3)})  ` +
    `width ${h.w.toFixed(3)}  MIDPOINT ${((h.lo + h.hi) / 2).toFixed(3)} ±${(h.w / 2).toFixed(3)}`);
}

console.log('\n══ SLACK AXIS — where is the population empty, among trailing-asymmetric cards?');
for (const a of [0.5, 0.7]) {
  console.log(`  gate A >= ${a}`);
  for (const size of [...SIZES, 'ALL']) {
    const g = (size === 'ALL' ? defA : defA.filter((c) => c.size === size)).filter((c) => c.A >= a);
    const h = widestHole(g.map((c) => c.S), 0, 0.45);
    console.log(`    ${size.padEnd(10)} n=${String(g.length).padStart(4)}  widest empty S-interval (${pct(h.lo)}, ${pct(h.hi)})  ` +
      `width ${(h.w * 100).toFixed(1)}pp  MIDPOINT ${pct((h.lo + h.hi) / 2)} ±${((h.w / 2) * 100).toFixed(1)}pp`);
  }
}

console.log('\n══ IS THE FLAGGED POPULATION ITSELF SEPARABLE? (largest hole ABOVE the floor)');
for (const size of SIZES) {
  const g = defA.filter((c) => c.size === size && c.A >= 0.7 && c.S >= 0.19);
  const h = widestHole(g.map((c) => c.S), 0.19, 0.9);
  console.log(`  ${size.padEnd(10)} n=${String(g.length).padStart(3)}  largest hole above 19%: (${pct(h.lo)}, ${pct(h.hi)}) width ${(h.w * 100).toFixed(1)}pp`);
}

console.log('\n══ DOES THE RECOMMENDATION CHANGE ANY CARD vs THE NOTE\'S CONSTANTS?');
const cls = (c, s, a) => (c.S < s ? 'tight' : (c.A === null || Math.abs(c.A) <= a) ? 'centered' : c.A > 0 ? 'trailing' : 'leading');
let moved = 0;
const movedBy = {};
for (const c of cards) {
  const a1 = cls(c, 0.15, 0.5); const a2 = cls(c, 0.14, 0.7);
  if (a1 !== a2) { moved += 1; movedBy[`${c.component} ${a1}→${a2}`] = (movedBy[`${c.component} ${a1}→${a2}`] || 0) + 1; }
}
console.log(`  (15%, 0.50) vs (14%, 0.70): ${moved} of ${cards.length} cards change class ${JSON.stringify(movedBy)}`);

console.log('\n══ FLAGGED AT THE RECOMMENDATION (S >= 14%, A > 0.70), by component × family');
for (const size of SIZES) {
  const g = cards.filter((c) => c.size === size && cls(c, 0.14, 0.7) === 'trailing');
  const by = {};
  for (const c of g) {
    by[c.component] = by[c.component] || { n: 0, minS: 1, maxS: 0, worstTrailPx: 0 };
    const b = by[c.component];
    b.n += 1; b.minS = Math.min(b.minS, c.S); b.maxS = Math.max(b.maxS, c.S);
    b.worstTrailPx = Math.max(b.worstTrailPx, c.trail);
  }
  const tot = cards.filter((c) => c.size === size).length;
  console.log(`  ${size} — ${g.length} of ${tot} cards flagged`);
  for (const [k, b] of Object.entries(by).sort((x, y) => y[1].n - x[1].n)) {
    console.log(`    ${k.padEnd(15)} ×${String(b.n).padStart(3)}   S ${pct(b.minS)}–${pct(b.maxS)}   worst trail ${b.worstTrailPx.toFixed(0)}px`);
  }
}
