/**
 * Deck scorecard — pure aggregation of the deterministic signals (lint-core
 * footguns + review-core suggestions + structural facts) into five category
 * scores and an overall grade. No model: the numbers are grounded in the
 * findings; Phase 2 layers a qualitative summary on top. Browser-safe, fs-free.
 *
 * Categories: Structure · Clarity · Data · Pacing · Contract.
 *
 * NOTE on what the grade means: it measures the ABSENCE of detected problems,
 * not the presence of brilliance — a clean deck can still be dull. Categories
 * with nothing to score (Data on a deck with no data slides) are marked `na`
 * and excluded from the overall, so a text-only deck isn't handed a free A.
 */

const { splitTopLevel } = require('./slide-split');

const CLASS_DIRECTIVE = /<!--\s*_class:\s*([^>]+?)\s*-->/;

// Layouts whose substance is data (chart + evidence buckets, plus the solo
// hero metric). Used only to decide whether Data is a scorable category — if a
// deck has none of these, Data is N/A rather than a free 100.
const DATA_LAYOUTS = new Set([
  'funnel', 'gantt', 'kanban', 'kpi', 'map', 'piechart', 'progress', 'quadrant',
  'radar', 'state-chart', 'stats', 'timeline-list', 'word-cloud', 'big-number',
]);

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const band = (n) =>
  n >= 93 ? 'A' : n >= 85 ? 'A−' : n >= 78 ? 'B+' : n >= 70 ? 'B' : n >= 62 ? 'C+' : n >= 55 ? 'C' : n >= 45 ? 'D' : 'F';
const plural = (n) => (n > 1 ? 's' : '');

// ── Per-category scorers ────────────────────────────────────────────────────
// Each takes what it reads and returns { score, notes } (score pre-clamp).
// scoreDeck() combines them with the weights below; the banner comments from
// the original single function became these names.

// Deck shape parsed once: slide list, class tokens per slide, content count.
function parseDeckShape(source) {
  const slides = splitTopLevel(source);
  const tokensPer = slides.map((s) => {
    const m = s.match(CLASS_DIRECTIVE);
    return m ? m[1].trim().split(/\s+/).filter(Boolean) : [];
  });
  const has = (name) => tokensPer.some((t) => t.includes(name));
  // Skip the front-matter chunks ("" + the YAML) when counting content slides,
  // so the count drives the structural thresholds honestly.
  const start = /^\s*---\s*\r?\n/.test(source) ? 2 : 0;
  const contentSlides = slides.filter((s, i) => i >= start && s.trim()).length;
  const hasDataSlide = tokensPer.some((t) => DATA_LAYOUTS.has(t[0]));
  return { has, contentSlides, hasDataSlide };
}

function countRule(arr, rule) { return arr.filter((f) => f.rule === rule).length; }

function scoreStructure(shape, review) {
  let structure = 100;
  const notes = [];
  if (!shape.has('title')) { structure -= 25; notes.push('no opening / title slide'); }
  if (shape.contentSlides >= 3 && !shape.has('closing')) { structure -= 15; notes.push('no closing slide'); }
  if (shape.contentSlides >= 4 && countRule(review, 'no-ask')) { structure -= 22; notes.push('no clear ask'); }
  const stubs = countRule(review, 'stub-slide');
  const dups = countRule(review, 'duplicate-heading');
  const agendaMiss = countRule(review, 'agenda-missing');
  const titleGaps = countRule(review, 'title-incomplete');
  structure -= stubs * 8 + dups * 8 + agendaMiss * 10 + titleGaps * 10;
  if (stubs) notes.push(`${stubs} stub slide${plural(stubs)}`);
  if (dups) notes.push(`${dups} duplicate heading${plural(dups)}`);
  if (agendaMiss) notes.push('no agenda on a long deck');
  if (titleGaps) notes.push(`${titleGaps} title slide gap${plural(titleGaps)}`);
  return { score: structure, notes };
}

