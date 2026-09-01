#!/usr/bin/env node
/**
 * analyze.mjs — calibrate the sparsity threshold against the measured population.
 *
 * Applies NO threshold at measure time; every number here is derived from the raw
 * (lead, trail, H) triples in cards.json, so a sweep costs no renders.
 *
 *   S = (lead + trail) / H            total slack, as a share of the card's CONTENT box
 *   A = (trail - lead) / (lead+trail) signed asymmetry: +1 all below, -1 all above, 0 centered
 *
 * The composition note's constants are S >= 0.15 ("15% slack") and |A| > 0.5
 * ("a 50% asymmetry split"); a card is a DEFECT (class `trailing`) when both hold
 * and A is positive.
 */
import fs from 'node:fs';

const rows = JSON.parse(fs.readFileSync(process.argv[2] || new URL('../../.scratch/card-slack/cards.json', import.meta.url).pathname, 'utf8'));
const SET = process.env.SET || 'L';
const cards = rows.filter((r) => (SET === 'L' ? r.setL : SET === 'B' ? r.setB : true))
  .map((r) => {
    const slack = r.lead + r.trail;
    return {
      ...r,
      S: r.H > 0 ? slack / r.H : 0,
      A: slack !== 0 ? (r.trail - r.lead) / slack : 0,
      slack,
    };
  });

const COMPOSED = new Set(['stats', 'kpi', 'list-criteria', 'cards-grid', 'actors', 'big-number', 'content']);
const DEFECT = new Set(['decision', 'matrix-2x2', 'list-tabular']);
const label = (c) => (COMPOSED.has(c.component) ? 'composed' : DEFECT.has(c.component) ? 'defect' : 'other');

const S0 = 0.15; const A0 = 0.5;
const classify = (c, s = S0, a = A0) => {
  if (c.S < s) return 'tight';
  if (Math.abs(c.A) <= a) return 'centered';
  return c.A > 0 ? 'trailing' : 'leading';
};

const fmtPct = (x) => `${(x * 100).toFixed(1)}%`;
const SIZES = ['landscape', 'portrait', 'square'];

function section(t) { console.log(`\n${'='.repeat(78)}\n${t}\n${'='.repeat(78)}`); }

// ─────────────────────────────────────────────────────────── population
section(`POPULATION — card set ${SET}`);
console.log(`decks: ${new Set(cards.map((c) => c.deck)).size}   cards: ${cards.length}`);
for (const size of SIZES) {
  const cs = cards.filter((c) => c.size === size);
  console.log(`  ${size.padEnd(10)} ${String(cs.length).padStart(4)} cards, ` +
    `${new Set(cs.map((c) => `${c.deck}#${c.slide}`)).size} slides, ` +
    `${new Set(cs.map((c) => c.deck)).size} decks, ` +
    `${new Set(cs.map((c) => c.component)).size} components`);
}
console.log(`out-of-flow children seen on ${cards.filter((c) => c.outOfFlow > 0).length} of ${cards.length} cards, ` +
  `components: ${[...new Set(cards.filter((c) => c.outOfFlow > 0).map((c) => c.component))].join(', ') || '(none)'}`);

// ─────────────────────────────────────────── class table at the note's constants
section(`CLASS BY COMPONENT × FAMILY at the note's constants (S>=${S0}, |A|>${A0})`);
for (const size of SIZES) {
  const cs = cards.filter((c) => c.size === size);
  if (!cs.length) continue;
  console.log(`\n── ${size} ──`);
  const byComp = new Map();
  for (const c of cs) {
    if (!byComp.has(c.component)) byComp.set(c.component, []);
    byComp.get(c.component).push(c);
  }
  const rowsOut = [...byComp.entries()].map(([comp, list]) => {
    const k = { tight: 0, centered: 0, trailing: 0, leading: 0 };
    for (const c of list) k[classify(c)] += 1;
    const tr = list.filter((c) => classify(c) === 'trailing');
    const worst = tr.length ? Math.max(...tr.map((c) => c.trail / c.cardH)) : 0;
    return { comp, n: list.length, ...k, worst, lab: label(list[0]) };
  }).sort((a, b) => b.trailing - a.trailing || b.n - a.n);
  console.log('  component          lab       n  tight  cent  trail  lead   worst-trail/cardH');
  for (const r of rowsOut) {
    console.log(`  ${r.comp.padEnd(18)} ${r.lab.padEnd(8)} ${String(r.n).padStart(3)} ` +
      `${String(r.tight).padStart(6)} ${String(r.centered).padStart(5)} ${String(r.trailing).padStart(6)} ` +
      `${String(r.leading).padStart(5)}   ${r.trailing ? fmtPct(r.worst) : '—'}`);
  }
}

