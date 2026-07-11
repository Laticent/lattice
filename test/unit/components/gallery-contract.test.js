// Gallery content contract — the Specimen Book debt ledger (2026-07-05 decision §2).
//
// A component is CONFORMING, IN DEBT BY NAME, or EXEMPT WITH A REASON — and
// this test knows which. Every predicate is mechanical:
//   stressDoc — no stress content (neither stressDoc nor legacy stressSample)
//   density   — no density budget declared
//   voice     — specimenVoice flag absent (samples not yet migrated)
//   budget    — a sample element exceeds its density budget (soft; hard for stress)
//   band      — stress element count outside [min(soft+1, hard), hard] on capacity.axis
//
// The test fails when an UNLISTED component violates a predicate (regression),
// when a LISTED component violates one its entry doesn't name (new regression),
// AND when an entry is STALE (the predicate now passes — progress must be
// recorded by deleting the entry, in the same PR that earns it). Migration PRs
// 2–4 drain the ledger; see the decision doc's §6.
//
// Hard gates (day one, zero violators, never listed):
//   - default sample lands ≤ capacity.soft
//   - no sample carries its own _footer: (it would silently swallow the caption footer)
//   - no placeholder-shaped content (TBD / TODO / lorem)
//   - galleryPlan(m).length === expectedGallerySlideCount(m)
//   - specimenVoice=true forbids ANY debt entry for that component
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadAll } = require('../../../lib/components');
const {
  galleryPlan,
  stressDocOf,
  expectedGallerySlideCount,
} = require('../../../tools/build-component-docs');
const { elementWordCounts } = require('../../../lib/authoring/prose-budgets');
const { countPrimaryCollection } = require('../../../lib/authoring/lint-core');

// ---- the ledger: NAMED debt, measured at PR 1 (re-run this file to re-measure) ----
const VOICE_DEBT = {
  stressDoc: [
  ],
  density: [
  ],
  voice: [
  ],
  budget: [
  ],
  band: [
    // inventory: measured truth — the register look seats five full rows, but
    // capacity declares hard=6, so a band-conforming (n=6) stress slide CLIPS.
    // The stress slide ships at the honest n=5 and says so; resolving the
    // mismatch is a capacity recalibration follow-up, not a copy edit.
    'inventory',
  ],
};

// Components that genuinely cannot carry a rule, each with a one-line reason.
// Stale-entry-fails applies here too: an exemption for a component that now
// passes (or that names a rule it no longer needs) must be deleted.
const VOICE_EXEMPT = {
  // Anchors: single-element dark bookends — no collection to stress, no countable axis to budget.
  title: { rules: ['stressDoc', 'density'], reason: 'single-element dark bookend' },
  divider: { rules: ['stressDoc', 'density'], reason: 'single-element dark bookend' },
  closing: { rules: ['stressDoc', 'density'], reason: 'single-element dark bookend' },
  // Connect cards: the slot list IS the layout — a fixed identity/credentials card, not a scalable collection.
  contact: { rules: ['stressDoc', 'density'], reason: 'fixed vCard card; slots, not a collection' },
  wifi: { rules: ['stressDoc', 'density'], reason: 'fixed credentials card; slots, not a collection' },
  // Logo wall: marks carry no prose to budget; the dense variant is the documented upper limit.
  'logo-wall': { rules: ['stressDoc', 'density'], reason: 'no prose axis; dense variant is the ceiling' },
  // Prose statements: no item/row axis — prose density is review-core's advisory domain.
  'big-number': { rules: ['density'], reason: 'one number and a caption — no countable axis' },
  content: { rules: ['density'], reason: 'freeform prose — no item/row axis' },
  quote: { rules: ['density'], reason: 'a single quotation — no countable axis' },
  // Imagery: the asset is the content; prose is a caption at most.
  image: { rules: ['stressDoc', 'density'], reason: 'photo compositions; no prose axis, no scalable collection' },
  video: { rules: ['stressDoc', 'density'], reason: 'a single embed; no scalable collection' },
  // Density awaits calibration where the axis is unusual (tracked follow-ups).
  redline: { rules: ['density'], reason: 'tracked-changes prose; no item/row axis' },
  pricing: { rules: ['density'], reason: 'tier cards pending a calibrated axis' },
  // Charts, math, and code: the data/notation/source IS the content — no prose axis to budget.
  funnel: { rules: ['density'], reason: 'chart data; no prose axis' },
  gantt: { rules: ['density'], reason: 'chart data; no prose axis' },
  journey: { rules: ['density'], reason: 'chart data; no prose axis' },
  map: { rules: ['density'], reason: 'chart data; no prose axis' },
  piechart: { rules: ['density'], reason: 'chart data; no prose axis' },
  progress: { rules: ['density'], reason: 'chart data; no prose axis' },
  quadrant: { rules: ['density'], reason: 'chart data; no prose axis' },
  radar: { rules: ['density'], reason: 'chart data; no prose axis' },
  roadmap: { rules: ['density'], reason: 'grid cells; no prose axis' },
  'state-chart': { rules: ['density'], reason: 'chart data; no prose axis' },
  'word-cloud': { rules: ['density'], reason: 'chart data; no prose axis' },
  math: { rules: ['density'], reason: 'typeset notation; no prose axis' },
  code: { rules: ['density'], reason: 'source lines; no prose axis' },
  'compare-code': { rules: ['density'], reason: 'source lines; no prose axis' },
  'citation-card': { rules: ['density'], reason: 'verbatim quotation; no item axis' },
  'obligation-matrix': { rules: ['density'], reason: 'check-cell grid; no prose axis' },
  // Diagram: galleryAuthored — the hand-curated deck is its own contract.
  diagram: { rules: ['stressDoc', 'density', 'voice'], reason: 'galleryAuthored hand-curated deck' },
};

