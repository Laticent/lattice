const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../../../lib/core/bullet-facts.js');

// ─────────────────────────────────────────────────────────────────────────────
// DIFFERENTIAL PARITY — `lib/core/bullet-facts.js` against the arithmetic it was
// extracted from, over every row shape the chart admits.
//
// WHY THIS FILE IS COMMITTED RATHER THAN RUN ONCE. The extraction claimed to be
// behavior-preserving, and the proof was a scratch script run over 8973 shapes.
// An independent checker then pointed out the obvious: the script was gone, so the
// number was unreproducible by construction, and a measurement nobody can re-derive
// should not be quoted as if they can. It is a test now. Re-run it with
//   node --test test/unit/core/bullet-facts-parity.test.js
// and the count below is the count you get.
//
// WHAT THE REFERENCE IS. `ORIGINAL_*` below are transcribed VERBATIM from
// `bullet.transform.js` as it stood at ba10cd1, before `cutsFor`, `round6` and the
// `<desc>` clause moved to the kernel. They are deliberately NOT refactored, NOT
// tidied and NOT made to share helpers with the kernel — a reference implementation
// that imports the thing it is checking proves only that the code agrees with
// itself, which is the defect class this whole swimlane is about. Do not "clean
// them up"; the duplication is the instrument.
// ─────────────────────────────────────────────────────────────────────────────

const ORIGINAL_BAND_FRACTIONS = Object.freeze([0.6, 0.85]);
const ORIGINAL_MAX_ZONES = 4;
const originalRound6 = (n) => Number(n.toFixed(6));

/** `cutsFor`, verbatim from ba10cd1. */
function originalCutsFor(r) {
  const derived =
    Number.isFinite(r.target) && r.target > r.floor
      ? ORIGINAL_BAND_FRACTIONS.map((f) => originalRound6(r.floor + f * (r.target - r.floor)))
      : [];
  const authored = r.bands.filter((b) => b > r.floor);
  const inner = authored.length ? authored : derived;
  return inner.slice(-(ORIGINAL_MAX_ZONES - 1));
}

/**
 * The `<desc>` row clause, verbatim from ba10cd1. `fmt` is stubbed to an identity
 * formatter: the kernel never took over formatting, so feeding both sides the same
 * stub isolates the ARITHMETIC, which is the only thing that moved.
 */
function originalDesc(r, fmt) {
  const head = r.measureRaw ? `${r.label} ${fmt(r.measure)}` : r.label;
  if (!Number.isFinite(r.target) || !Number.isFinite(r.measure) || r.target <= r.floor) return head;
  const span = r.target - r.floor;
  const pct = Math.round(((r.measure - r.floor) / span) * 100);
  const verdict = r.measure >= r.target ? 'at or above' : 'below';
  const base = r.floorRaw ? `, on a scale from ${fmt(r.floor)}` : '';
  const shownPct = pct < 0 ? `−${Math.abs(pct)}` : `${pct}`;
  const under = r.measure < r.floor ? ', below the bottom of its own scale' : '';
  return `${head}, ${shownPct}% of the ${fmt(r.target)} target — ${verdict} plan${base}${under}`;
}

/** The same clause, built from the kernel — this is what `bullet.transform.js` runs now. */
function kernelDesc(r, fmt) {
  const head = r.measureRaw ? `${r.label} ${fmt(r.measure)}` : r.label;
  const at = F.attainment(r);
  if (!at) return head;
  const { pct, cleared } = at;
  const verdict = cleared ? 'at or above' : 'below';
  const base = r.floorRaw ? `, on a scale from ${fmt(r.floor)}` : '';
  const shownPct = pct < 0 ? `−${Math.abs(pct)}` : `${pct}`;
  const under = at.under ? ', below the bottom of its own scale' : '';
  return `${head}, ${shownPct}% of the ${fmt(r.target)} target — ${verdict} plan${base}${under}`;
}

const fmt = (n) => (Number.isFinite(n) ? String(Number(n.toFixed(4))) : String(n));

/** Every row the shipped galleries author, so the corpus is not only synthetic. */
const SHIPPED = [
  { label: 'New ARR', measure: 4.2, target: 5.0 },
  { label: 'Expansion ARR', measure: 3.6, target: 3.0 },
  { label: 'Gross renewal', measure: 2.8, target: 2.6 },
  { label: 'Services revenue', measure: 1.1, target: 1.8 },
  { label: 'Partner-sourced ARR', measure: 0.9, target: 1.4 },
  { label: 'Qualified pipeline', measure: 128, target: 100 },
  { label: 'Win rate', measure: 112, target: 100 },
  { label: 'Ramped reps', measure: 96, target: 100 },
  { label: 'NRR', measure: 118, target: 112 },
  { label: 'Gross margin', measure: 71, target: 68 },
  { label: 'Deflection', measure: 94, target: 62 },
  { label: 'Onboarding', measure: 58, target: 80 },
  { label: 'Partner cert', measure: 41, target: 75 },
  { label: 'Self-serve', measure: 0, target: 12 },
  { label: 'Pipeline cov', measure: 86, target: 90, bands: [70, 85] },
  { label: 'Uptime', measure: 99.4, target: 99.9, floor: 99.0, floorRaw: '99.0' },
];