// ─────────────────────────────────────────────────────────── distributions
function histogram(vals, lo, hi, bins, width = 46) {
  const counts = new Array(bins).fill(0);
  for (const v of vals) {
    let i = Math.floor(((v - lo) / (hi - lo)) * bins);
    if (i < 0) i = 0; if (i >= bins) i = bins - 1;
    counts[i] += 1;
  }
  const max = Math.max(1, ...counts);
  return counts.map((n, i) => {
    const a = lo + ((hi - lo) * i) / bins;
    const b = lo + ((hi - lo) * (i + 1)) / bins;
    return `  [${a.toFixed(2).padStart(5)},${b.toFixed(2).padStart(5)}) ${String(n).padStart(4)} ${'#'.repeat(Math.round((n / max) * width))}`;
  }).join('\n');
}

section('DISTRIBUTIONS — landscape, labeled populations');
for (const grp of ['composed', 'defect']) {
  const g = cards.filter((c) => c.size === 'landscape' && label(c) === grp);
  console.log(`\n── ${grp} (n=${g.length}) — S = total slack / content-box height`);
  console.log(histogram(g.map((c) => c.S), 0, 1, 20));
  console.log(`\n── ${grp} (n=${g.length}) — A = signed asymmetry (−1 all above … +1 all below)`);
  console.log(histogram(g.map((c) => c.A), -1, 1, 20));
}

// ─────────────────────────────────────────────────────────── gap analysis
function gap(size, { conditionalA = A0, conditionalS = S0 } = {}) {
  const cs = cards.filter((c) => c.size === size);
  const comp = cs.filter((c) => label(c) === 'composed');
  const def = cs.filter((c) => label(c) === 'defect');
  const out = {};
  // S axis, restricted to trailing-asymmetric cards (the axis only means something there)
  const compS = comp.filter((c) => c.A >= conditionalA).map((c) => c.S);
  const defS = def.filter((c) => c.A >= conditionalA).map((c) => c.S);
  out.S = {
    compN: compS.length, defN: defS.length,
    compMax: compS.length ? Math.max(...compS) : null,
    defMin: defS.length ? Math.min(...defS) : null,
  };
  // A axis, restricted to cards with slack past the floor
  const compA = comp.filter((c) => c.S >= conditionalS).map((c) => c.A);
  const defA = def.filter((c) => c.S >= conditionalS).map((c) => c.A);
  out.A = {
    compN: compA.length, defN: defA.length,
    compMax: compA.length ? Math.max(...compA) : null,
    defMin: defA.length ? Math.min(...defA) : null,
  };
  // unconditional
  out.Suncond = { compMax: Math.max(...comp.map((c) => c.S)), defMin: Math.min(...def.map((c) => c.S)) };
  out.Auncond = { compMax: Math.max(...comp.map((c) => c.A)), defMin: Math.min(...def.map((c) => c.A)) };
  return out;
}