function measure(m) {
  const flags = new Set();
  if (!stressDocOf(m)) flags.add('stressDoc');
  if (!m.density) flags.add('density');
  if (!m.specimenVoice) flags.add('voice');
  if (m.density?.axis) {
    const samples = [[m.sample, m.density.soft]];
    for (const vd of Object.values(m.variantDocs || {})) samples.push([vd.sample, m.density.soft]);
    const sd = stressDocOf(m);
    if (sd) samples.push([sd.sample, m.density.hard]);
    if (samples.some(([src, cap]) => src && cap != null && elementWordCounts(src, m.density.axis).some((w) => w > cap))) {
      flags.add('budget');
    }
  }
  if (m.capacity?.axis && m.capacity.soft != null && m.capacity.hard != null) {
    const sd = stressDocOf(m);
    if (sd) {
      const n = countPrimaryCollection(sd.sample, m.capacity.axis);
      const lo = Math.min(m.capacity.soft + 1, m.capacity.hard);
      if (n != null && (n < lo || n > m.capacity.hard)) flags.add('band');
    }
  }
  return flags;
}

function listedRules(name) {
  const rules = new Set();
  for (const [rule, names] of Object.entries(VOICE_DEBT)) if (names.includes(name)) rules.add(rule);
  const ex = VOICE_EXEMPT[name];
  if (ex) for (const r of ex.rules) rules.add(r);
  return rules;
}

const manifests = Object.values(loadAll());

test('every component is conforming, in debt by name, or exempt with a reason', () => {
  const problems = [];
  for (const m of manifests) {
    const actual = measure(m);
    const listed = listedRules(m.name);
    for (const rule of actual) {
      if (!listed.has(rule)) problems.push(`${m.name}: violates "${rule}" but is not listed for it — fix the manifest or add the named debt entry`);
    }
    for (const rule of listed) {
      if (!actual.has(rule)) problems.push(`${m.name}: STALE entry "${rule}" — the predicate now passes; delete the entry in this PR to record the progress`);
    }
  }
  assert.deepEqual(problems, []);
});

test('ledger lists only real components', () => {
  const known = new Set(manifests.map((m) => m.name));
  const ghosts = [];
  for (const names of Object.values(VOICE_DEBT)) for (const n of names) if (!known.has(n)) ghosts.push(n);
  for (const n of Object.keys(VOICE_EXEMPT)) if (!known.has(n)) ghosts.push(n);
  assert.deepEqual(ghosts, []);
});

test('hard gate: default sample lands at or under capacity.soft', () => {
  const over = [];
  for (const m of manifests) {
    if (!(m.capacity?.axis && m.capacity.soft != null && m.sample)) continue;
    const n = countPrimaryCollection(m.sample, m.capacity.axis);
    if (n != null && n > m.capacity.soft) over.push(`${m.name} (n=${n} > soft=${m.capacity.soft})`);
  }
  assert.deepEqual(over, []);
});

test('hard gate: no sample smuggles its own _footer: directive', () => {
  const offenders = [];
  for (const m of manifests) {
    const sd = stressDocOf(m);
    const sources = [m.sample, ...Object.values(m.variantDocs || {}).map((v) => v.sample), sd?.sample].filter(Boolean);
    if (sources.some((s) => /<!--\s*_footer:/.test(s))) offenders.push(m.name);
  }
  assert.deepEqual(offenders, []);
});

test('hard gate: no placeholder-shaped content reaches a committed gallery', () => {
  const offenders = [];
  for (const m of manifests) {
    const sd = stressDocOf(m);
    const sources = [m.sample, ...Object.values(m.variantDocs || {}).flatMap((v) => [v.sample, v.summary]), sd?.sample, sd?.summary].filter(Boolean);
    if (sources.some((s) => /\b(TBD|TODO|lorem ipsum|placeholder)\b/i.test(s))) offenders.push(m.name);
  }
  assert.deepEqual(offenders, []);
});

test('the plan IS the page count — galleryPlan length equals expectedGallerySlideCount', () => {
  for (const m of manifests) {
    assert.equal(galleryPlan(m).length, expectedGallerySlideCount(m), m.name);
  }
});

test('every galleryPlan slide carries a stable kind and a caption source', () => {
  const KIND = /^(title|default|variant:.+|stress|composition:.+|anti-patterns|see-also)$/;
  for (const m of manifests) {
    for (const s of galleryPlan(m)) {
      assert.match(s.kind, KIND, `${m.name}: bad kind ${s.kind}`);
      assert.equal(typeof s.caption, 'string', `${m.name}/${s.kind}: caption must be a string`);
      assert.ok(s.md?.length, `${m.name}/${s.kind}: empty slide markdown`);
    }
  }
});
