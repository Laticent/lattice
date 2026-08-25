/**
 * Deck scorecard — pure aggregation of the deterministic signals (lint-core
 * footguns + review-core suggestions + structural facts) into category scores and
 * TWO grades. No model: the numbers are grounded in the findings. Browser-safe,
 * fs-free.
 *
 * ## Two grades, not one — and why
 *
 * The previous single grade averaged three incommensurable kinds of judgment:
 *
 *   1. CONFORMANCE — does it render correctly? Objective, genre-independent.
 *   2. CRAFT — did the author do the work? Stubs, duplicate headings, placeholder
 *      titles, label headings, missing alt text. Near-objective, genre-independent.
 *   3. STYLE — does it match a house preference? Prose budgets, the ask, the
 *      agenda, heading length. GENRE-DEPENDENT and contested.
 *
 * Measured over the 197 committed decks, that average was not five categories in
 * balance; it was one category wearing five hats. Decomposing how much each
 * category actually MOVED the final number:
 *
 *   category    nominal weight    share of real variance
 *   Clarity         28.6%                 85.0%
 *   Structure       23.8%                 14.9%
 *   Pacing          19.0%                  0.1%     (100 on 196 of 197 decks)
 *   Contract        28.6%                  0.0%     (100 on all 197)
 *
 * So 47.6% of the nominal weight sat in two near-constants that graded nothing but
 * inflated everyone, and the grade was in practice a single variable — prose
 * density, correlation −0.41 against mean words per slide. A letter derived that
 * way reports "how closely does this match one genre's terseness" while claiming to
 * report quality. Two shipped teaching decks scored C+, the joint lowest in the
 * repository, with zero lint findings and zero craft findings against them.
 *
 * Splitting them fixes the category error rather than re-tuning it:
 *
 *   · CRAFT is profile-BLIND. Same bar for every deck, every genre, forever.
 *   · STYLE is measured against the deck's PROFILE (lib/authoring/deck-profiles.js)
 *     and is always reported WITH the profile name, so it reads as what it is — fit
 *     against a declared genre, not a verdict on worth.
 *
 * ## What a grade means here
 *
 * Both grades measure the ABSENCE of detected problems, not the presence of
 * brilliance — a clean deck can still be dull, and nothing in this file can tell the
 * difference. That is why the bands are named for what was found rather than for
 * excellence, and why `summary` says "no issues found" rather than "excellent".
 * Categories with nothing to score (Data on a deck with no data slides) are `na` and
 * drop out, so a text-only deck is not handed a free A.
 *
 * See engineering/decisions/2026-08-25-deck-profiles-craft-style-split.md.
 */

const { splitTopLevel } = require('./slide-split');
// BOTH directive forms, resolved the way the engine resolves them — a running
// global `<!-- class: … -->` was invisible to the `_class:`-only regex this
// replaces. See lib/core/class-directive-scan.mjs.
const { slideClassDirectives } = require('../core/class-directive-scan.mjs');
const { resolveProfile } = require('./deck-profiles');

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

/**
 * Deduct a RATE, not a raw count, and cap it.
 *
 * The defect this replaces: `clarity -= walls * 12`, uncapped and blind to deck
 * length. Nine dense slides on a twelve-slide deck took 108 points off a 100-point
 * category, so the category clamped to 0 — and having clamped, it stopped
 * discriminating entirely. A deck 20% over budget on nine slides and a genuinely
 * unreadable deck scored identically, and the floor was reachable by any deck long
 * enough, however good.
 *
 * A rate over the scorable population, times a ceiling, is bounded by construction:
 * every slide affected costs the full `max`, and no rule family can ever consume the
 * whole category on its own.
 *
 * The rate is curved (√) rather than linear, and that is not decoration. Real decks
 * cluster at LOW finding rates — one or two slides out of twenty — so a linear rate
 * puts almost every deck within a couple of points of a perfect score and the grade
 * stops discriminating at exactly the density where the population lives. Measured
 * on the corpus, linear left 133 of 197 decks at exactly 100 Craft (sd 2.2): the
 * mirror image of the uncapped bug it replaced, saturating at the top instead of the
 * bottom. √ spreads the low end where the decks are — one slide in twenty costs 22%
 * of the ceiling, one in four costs half — while staying bounded and monotonic.
 *
 * @param {number} hits   findings of this family
 * @param {number} over   the population they could have fired on (slides, headings)
 * @param {number} max    the most this family may ever cost
 */
function ratePenalty(hits, over, max) {
  if (!hits) return 0;
  const denom = Math.max(1, over);
  const rate = Math.min(1, hits / denom);
  return Math.min(max, Math.sqrt(rate) * max);
}

