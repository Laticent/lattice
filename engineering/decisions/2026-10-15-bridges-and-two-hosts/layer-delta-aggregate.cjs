// Folds the per-deck lines layer-delta-census.cjs writes into layer-delta-results.json.
//   node <this file> <delta-*.jsonl>… [--out=<file.json>]
// Run from the repo root; no dependencies. The result has four parts:
//   decks      one row per deck: elements, D vs C (layering's delta), C vs C0 and D vs C0 (the
//              de-bump experiment), elements with a direct flip, seconds per phase
//   summary    totals over the example decks (the gallery baseline is reported apart)
//   migration  the flips grouped so the shape of the work shows: by property family and the pair
//              of source files (today's winner → the layered winner), and by selector pair
//   tax        item (a): the specificity-tax walk summed over every deck
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const out = (args.find((a) => a.startsWith('--out=')) || '--out=engineering/decisions/2026-10-15-bridges-and-two-hosts/layer-delta-results.json').slice(6);
const rows = args.filter((a) => !a.startsWith('--')).flatMap((f) => fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)));
// The last line per deck wins (a rerun appends).
const byDeck = new Map(); for (const r of rows) byDeck.set(r.deck, r);
const all = [...byDeck.values()].sort((a, b) => a.deck.localeCompare(b.deck));

/** Collapse longhands into the family an author writes: padding-top → padding, border-left-color → border-color. */
function family(prop) {
  const m = prop.match(/^(::\w+)?(.*)$/); const pe = m[1] || ''; let p = m[2];
  if (p.startsWith('--')) return pe + p;
  p = p.replace(/^(padding|margin|inset|scroll-padding|scroll-margin)-(top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end)$/, '$1')
    .replace(/^border-(top|right|bottom|left|block|inline|block-start|block-end|inline-start|inline-end)-(color|style|width)$/, 'border-$2')
    .replace(/^border-(top|bottom|start|end)-(left|right|start|end)-radius$/, 'border-radius')
    .replace(/^(top|right|bottom|left)$/, 'inset')
    .replace(/^(row-gap|column-gap)$/, 'gap')
    .replace(/^(width|inline-size)$/, 'width').replace(/^(height|block-size)$/, 'height');
  return pe + p;
}
const inc = (o, k, v = 1) => { o[k] = (o[k] || 0) + v; };

const decks = all.map((r) => ({
  deck: r.deck, palette: r.palette, elements: r.elements, DvsC: r.DvsC, CvsC0: r.CvsC0, DvsC0: r.DvsC0,
  elementsWithFlip: r.changed ? r.changed.filter((c) => c.flips.length).length : (r.DvsC === 0 ? 0 : undefined),
  changedTruncated: r.changedTruncated, seconds: r.tTotal && { render: Math.round(r.tRender / 1000), census: Math.round(r.tCensus / 1000), attribution: Math.round((r.tAttribution || 0) / 1000), tax: Math.round((r.tTax || 0) / 1000) },
  ...(r.error ? { error: r.error } : {}), ...(r.skipped ? { skipped: r.skipped } : {}), ...(r.elementCountMismatch ? { elementCountMismatch: r.elementCountMismatch } : {}),
}));