section('GAP ANALYSIS — labeled by component (composed vs defect), per family');
for (const size of SIZES) {
  if (!cards.some((c) => c.size === size)) continue;
  const g = gap(size);
  console.log(`\n── ${size} ──`);
  console.log(`  S axis, among cards with A >= ${A0}:`);
  console.log(`    composed n=${g.S.compN}  max S = ${g.S.compMax === null ? '—' : fmtPct(g.S.compMax)}`);
  console.log(`    defect   n=${g.S.defN}  min S = ${g.S.defMin === null ? '—' : fmtPct(g.S.defMin)}`);
  console.log(`    ${g.S.compMax !== null && g.S.defMin !== null
    ? (g.S.defMin > g.S.compMax ? `GAP of ${fmtPct(g.S.defMin - g.S.compMax)}` : `OVERLAP of ${fmtPct(g.S.compMax - g.S.defMin)}`)
    : 'one side empty — no gap defined'}`);
  console.log(`  A axis, among cards with S >= ${S0}:`);
  console.log(`    composed n=${g.A.compN}  max A = ${g.A.compMax === null ? '—' : g.A.compMax.toFixed(3)}`);
  console.log(`    defect   n=${g.A.defN}  min A = ${g.A.defMin === null ? '—' : g.A.defMin.toFixed(3)}`);
  console.log(`    ${g.A.compMax !== null && g.A.defMin !== null
    ? (g.A.defMin > g.A.compMax ? `GAP of ${(g.A.defMin - g.A.compMax).toFixed(3)}` : `OVERLAP of ${(g.A.compMax - g.A.defMin).toFixed(3)}`)
    : 'one side empty'}`);
  console.log(`  unconditional: S composed-max ${fmtPct(g.Suncond.compMax)} vs defect-min ${fmtPct(g.Suncond.defMin)}  ` +
    `| A composed-max ${g.Auncond.compMax.toFixed(3)} vs defect-min ${g.Auncond.defMin.toFixed(3)}`);
}

// ─────────────────────────────────────── 2-D feasible region of (S, A) thresholds
section('2-D THRESHOLD SWEEP — flagged := S >= s AND A >= a');
const grid = { s: [], a: [] };
for (let s = 0; s <= 0.9001; s += 0.01) grid.s.push(+s.toFixed(3));
for (let a = 0; a <= 1.0001; a += 0.02) grid.a.push(+a.toFixed(3));

function sweep(size) {
  const cs = cards.filter((c) => c.size === size);
  const comp = cs.filter((c) => label(c) === 'composed');
  const def = cs.filter((c) => label(c) === 'defect');
  const cells = [];
  for (const s of grid.s) {
    for (const a of grid.a) {
      const fp = comp.filter((c) => c.S >= s && c.A >= a).length;
      const tp = def.filter((c) => c.S >= s && c.A >= a).length;
      cells.push({ s, a, fp, tp });
    }
  }
  return { cells, nDef: def.length, nComp: comp.length };
}

