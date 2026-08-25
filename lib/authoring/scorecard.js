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
 * Measured over the committed decks, that average was not five categories in
 * balance; it was one category wearing five hats. Decomposing how much each
 * category actually MOVED the final number:
 *
 *   category    nominal weight    share of real variance
 *   Clarity         28.6%                 85.0%
 *   Structure       23.8%                 14.9%
 *   Pacing          19.0%                  0.1%     (100 on 196 of 197 decks)
 *   Contract        28.6%                  0.0%     (100 on all 198)
 *
 * READ THE CONTRACT ROW CORRECTLY — it is the one number in this table that does
 * NOT mean what it appears to. An earlier draft of this docblock added the bottom
 * two rows together and concluded that "47.6% of the weight graded nothing". That
 * is wrong about Contract, and the error is a sampling artifact:
 *
 *   · Contract's INPUT is lint findings. `npm run lint:deck:all` is
 *     `--all --strict`, and `--strict` fails on a WARNING as well as an error
 *     (tools/lint-deck.js). It gates CI (.github/workflows/ci.yml) and pre-push
 *     (lefthook.yml). So a deck carrying any lint finding CANNOT BE COMMITTED, and
 *     Contract is pinned to 100 on the corpus BY CONSTRUCTION — measured: 0 findings
 *     across all 198 committed decks AND all 164 historical revisions of them.
 *   · Style's input is REVIEW findings, and `doReview` is off under `--all`, so
 *     those are not gated. That asymmetry is the whole reason Style varies on the
 *     same corpus that pins Contract flat.
 *
 * The corpus therefore cannot answer whether Contract discriminates; it can only
 * report the gate. On the population this scorer ACTUALLY runs against — a draft in
 * the Studio editor, re-scored on every keystroke — it does discriminate. Driven on
 * the real Studio Coach: a half-typed class name reads 93, an unterminated comment
 * 72, against 100 for the finished deck. The OLD scorer's `errs*22 + warns*8` moved
 * on the same drafts (92 / 78), so Contract was never dead weight in either grade.
 *
 * What WAS dead weight is Pacing alone — 19.0%, not 47.6% — and it is now `na`
 * unless a talk length is known. The rest of the diagnosis stands on its own: the
 * grade was in practice a single variable — prose density, correlation −0.41
 * against mean words per slide. A letter derived that way reports "how closely does
 * this match one genre's terseness" while claiming to report quality. Two shipped
 * teaching decks scored C+, the joint lowest in the repository, with zero lint
 * findings and zero craft findings against them.
 *
 * This correction is also why capping Contract matters rather than being tidiness:
 * a category that genuinely varies on drafts was the one left uncapped, so thirteen
 * warnings floored it and 20 versus 60 were indistinguishable exactly where the
 * variance actually lives.
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

/** The most one whole-slide prose overrun family may cost Brevity. */
const SEVERE_BREVITY_MAX = 44;
/** The most ALL cosmetic overruns TOGETHER may cost Brevity. Strictly below
 *  `SEVERE_BREVITY_MAX` by construction — a test pins the inequality, because it is the
 *  thing that stops nits outranking walls of text. */
const SOFT_BREVITY_CAP = 26;

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const band = (n) =>
  n >= 93 ? 'A' : n >= 85 ? 'A−' : n >= 78 ? 'B+' : n >= 70 ? 'B' : n >= 62 ? 'C+' : n >= 55 ? 'C' : n >= 45 ? 'D' : 'F';
const plural = (n) => (n > 1 ? 's' : '');