const examples = all.filter((r) => r.deck.startsWith('examples/'));
const ok = examples.filter((r) => r.elements != null && !r.error);
const sum = (xs, f) => xs.reduce((s, x) => s + (f(x) || 0), 0);
const summary = {
  exampleDecks: examples.length,
  measured: ok.length,
  skipped: examples.filter((r) => r.skipped).map((r) => ({ deck: r.deck, why: r.skipped })),
  errors: examples.filter((r) => r.error).map((r) => ({ deck: r.deck, error: r.error })),
  elements: sum(ok, (r) => r.elements),
  changedElements_DvsC: sum(ok, (r) => r.DvsC),
  decksWithZeroChanges: ok.filter((r) => r.DvsC === 0).length,
  decksWithChanges: ok.filter((r) => r.DvsC > 0).length,
  elementsWithDirectFlip: sum(ok, (r) => (r.changed ? r.changed.filter((c) => c.flips.length).length : 0)),
  experiment: { CvsC0_total: sum(ok, (r) => r.CvsC0), decksWhereDebumpMatters: ok.filter((r) => r.CvsC0 > 0).map((r) => ({ deck: r.deck, CvsC0: r.CvsC0 })), DvsC0_total: sum(ok, (r) => r.DvsC0) },
  secondsSummed: { render: Math.round(sum(ok, (r) => r.tRender) / 1000), census: Math.round(sum(ok, (r) => r.tCensus) / 1000), attribution: Math.round(sum(ok, (r) => r.tAttribution) / 1000), tax: Math.round(sum(ok, (r) => r.tTax) / 1000) },
  top20Decks: [...ok].sort((a, b) => b.DvsC - a.DvsC).slice(0, 20).map((r) => ({ deck: r.deck, DvsC: r.DvsC, of: r.elements })),
};

// ── Migration shape ──
function migration(rs) {
  const byFamilyFiles = {}, byFiles = {}, bySelectors = {}, byFamily = {};
  const elsFF = {}, elsF = {}, elsS = {}, elsFam = {};
  for (const r of rs) for (const c of r.changed || []) {
    const seen = { ff: new Set(), f: new Set(), s: new Set(), fam: new Set() };
    for (const f of c.flips) {
      const fam = family(f.prop);
      const ff = `${fam} | ${f.D.src} → ${f.C.src}`, fp = `${f.D.src} → ${f.C.src}`, sp = `${f.D.sel} ⟶ ${f.C.sel}`;
      inc(byFamilyFiles, ff); inc(byFiles, fp); inc(bySelectors, sp); inc(byFamily, fam);
      seen.ff.add(ff); seen.f.add(fp); seen.s.add(sp); seen.fam.add(fam);
    }
    for (const k of seen.ff) inc(elsFF, k); for (const k of seen.f) inc(elsF, k); for (const k of seen.s) inc(elsS, k); for (const k of seen.fam) inc(elsFam, k);
  }
  const top = (o, els, n) => Object.entries(els).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, e]) => ({ key: k, elements: e, propertyFlips: o[k] }));
  const winnerFiles = {}; for (const [k, v] of Object.entries(elsF)) inc(winnerFiles, k.split(' → ')[0], v);
  const loserFiles = {}; for (const [k, v] of Object.entries(elsF)) inc(loserFiles, k.split(' → ')[1], v);
  return {
    note: 'A flip is a property whose winning rule differs between today (D) and layered (C) on one element. "elements" counts elements with at least one flip of that key.',
    byPropertyFamilyAndFiles: top(byFamilyFiles, elsFF, 40), byFilePair: top(byFiles, elsF, 40), bySelectorPair: top(bySelectors, elsS, 30), byPropertyFamily: top(byFamily, elsFam, 30),
    todayWinnerFile: Object.entries(winnerFiles).sort((a, b) => b[1] - a[1]).slice(0, 25), layeredWinnerFile: Object.entries(loserFiles).sort((a, b) => b[1] - a[1]).slice(0, 25),
  };
}