// Deck shape parsed once: slide list, class tokens per slide, content count.
function parseDeckShape(source) {
  const slides = splitTopLevel(source);
  const directives = slideClassDirectives(source);
  const tokensPer = slides.map((_s, i) => (directives[i]?.payload || '').trim().split(/\s+/).filter(Boolean));
  const has = (name) => tokensPer.some((t) => t.includes(name));
  // Skip the front-matter chunks ("" + the YAML) when counting content slides,
  // so the count drives the structural thresholds honestly.
  const start = /^\s*---\s*\r?\n/.test(source) ? 2 : 0;
  const contentSlides = slides.filter((s, i) => i >= start && s.trim()).length;
  const hasDataSlide = tokensPer.some((t) => DATA_LAYOUTS.has(t[0]));
  const componentNames = tokensPer.map((t) => t[0]).filter(Boolean);
  return { has, contentSlides, hasDataSlide, componentNames };
}

function countRule(arr, rule) { return arr.filter((f) => f.rule === rule).length; }
/**
 * Findings of `rule` that the resolved profile actually GRADES. review-core stamps
 * `scored:false` on the two genre-relative structural rules when the profile does
 * not grade them; they stay in the findings list as advice either way. Absent flag
 * means scored, so every other rule is unaffected.
 */
function countScored(arr, rule) { return arr.filter((f) => f.rule === rule && f.scored !== false).length; }

// ── CRAFT ────────────────────────────────────────────────────────────────────
// Profile-BLIND by construction. Nothing in this half may read the profile: these
// are defects in every genre, and a profile is a different bar, never a lower one.

/** Did the deck get built as a deck — opening, close, no stubs, no duplicates? */
function scoreStructure(shape, review) {
  let structure = 100;
  const notes = [];
  if (!shape.has('title')) { structure -= 25; notes.push('no opening / title slide'); }
  if (shape.contentSlides >= 3 && !shape.has('closing')) { structure -= 15; notes.push('no closing slide'); }
  const stubs = countRule(review, 'stub-slide');
  const dups = countRule(review, 'duplicate-heading');
  const titleGaps = countRule(review, 'title-incomplete');
  const n = shape.contentSlides;
  structure -= ratePenalty(stubs, n, 30) + ratePenalty(dups, n, 24) + ratePenalty(titleGaps, n, 20);
  if (stubs) notes.push(`${stubs} stub slide${plural(stubs)}`);
  if (dups) notes.push(`${dups} duplicate heading${plural(dups)}`);
  if (titleGaps) notes.push(`${titleGaps} title slide gap${plural(titleGaps)}`);
  return { score: structure, notes };
}

/** Are the words themselves done well — real headings, readable lines, alt text? */
function scoreCraftProse(shape, review) {
  let craft = 100;
  const notes = [];
  const labels = countRule(review, 'label-title');
  const monotone = countRule(review, 'monotone-openings');
  const poss = countRule(review, 'possessive-stacking');
  const noAlt = countRule(review, 'image-no-alt');
  const n = shape.contentSlides;
  craft -= ratePenalty(labels, n, 34) + ratePenalty(poss, n, 12) + ratePenalty(noAlt, n, 14);
  if (monotone) { craft -= 12; notes.push('monotone heading cadence'); }
  if (labels) notes.push(`${labels} label title${plural(labels)}`);
  if (poss) notes.push(`${poss} hard-to-read line${plural(poss)}`);
  if (noAlt) notes.push(`${noAlt} image${plural(noAlt)} missing alt text`);
  return { score: craft, notes };
}

/** Lint footguns (things that render wrong). */
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

// ── STYLE ────────────────────────────────────────────────────────────────────
// Genre-relative. Every number these read comes from the resolved profile.

/** Brevity against THIS genre's budget — density and heading length. */
function scoreBrevity(shape, review) {
  let brevity = 100;
  const notes = [];
  const walls = countRule(review, 'wall-of-text');
  const longH = countRule(review, 'long-heading');
  const crowd = countRule(review, 'density-crowd');
  const overflow = countRule(review, 'density-overflow');
  const n = shape.contentSlides;
  // `density-*` and the verbose-chrome family used to be SURFACED to the author and
  // then silently ignored by the grade, while `wall-of-text` — which measures nearly
  // the same thing — cost 12 uncapped points. `density-crowd` alone fires on 43% of
  // decks. Either they count or they do not; they count, at a weight that reflects
  // that they are a softer signal than a whole-slide overrun.
  brevity -= ratePenalty(walls, n, 34) + ratePenalty(longH, n, 20) +
    ratePenalty(overflow, n, 14) + ratePenalty(crowd, n, 8);
  if (walls) notes.push(`${walls} slide${plural(walls)} over the prose budget`);
  if (longH) notes.push(`${longH} over-long heading${plural(longH)}`);
  if (overflow || crowd) notes.push(`${overflow + crowd} crowded element${plural(overflow + crowd)}`);
  return { score: brevity, notes };
}

/** The genre-relative structural expectations — an ask, a roadmap. */
function scoreFraming(shape, review) {
  let framing = 100;
  const notes = [];
  const noAsk = shape.contentSlides >= 4 ? countScored(review, 'no-ask') : 0;
  const agendaMiss = countScored(review, 'agenda-missing');
  if (noAsk) { framing -= 30; notes.push('no clear ask'); }
  if (agendaMiss) { framing -= 18; notes.push('no agenda on a long deck'); }
  return { score: framing, notes };
}

