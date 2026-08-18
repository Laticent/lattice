// Compare two sweep manifests. Reports the grid figures AND the distinct ones —
// a -dark wrapper renders byte-identically to its parent at a FIXED color-mode,
// so the grid double-counts and the distinct figures are the honest ones.
import fs from 'node:fs';

const before = JSON.parse(fs.readFileSync('/tmp/sweep-before/manifest.before.json', 'utf8'));
const after  = JSON.parse(fs.readFileSync('/tmp/sweep-after/manifest.after.json', 'utf8'));

const keys = Object.keys(before);
let changedInstances = 0, totalInstances = 0;
const changedStates = [];
const perSlide = {};
const SLIDES = ['divider', 'code', 'roadmap', 'list takeaway', 'gantt', 'kanban', 'piechart', 'checklist', 'closing accent'];

for (const k of keys) {
  const b = before[k], a = after[k];
  if (!Array.isArray(b) || !Array.isArray(a)) { console.log(`! ${k} errored`); continue; }
  let n = 0;
  b.forEach((h, i) => { totalInstances++; if (h !== a[i]) { n++; changedInstances++; perSlide[SLIDES[i]] = (perSlide[SLIDES[i]] || 0) + 1; } });
  if (n) changedStates.push([k, n]);
}

// DISTINCTNESS is computed from the renders themselves, not from filenames: two
// theme-modes are the same state when their whole BEFORE fingerprint matches.
const fp = (m, k) => m[k].join(',');
const distinctStates = new Map();      // before-fingerprint -> [keys]
for (const k of keys) {
  const f = fp(before, k);
  if (!distinctStates.has(f)) distinctStates.set(f, []);
  distinctStates.get(f).push(k);
}
const distinctChanged = new Set();     // distinct CHANGED renderings, by (before,after) slide pair
let distinctChangedStates = 0;
for (const [, group] of distinctStates) {
  const k = group[0];
  const n = before[k].filter((h, i) => h !== after[k][i]).length;
  if (n) distinctChangedStates++;
  before[k].forEach((h, i) => { if (h !== after[k][i]) distinctChanged.add(`${h}->${after[k][i]}`); });
}

console.log(`\n  theme-modes in the grid                 ${keys.length}`);
console.log(`  ...with at least one changed slide      ${changedStates.length}`);
console.log(`  changed slide instances                 ${changedInstances} of ${totalInstances}`);
console.log(`  DISTINCT states in that grid            ${distinctStates.size}`);
console.log(`  DISTINCT states with a changed slide    ${distinctChangedStates}`);
console.log(`  DISTINCT changed renderings             ${distinctChanged.size}`);
console.log(`\n  by slide:`);
for (const s of SLIDES) console.log(`    ${s.padEnd(16)} ${perSlide[s] || 0}`);
console.log(`\n  worst theme-modes:`);
for (const [k, n] of changedStates.sort((x, y) => y[1] - x[1]).slice(0, 6)) console.log(`    ${k.padEnd(30)} ${n} of 9`);
console.log(`  mildest:`);
for (const [k, n] of changedStates.slice(-4)) console.log(`    ${k.padEnd(30)} ${n} of 9`);
const unchanged = keys.filter((k) => !changedStates.find(([x]) => x === k));
console.log(`\n  theme-modes with NO change: ${unchanged.length ? unchanged.join(', ') : 'none'}`);
console.log(`\n  duplicate groups (identical BEFORE fingerprints):`);
for (const [, g] of distinctStates) if (g.length > 1) console.log(`    ${g.join('  ==  ')}`);