/**
 * The edge shapes no gallery has. Each axis is here because it can flip one branch:
 * a non-finite value, a sign, the exact at-plan boundary, a target at or under the
 * floor, bands that the floor swallows, and a band list past the four-zone ceiling.
 */
const VALUES = [
  Number.NaN, -50, -1, 0, 0.0001, 1, 59.9, 60, 85, 99.999, 100, 100.0001, 250, 1e9,
  Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY,
];
const FLOORS = [0, 10, 99, -5, 100];
const BAND_SETS = [[], [60], [50, 70], [50, 70, 85, 90, 93], [-10], [0], [1e9]];

function corpus() {
  const rows = [];
  for (const raw of SHIPPED) rows.push(raw);
  for (const measure of VALUES) {
    for (const target of VALUES) {
      for (const floor of FLOORS) {
        for (const bands of BAND_SETS) {
          rows.push({ label: 'row', measure, target, floor, bands, floorRaw: floor ? String(floor) : null });
        }
      }
    }
  }
  return rows.map((raw) => {
    const r = { label: 'row', measure: Number.NaN, target: Number.NaN, floor: 0, floorRaw: null, measureRaw: '1', bands: [], ...raw };
    // The transform hands `cutsFor` an ASCENDING band list (`parseBullet` sorts it),
    // so the reference is only faithful on sorted input.
    r.bands = (r.bands || []).slice().sort((a, b) => a - b);
    return r;
  });
}

test('bullet-facts is byte-identical to the arithmetic it was extracted from', () => {
  const rows = corpus();
  // The count is asserted so the corpus cannot silently shrink to nothing and leave
  // this test passing over three rows. 16 shipped + 16*16*5*7 generated.
  assert.equal(rows.length, 16 + VALUES.length * VALUES.length * FLOORS.length * BAND_SETS.length);
  assert.equal(rows.length, 8976);

  const diverged = [];
  for (const r of rows) {
    const a = JSON.stringify(originalCutsFor(r));
    const b = JSON.stringify(F.zoneCuts(r));
    const da = originalDesc(r, fmt);
    const db = kernelDesc(r, fmt);
    if (a !== b || da !== db) {
      diverged.push({ row: r, cuts: [a, b], desc: [da, db] });
    }
  }
  assert.deepEqual(
    diverged.slice(0, 3),
    [],
    `${diverged.length} of ${rows.length} rows diverged from the pre-extraction arithmetic`,
  );
});

test('the reference implementation is not vacuous — it disagrees with a BROKEN kernel', () => {
  // Without this cell the test above would pass just as happily if `zoneCuts` and
  // `attainment` were never called. It proves the instrument can register a
  // difference, by feeding the same corpus through the two mistakes the extraction
  // could plausibly have made: measuring attainment as a raw ratio, and measuring
  // the derived cuts from zero instead of from the floor.
  const rows = corpus();
  const naive = (r) => {
    const head = r.measureRaw ? `${r.label} ${fmt(r.measure)}` : r.label;
    if (!Number.isFinite(r.target) || !Number.isFinite(r.measure) || r.target <= r.floor) return head;
    const pct = Math.round((r.measure / r.target) * 100); // the floor term dropped
    const verdict = r.measure >= r.target ? 'at or above' : 'below';
    const base = r.floorRaw ? `, on a scale from ${fmt(r.floor)}` : '';
    const shownPct = pct < 0 ? `−${Math.abs(pct)}` : `${pct}`;
    const under = r.measure < r.floor ? ', below the bottom of its own scale' : '';
    return `${head}, ${shownPct}% of the ${fmt(r.target)} target — ${verdict} plan${base}${under}`;
  };
  const fromZero = (r) => {
    const derived = Number.isFinite(r.target) && r.target > r.floor
      ? ORIGINAL_BAND_FRACTIONS.map((f) => originalRound6(f * r.target)) // the floor term dropped
      : [];
    const authored = r.bands.filter((b) => b > r.floor);
    return (authored.length ? authored : derived).slice(-(ORIGINAL_MAX_ZONES - 1));
  };
  const descDiffs = rows.filter((r) => naive(r, fmt) !== originalDesc(r, fmt)).length;
  const cutDiffs = rows.filter((r) => JSON.stringify(fromZero(r)) !== JSON.stringify(originalCutsFor(r))).length;
  assert.ok(descDiffs > 100, `the attainment probe registered only ${descDiffs} differences — it is not discriminating`);
  assert.ok(cutDiffs > 100, `the cut probe registered only ${cutDiffs} differences — it is not discriminating`);
});
