'use strict';
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
    'actors', 'authority-chain', 'big-number', 'cards-grid', 'checklist', 'citation-card',
    'closing', 'code', 'compare-code', 'compare-prose', 'compare-table', 'contact', 'content',
    'decision', 'diagram', 'divider', 'glossary', 'image', 'inventory', 'journey', 'kpi',
    'list', 'list-criteria', 'list-steps', 'list-tabular', 'logo-wall', 'math', 'matrix-2x2',
    'obligation-matrix', 'quote', 'redline', 'regulatory-update', 'roadmap', 'split-compare',
    'split-panel', 'stats', 'statute-stack', 'title', 'verdict-grid', 'video', 'wifi'
  ],
  density: [
    'big-number', 'citation-card', 'closing', 'code', 'compare-code', 'contact', 'content',
    'diagram', 'divider', 'funnel', 'gantt', 'image', 'journey', 'logo-wall', 'map', 'math',
    'obligation-matrix', 'piechart', 'pricing', 'progress', 'quadrant', 'quote', 'radar',
    'redline', 'roadmap', 'state-chart', 'title', 'video', 'wifi', 'word-cloud'
  ],
  voice: [
    'actors', 'agenda', 'authority-chain', 'big-number', 'cards-grid', 'cards-stack',
    'checklist', 'citation-card', 'closing', 'code', 'compare-code', 'compare-prose',
    'compare-table', 'contact', 'content', 'decision', 'diagram', 'divider', 'funnel', 'gantt',
    'glossary', 'image', 'inventory', 'journey', 'kanban', 'kpi', 'list', 'list-criteria',
    'list-steps', 'list-tabular', 'logo-wall', 'map', 'math', 'matrix-2x2',
    'obligation-matrix', 'piechart', 'pricing', 'progress', 'q-and-a', 'quadrant', 'quote',
    'radar', 'redline', 'regulatory-update', 'roadmap', 'split-compare', 'split-panel',
    'state-chart', 'stats', 'statute-stack', 'timeline-list', 'title', 'verdict-grid', 'video',
    'wifi', 'word-cloud'
  ],
  budget: [
    'actors', 'cards-grid', 'cards-stack', 'compare-prose', 'decision', 'glossary', 'kanban',
    'kpi', 'list', 'list-criteria', 'list-steps', 'list-tabular', 'matrix-2x2', 'q-and-a',
    'split-compare', 'split-panel', 'statute-stack', 'timeline-list', 'verdict-grid'
  ],
  band: [
    'agenda', 'kanban', 'q-and-a'
  ],
};

// Components that genuinely cannot carry a rule, each with a one-line reason.
// Stale-entry-fails applies here too: an exemption for a component that now
// passes (or that names a rule it no longer needs) must be deleted.
const VOICE_EXEMPT = {
  // name: { rules: ['density'], reason: 'no countable axis' },
};

function measure(m) {
  const flags = new Set();
  if (!stressDocOf(m)) flags.add('stressDoc');
  if (!m.density) flags.add('density');
  if (!m.specimenVoice) flags.add('voice');
  if (m.density && m.density.axis) {
    const samples = [[m.sample, m.density.soft]];
    for (const vd of Object.values(m.variantDocs || {})) samples.push([vd.sample, m.density.soft]);
    const sd = stressDocOf(m);
    if (sd) samples.push([sd.sample, m.density.hard]);
    if (samples.some(([src, cap]) => src && cap != null && elementWordCounts(src, m.density.axis).some((w) => w > cap))) {
      flags.add('budget');
    }
  }
  if (m.capacity && m.capacity.axis && m.capacity.soft != null && m.capacity.hard != null) {
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
    if (!(m.capacity && m.capacity.axis && m.capacity.soft != null && m.sample)) continue;
    const n = countPrimaryCollection(m.sample, m.capacity.axis);
    if (n != null && n > m.capacity.soft) over.push(`${m.name} (n=${n} > soft=${m.capacity.soft})`);
  }
  assert.deepEqual(over, []);
});

test('hard gate: no sample smuggles its own _footer: directive', () => {
  const offenders = [];
  for (const m of manifests) {
    const sd = stressDocOf(m);
    const sources = [m.sample, ...Object.values(m.variantDocs || {}).map((v) => v.sample), sd && sd.sample].filter(Boolean);
    if (sources.some((s) => /<!--\s*_footer:/.test(s))) offenders.push(m.name);
  }
  assert.deepEqual(offenders, []);
});

test('hard gate: no placeholder-shaped content reaches a committed gallery', () => {
  const offenders = [];
  for (const m of manifests) {
    const sd = stressDocOf(m);
    const sources = [m.sample, ...Object.values(m.variantDocs || {}).flatMap((v) => [v.sample, v.caption]), sd && sd.sample, sd && sd.caption].filter(Boolean);
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
      assert.ok(s.md && s.md.length, `${m.name}/${s.kind}: empty slide markdown`);
    }
  }
});