/**
 * Deduct a bounded, SATURATING amount for `hits` findings of one family.
 *
 * `max · hits / (hits + k)` — monotonic, bounded by `max`, and it never reaches
 * it. One hit costs 25% of the ceiling at k = 3, two 40%, five 62%, twenty 87%.
 *
 * Two defects are designed out, both measured on the corpus:
 *
 * 1. THE UNCAPPED COUNT this replaces (`clarity -= walls * 12`) let nine dense
 *    slides take 108 points off a 100-point category. Having clamped at 0 the
 *    category stopped discriminating: a deck 20% over budget and an unreadable
 *    one scored the same, and the floor was reachable by any deck long enough.
 *
 * 2. THE RATE that briefly replaced it (`√(hits/slides) · max`) fixed the floor
 *    and bought two worse bugs, because a denominator is a lever:
 *      · PADDING RAISED SCORES. Six bloated slides scored Style 83; the same six
 *        plus thirty empty ones scored 92. A category named Brevity rewarded
 *        adding slides.
 *      · A DENOMINATOR OF 1. `splitTopLevel` cannot see through `split: headings`,
 *        so the shipped `examples/split-headings.md` — 7 rendered pages — counted
 *        as ONE content slide, and its first finding cost the entire ceiling
 *        (Style 97 → 81, a self-inflicted regression on committed content).
 *
 * There is no denominator here, so neither is reachable. That is the right shape
 * on the merits too: two stub slides are two stub slides whether the deck is four
 * slides or forty, and the old count-based scorer had that part right.
 *
 * KNOWN LIMIT, stated rather than papered over: `wall-of-text` is boolean per
 * slide, so 24 slides at 85 words and 24 at 110 produce the same 24 findings and
 * the same deduction. The grade discriminates in HOW MANY slides overrun, never
 * in how far. The pre-change scorer had the identical blind spot (both clamped to
 * 0), so this is a limit carried forward, not a regression — fixing it needs the
 * finding to carry its overage, which is a change to review-core's contract.
 *
 * @param {number} hits findings of this family
 * @param {number} max  the most this family may ever cost
 * @param {number} [k]  hits at which half of `max` is spent (default 3)
 */
function saturate(hits, max, k = 3) {
  if (!hits || hits < 0) return 0;
  return (max * hits) / (hits + k);
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
  return { has, contentSlides, hasDataSlide };
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
  structure -= saturate(stubs, 34) + saturate(dups, 26) + saturate(titleGaps, 22);
  if (stubs) notes.push(`${stubs} stub slide${plural(stubs)}`);
  if (dups) notes.push(`${dups} duplicate heading${plural(dups)}`);
  if (titleGaps) notes.push(`${titleGaps} title slide gap${plural(titleGaps)}`);
  return { score: structure, notes };
}

/** Are the words themselves done well — real headings, readable lines, alt text? */
function scoreCraftProse(review) {
  let craft = 100;
  const notes = [];
  const labels = countRule(review, 'label-title');
  const monotone = countRule(review, 'monotone-openings');
  const poss = countRule(review, 'possessive-stacking');
  const noAlt = countRule(review, 'image-no-alt');
  craft -= saturate(labels, 38) + saturate(poss, 14) + saturate(noAlt, 16);
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
  // Rate-capped like every other family. This read `errs * 22 + warns * 8`,
  // uncapped, through three review passes: thirteen warnings floored it and 20 vs
  // 60 were indistinguishable, in the ONE Craft category that varies on a real
  // (un-linted) draft — the exact saturation bug this file was rewritten to end,
  // preserved in the category carrying the largest weight in the half.
  // Errors get the steeper ceiling: a deck that renders wrong is broken in a way
  // no amount of good writing offsets, and "many" really is much worse than "a few".
  contract -= saturate(errs, 85, 2) + saturate(warns, 40, 5);
  if (errs) notes.push(`${errs} authoring error${plural(errs)}`);
  if (warns) notes.push(`${warns} warning${plural(warns)}`);
  return { score: contract, notes };
}

// ── STYLE ────────────────────────────────────────────────────────────────────
// Genre-relative. Every number these read comes from the resolved profile.