// ── Item (a) ──
function tax(rs) {
  const t = { instances: { specDecided: {}, bumpNecessary: {}, loweringNecessary: {} }, distinctRulePairs: { specDecided: {}, bumpNecessary: {}, loweringNecessary: {} }, byFilePair: { specDecided: {}, bumpNecessary: {}, loweringNecessary: {} }, bumpedRulesMatched: new Set(), loweredRulesMatchedMaxPerDeck: 0, bumpedRulesWinning: {}, sanity: { orderViolations: 0, specChecked: 0, specMismatch: 0 }, decks: 0 };
  const bumpedClass = new Map();
  for (const r of rs) {
    if (!r.tax) continue; t.decks++;
    for (const k of Object.keys(t.instances)) for (const [c, v] of Object.entries(r.tax.instances[k] || {})) inc(t.instances[k], c, v);
    for (const k of Object.keys(t.distinctRulePairs)) for (const [c, v] of Object.entries(r.tax.distinctRulePairs[k] || {})) inc(t.distinctRulePairs[k], c, v);
    for (const k of Object.keys(t.byFilePair)) for (const [c, v] of Object.entries(r.tax.byFilePair?.[k] || {})) inc(t.byFilePair[k], c, v);
    for (const id of r.tax.coverage?.bumpedRulesMatched || []) t.bumpedRulesMatched.add(id);
    t.loweredRulesMatchedMaxPerDeck = Math.max(t.loweredRulesMatchedMaxPerDeck, r.tax.coverage?.loweredRulesMatched || 0);
    for (const b of r.tax.bumpedRulesSeen) { const key = `${b.src} :: ${b.sel}`; if (!bumpedClass.has(key)) bumpedClass.set(key, new Set()); for (const c of b.neededAgainst) bumpedClass.get(key).add(c); }
    for (const k of Object.keys(t.sanity)) t.sanity[k] += r.tax.sanity[k] || 0;
  }
  // Distinct pairs above are summed per deck, so a pair seen on two decks counts twice; say so.
  const cls = {}; for (const [, cats] of bumpedClass) inc(cls, [...cats].sort().join(' + ') || 'bump never needed on the DOM measured');
  const sortFP = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => { const [cat, w, x] = k.split('|'); return { cat, winnerFile: w, loserFile: x, instances: v }; });
  return {
    decks: t.decks, instances: t.instances, distinctRulePairsSummedPerDeck: t.distinctRulePairs,
    bumpedSelectorsWinningSomewhere: bumpedClass.size, bumpedSelectorsByWhatTheBumpWasNeededAgainst: cls,
    bumpedRulesMatchedAnywhere: t.bumpedRulesMatched.size,
    topFilePairs: { specDecided: sortFP(t.byFilePair.specDecided), bumpNecessary: sortFP(t.byFilePair.bumpNecessary), loweringNecessary: sortFP(t.byFilePair.loweringNecessary) },
    sanity: t.sanity,
  };
}

const gallery = all.find((r) => r.deck.endsWith('baseline-decks/gallery.md'));
const result = {
  measuredAt: { commit: require('node:child_process').execSync('git rev-parse --short HEAD').toString().trim(), date: new Date().toISOString().slice(0, 10) },
  method: 'layer-delta-census.cjs: Marp bundle through its own marp.config.cjs, runtime loaded and settled, screen media, Playwright Chromium 1194; D = today, C = layered then flattened (equals the reference A, §3.1), C0 = C with every specificity bump removed before flattening.',
  summary, gallery: gallery && { elements: gallery.elements, DvsC: gallery.DvsC, CvsC0: gallery.CvsC0, DvsC0: gallery.DvsC0, elementsWithFlip: gallery.changed?.filter((c) => c.flips.length).length, tax: gallery.tax && { instances: gallery.tax.instances, distinctRulePairs: gallery.tax.distinctRulePairs, coverage: { bumpedRulesMatched: gallery.tax.coverage?.bumpedRulesMatched?.length, loweredRulesMatched: gallery.tax.coverage?.loweredRulesMatched }, bumpNecessaryPairs: gallery.tax.bumpNecessaryPairs, loweringNecessaryPairs: gallery.tax.loweringNecessaryPairs?.slice(0, 15), sanity: gallery.tax.sanity }, migration: migration([gallery]) },
  migration: migration(ok), tax: tax(ok), decks,
};
fs.writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
console.log(JSON.stringify({ summary: { ...summary, top20Decks: undefined, skipped: summary.skipped.length, errors: summary.errors.length, experiment: { ...summary.experiment, decksWhereDebumpMatters: summary.experiment.decksWhereDebumpMatters.length } }, gallery: result.gallery && { DvsC: result.gallery.DvsC, CvsC0: result.gallery.CvsC0 } }, null, 1));
void path;