for (const size of SIZES) {
  if (!cards.some((c) => c.size === size)) continue;
  const { cells, nDef, nComp } = sweep(size);
  const clean = cells.filter((c) => c.fp === 0);
  const bestTp = Math.max(...clean.map((c) => c.tp));
  const best = clean.filter((c) => c.tp === bestTp);
  console.log(`\n── ${size} (composed n=${nComp}, defect n=${nDef}) ──`);
  console.log(`  max defect cards flagged with ZERO composed false positives: ${bestTp}`);
  const sRange = [Math.min(...best.map((c) => c.s)), Math.max(...best.map((c) => c.s))];
  const aRange = [Math.min(...best.map((c) => c.a)), Math.max(...best.map((c) => c.a))];
  console.log(`  the whole feasible box: s ∈ [${sRange[0]}, ${sRange[1]}], a ∈ [${aRange[0]}, ${aRange[1]}] (union over the region, not a rectangle)`);
  // widest s-interval at a fixed a, and vice versa
  let bestS = null;
  for (const a of grid.a) {
    const ss = best.filter((c) => c.a === a).map((c) => c.s);
    if (!ss.length) continue;
    const w = Math.max(...ss) - Math.min(...ss);
    if (!bestS || w > bestS.w) bestS = { a, lo: Math.min(...ss), hi: Math.max(...ss), w };
  }
  let bestA = null;
  for (const s of grid.s) {
    const as = best.filter((c) => c.s === s).map((c) => c.a);
    if (!as.length) continue;
    const w = Math.max(...as) - Math.min(...as);
    if (!bestA || w > bestA.w) bestA = { s, lo: Math.min(...as), hi: Math.max(...as), w };
  }
  if (bestS) console.log(`  widest s-interval: a=${bestS.a} → s ∈ [${bestS.lo}, ${bestS.hi}] (width ${bestS.w.toFixed(2)}), midpoint ${((bestS.lo + bestS.hi) / 2).toFixed(3)}`);
  if (bestA) console.log(`  widest a-interval: s=${bestA.s} → a ∈ [${bestA.lo}, ${bestA.hi}] (width ${bestA.w.toFixed(2)}), midpoint ${((bestA.lo + bestA.hi) / 2).toFixed(3)}`);
  // largest inscribed rectangle (maximize min margin) over the clean+bestTp region
  const inBest = new Set(best.map((c) => `${c.s}|${c.a}`));
  let bestBox = null;
  for (const c of best) {
    // grow greedily
    const ss = best.filter((x) => x.a === c.a).map((x) => x.s);
    const as = best.filter((x) => x.s === c.s).map((x) => x.a);
    const sLo = Math.min(...ss); const sHi = Math.max(...ss);
    const aLo = Math.min(...as); const aHi = Math.max(...as);
    let ok = true;
    for (const s of grid.s.filter((x) => x >= sLo && x <= sHi)) {
      for (const a of grid.a.filter((x) => x >= aLo && x <= aHi)) {
        if (!inBest.has(`${s}|${a}`)) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok) continue;
    const score = Math.min((sHi - sLo) / 2, (aHi - aLo) / 2 / 1); // both normalized 0..1-ish
    if (!bestBox || score > bestBox.score) bestBox = { sLo, sHi, aLo, aHi, score };
  }
  if (bestBox) {
    console.log(`  largest fully-clean RECTANGLE: s ∈ [${bestBox.sLo}, ${bestBox.sHi}] × a ∈ [${bestBox.aLo}, ${bestBox.aHi}]`);
    console.log(`    recommended midpoint: s = ${((bestBox.sLo + bestBox.sHi) / 2).toFixed(3)} (±${(((bestBox.sHi - bestBox.sLo) / 2) * 100).toFixed(1)}pp), ` +
      `a = ${((bestBox.aLo + bestBox.aHi) / 2).toFixed(3)} (±${((bestBox.aHi - bestBox.aLo) / 2).toFixed(3)})`);
  }
}

// ────────────────────────────────────── one-axis-at-a-time sensitivity
section('SENSITIVITY — one constant varied, the other held at the note\'s value');
for (const size of SIZES) {
  if (!cards.some((c) => c.size === size)) continue;
  const cs = cards.filter((c) => c.size === size);
  const comp = cs.filter((c) => label(c) === 'composed');
  const def = cs.filter((c) => label(c) === 'defect');
  console.log(`\n── ${size} ──`);
  console.log(`  a held at ${A0}; vary s:`);
  console.log('    s      defect-flagged   composed-flagged(FP)');
  for (const s of [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7]) {
    console.log(`    ${String(s).padEnd(6)} ${String(def.filter((c) => c.S >= s && c.A >= A0).length).padStart(8)} / ${def.length}` +
      `        ${String(comp.filter((c) => c.S >= s && c.A >= A0).length).padStart(4)} / ${comp.length}`);
  }
  console.log(`  s held at ${S0}; vary a:`);
  console.log('    a      defect-flagged   composed-flagged(FP)');
  for (const a of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.99]) {
    console.log(`    ${String(a).padEnd(6)} ${String(def.filter((c) => c.S >= S0 && c.A >= a).length).padStart(8)} / ${def.length}` +
      `        ${String(comp.filter((c) => c.S >= S0 && c.A >= a).length).padStart(4)} / ${comp.length}`);
  }
}

// ────────────────────────────────────── the composed cards nearest the boundary
section('THE CARDS THAT SET THE FLOOR — composed cards ranked by how close they come to being flagged');
for (const size of SIZES) {
  const cs = cards.filter((c) => c.size === size && label(c) === 'composed' && c.A >= 0);
  if (!cs.length) continue;
  const near = cs.slice().sort((x, y) => (y.S * (y.A > 0 ? 1 : 0)) - (x.S * (x.A > 0 ? 1 : 0)))
    .filter((c) => c.A >= 0.3).slice(0, 12);
  console.log(`\n── ${size} ──`);
  for (const c of near) {
    console.log(`  ${c.component.padEnd(14)} ${c.deck.padEnd(28)} sl.${String(c.slide).padStart(2)} ` +
      `S=${fmtPct(c.S).padStart(6)} A=${c.A.toFixed(3).padStart(6)} lead=${c.lead.toFixed(0).padStart(4)} trail=${c.trail.toFixed(0).padStart(4)} H=${c.H.toFixed(0)} justify=${c.justify}`);
  }
}