/** Brevity against THIS genre's budget — density and heading length. */
function scoreBrevity(review) {
  let brevity = 100;
  const notes = [];
  const walls = countRule(review, 'wall-of-text');
  const longH = countRule(review, 'long-heading');
  const crowd = countRule(review, 'density-crowd');
  const overflow = countRule(review, 'density-overflow');
  // The verbose-chrome family (eyebrow / subtitle / key-insight over budget). The
  // changelog, the decision record and the docblock below all CLAIMED these were
  // already scored; none of them were read here, so the sentence announcing the
  // fix was itself the defect. They are a soft signal, so they carry the smallest
  // ceiling — but they count, which is what was promised.
  const verbose = review.filter((f) => typeof f.rule === 'string' && f.rule.startsWith('verbose-')).length;
  // `density-*` and the verbose-chrome family used to be SURFACED to the author and
  // then silently ignored by the grade, while `wall-of-text` — which measures nearly
  // the same thing — cost 12 uncapped points. `density-crowd` alone fires on 43% of
  // decks. Either they count or they do not; they count, at a weight that reflects
  // that they are a softer signal than a whole-slide overrun.
  // SEVERE vs SOFT, and the group cap is the whole point.
  //
  // A red team broke the previous arrangement by ADDING UP COSMETICS. The four soft
  // families' ceilings summed to 24+16+10+8 = 58, above `wall-of-text`'s 40, and three
  // of them can co-fire on ONE slide while `wall-of-text` fires at most once. So a deck
  // of 220-word walls scored brevity 68 while a deck INSIDE the 70-word budget carrying
  // only nits scored 62 — the 2.5x-longer deck ranked higher in a category named
  // Brevity. That is the same inversion the denominator fix was done to remove, arriving
  // through a different door.
  //
  // The soft families are therefore capped AS A GROUP, strictly below the severe
  // ceiling: no accumulation of long headings, crowded elements and verbose chrome can
  // ever cost as much as slides that genuinely overrun their prose budget.
  brevity -= saturate(walls, SEVERE_BREVITY_MAX);
  brevity -= Math.min(
    SOFT_BREVITY_CAP,
    saturate(longH, 20) + saturate(overflow, 14) + saturate(crowd, 10) + saturate(verbose, 8),
  );
  if (walls) notes.push(`${walls} slide${plural(walls)} over the prose budget`);
  if (longH) notes.push(`${longH} over-long heading${plural(longH)}`);
  if (overflow || crowd) notes.push(`${overflow + crowd} crowded element${plural(overflow + crowd)}`);
  if (verbose) notes.push(`${verbose} over-long label${plural(verbose)}`);
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
function scoreData(review) {
  let data = 100;
  const notes = [];
  const charts = countRule(review, 'chart-no-takeaway');
  const metricRef = countRule(review, 'metric-no-referent');
  data -= saturate(charts, 44) + saturate(metricRef, 34);
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
  const resolved = resolveProfile({ source, override: o.profileOverride });

  const structure = scoreStructure(shape, review);
  const craftProse = scoreCraftProse(review);
  const contract = scoreContract(lint);
  const brevity = scoreBrevity(review);
  const framing = scoreFraming(shape, review);
  const data = scoreData(review);
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
  //
  // `found` gates the top band. The threshold alone is ~1.5 findings of slack, so
  // "no issues found" was rendered for NINE committed decks that carry live scored
  // findings — `portrait-prose-deboost.md` with five — five pixels above the findings
  // list contradicting it. A summary that says nothing was found while the panel lists
  // what was found is false on its face, whatever the arithmetic behind it.
  const summarize = (n, found) =>
    n >= 93 && !found ? 'no issues found'
      : n >= 93 ? 'nothing significant found'
      : n >= 85 ? 'a few small things'
      : n >= 70 ? 'several things to fix'
      : 'a lot to fix';

  // Did this half actually deduct anything? Read it off the category notes rather than
  // re-deriving from the findings list: the notes are what the panel renders, so the
  // summary can never disagree with the rows beneath it.
  const foundIn = (half) => categories.some((c) => c.half === half && !c.na && c.score < 100);

  return {
    craft: { score: craftScore, band: band(craftScore), summary: summarize(craftScore, foundIn('craft')) },
    style: { score: styleScore, band: band(styleScore), summary: summarize(styleScore, foundIn('style')) },
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

module.exports = { scoreDeck, saturate, SEVERE_BREVITY_MAX, SOFT_BREVITY_CAP };