// N/A when the deck has no data slides — don't gift a free A (caller decides).
function scoreData(shape, review) {
  let data = 100;
  const notes = [];
  const charts = countRule(review, 'chart-no-takeaway');
  const metricRef = countRule(review, 'metric-no-referent');
  const n = shape.contentSlides;
  data -= ratePenalty(charts, n, 40) + ratePenalty(metricRef, n, 30);
  if (charts) notes.push(`${charts} data slide${plural(charts)} without a takeaway`);
  if (metricRef) notes.push(`${metricRef} hero number${plural(metricRef)} without a referent`);
  return { score: data, notes };
}

/**
 * Pacing is scored ONLY when a talk length is known, or when the deck is long
 * enough that the length speaks for itself. It was previously a scored category
 * carrying 19% of the weight while reading 100 on 196 of 197 decks — pure ballast
 * that lifted every grade and graded nothing. `na` now, unless there is something
 * real to say.
 */
function scorePacing(shape, review) {
  const notes = [];
  if (countRule(review, 'length-vs-time')) return { score: 62, notes: ['too many slides for the time'] };
  if (shape.contentSlides > 40) {
    notes.push(`${shape.contentSlides} slides — very long for one sitting`);
    return { score: 78, notes };
  }
  return { score: null, na: true, notes: ['no talk length set — not scored'] };
}

/** Weighted mean over the categories that are actually scorable. */
function aggregate(categories, weights) {
  let tot = 0;
  let wsum = 0;
  for (const c of categories) {
    if (c.na || c.score == null) continue;
    tot += c.score * weights[c.key];
    wsum += weights[c.key];
  }
  return clamp(wsum ? tot / wsum : 100);
}

/**
 * @param {object} o
 * @param {string} o.source            deck markdown
 * @param {Array}  o.lintFindings      from lint-core (errors/warnings)
 * @param {Array}  o.reviewFindings    from review-core (suggestions)
 * @param {string} [o.profileOverride] a profile NAME chosen in the Coach
 * Returns { craft, style, profile, categories }, where craft/style are each
 * { score, band, summary } and `profile` is the resolved genre record + origin.
 */
function scoreDeck(o = {}) {
  const source = o.source || '';
  const lint = o.lintFindings || [];
  const review = o.reviewFindings || [];
  const shape = parseDeckShape(source);
  const resolved = resolveProfile({
    source,
    override: o.profileOverride,
    componentNames: shape.componentNames,
  });

  const structure = scoreStructure(shape, review);
  const craftProse = scoreCraftProse(shape, review);
  const contract = scoreContract(lint);
  const brevity = scoreBrevity(shape, review);
  const framing = scoreFraming(shape, review);
  const data = scoreData(shape, review);
  const pacing = scorePacing(shape, review);

  const categories = [
    { key: 'structure', half: 'craft', label: 'Structure', score: clamp(structure.score), notes: structure.notes },
    { key: 'craftProse', half: 'craft', label: 'Writing craft', score: clamp(craftProse.score), notes: craftProse.notes },
    { key: 'contract', half: 'craft', label: 'Contract', score: clamp(contract.score), notes: contract.notes },
    { key: 'brevity', half: 'style', label: 'Brevity', score: clamp(brevity.score), notes: brevity.notes },
    { key: 'framing', half: 'style', label: 'Framing', score: clamp(framing.score), notes: framing.notes },
    shape.hasDataSlide
      ? { key: 'data', half: 'style', label: 'Data', score: clamp(data.score), notes: data.notes }
      : { key: 'data', half: 'style', label: 'Data', score: null, na: true, notes: ['no data slides — not scored'] },
    pacing.na
      ? { key: 'pacing', half: 'style', label: 'Pacing', score: null, na: true, notes: pacing.notes }
      : { key: 'pacing', half: 'style', label: 'Pacing', score: clamp(pacing.score), notes: pacing.notes },
  ];

  // Contract leads Craft: a deck that renders wrong is broken in a way no amount of
  // good writing offsets. Brevity leads Style because it is the genre's loudest tell.
  const craftWeights = { structure: 1, craftProse: 1.1, contract: 1.3 };
  const styleWeights = { brevity: 1.2, framing: 1, data: 0.9, pacing: 0.6 };

  const craftScore = aggregate(categories.filter((c) => c.half === 'craft'), craftWeights);
  const styleScore = aggregate(categories.filter((c) => c.half === 'style'), styleWeights);

  // Named for what was FOUND, never for excellence — this file cannot see excellence.
  const summarize = (n) =>
    n >= 93 ? 'no issues found' : n >= 85 ? 'a few small things' : n >= 70 ? 'several things to fix' : 'a lot to fix';

  return {
    craft: { score: craftScore, band: band(craftScore), summary: summarize(craftScore) },
    style: { score: styleScore, band: band(styleScore), summary: summarize(styleScore) },
    profile: {
      key: resolved.key,
      label: resolved.profile.label,
      blurb: resolved.profile.blurb,
      origin: resolved.origin,
      declaredInvalid: resolved.declaredInvalid,
    },
    categories,
  };
}

module.exports = { scoreDeck, ratePenalty };