function scoreClarity(review) {
  let clarity = 100;
  const notes = [];
  const labels = countRule(review, 'label-title');
  const walls = countRule(review, 'wall-of-text');
  const longH = countRule(review, 'long-heading');
  const monotone = countRule(review, 'monotone-openings');
  const poss = countRule(review, 'possessive-stacking');
  const noAlt = countRule(review, 'image-no-alt');
  clarity -= labels * 12 + walls * 12 + longH * 6 + monotone * 12 + poss * 5 + noAlt * 5;
  if (labels) notes.push(`${labels} label title${plural(labels)}`);
  if (walls) notes.push(`${walls} dense slide${plural(walls)}`);
  if (longH) notes.push(`${longH} over-long heading${plural(longH)}`);
  if (monotone) notes.push('monotone heading cadence');
  if (poss) notes.push(`${poss} hard-to-read line${plural(poss)}`);
  if (noAlt) notes.push(`${noAlt} image${plural(noAlt)} missing alt text`);
  return { score: clarity, notes };
}

// N/A when the deck has no data slides — don't gift a free A (caller decides).
function scoreData(review) {
  let data = 100;
  const notes = [];
  const charts = countRule(review, 'chart-no-takeaway');
  const metricRef = countRule(review, 'metric-no-referent');
  data -= charts * 20 + metricRef * 15;
  if (charts) notes.push(`${charts} data slide${plural(charts)} without a takeaway`);
  if (metricRef) notes.push(`${metricRef} hero number${plural(metricRef)} without a referent`);
  return { score: data, notes };
}

// Soft default once a deck is very long, even with no talk length.
function scorePacing(shape, review) {
  let pacing = 100;
  const notes = [];
  if (countRule(review, 'length-vs-time')) {
    pacing -= 28;
    notes.push('too many slides for the time');
  } else if (shape.contentSlides > 40) {
    pacing -= 20;
    notes.push(`${shape.contentSlides} slides — very long for one sitting`);
  }
  return { score: pacing, notes };
}

// Lint footguns (things that render wrong).
function scoreContract(lint) {
  let contract = 100;
  const notes = [];
  const errs = lint.filter((f) => f.severity === 'error').length;
  const warns = lint.filter((f) => f.severity === 'warning').length;
  contract -= errs * 22 + warns * 8;
  if (errs) notes.push(`${errs} authoring error${plural(errs)}`);
  if (warns) notes.push(`${warns} warning${plural(warns)}`);
  return { score: contract, notes };
}

/**
 * @param {object} o
 * @param {string} o.source            deck markdown
 * @param {Array}  o.lintFindings      from lint-core (errors/warnings)
 * @param {Array}  o.reviewFindings    from review-core (suggestions)
 * Returns { overall, band, categories:[{ key, label, score, na?, notes:[] }] }.
 */
function scoreDeck(o = {}) {
  const source = o.source || '';
  const lint = o.lintFindings || [];
  const review = o.reviewFindings || [];
  const shape = parseDeckShape(source);

  const structure = scoreStructure(shape, review);
  const clarity = scoreClarity(review);
  const data = scoreData(review);
  const pacing = scorePacing(shape, review);
  const contract = scoreContract(lint);

  const categories = [
    { key: 'structure', label: 'Structure', score: clamp(structure.score), notes: structure.notes },
    { key: 'clarity', label: 'Clarity', score: clamp(clarity.score), notes: clarity.notes },
    shape.hasDataSlide
      ? { key: 'data', label: 'Data', score: clamp(data.score), notes: data.notes }
      : { key: 'data', label: 'Data', score: null, na: true, notes: ['no data slides — not scored'] },
    { key: 'pacing', label: 'Pacing', score: clamp(pacing.score), notes: pacing.notes },
    { key: 'contract', label: 'Contract', score: clamp(contract.score), notes: contract.notes },
  ];

  // Weighted overall — clarity + contract matter most; N/A categories drop out.
  const weights = { structure: 1, clarity: 1.2, data: 0.8, pacing: 0.8, contract: 1.2 };
  let tot = 0;
  let wsum = 0;
  for (const c of categories) {
    if (c.na) continue;
    tot += c.score * weights[c.key];
    wsum += weights[c.key];
  }
  const overall = clamp(wsum ? tot / wsum : 100);

  return { overall, band: band(overall), categories };
}

module.exports = { scoreDeck };
