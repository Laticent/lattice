#!/usr/bin/env node
/**
 * Score variance — which scorecard categories actually MOVE a deck's grade, and what a draft model is really perturbing.
 *
 * ## Why this is a committed tool and not a scratch script
 *
 * This decomposition has been rebuilt from scratch three times, and the three
 * runs disagreed. `engineering/decisions/2026-08-25-deck-profiles-craft-style-split.md`
 * §2 reports a 14.1%–64.2% band for `contract` and notes, in its own margin, that it
 * REPLACES a 27.8%–74.4% band a reviewer produced and nobody reproduced. A number
 * that costs an afternoon to re-derive gets relayed instead of re-derived, and a
 * relayed number is how both of those got into a decision record. So the
 * decomposition ships as a tool: `npm run score:variance` re-derives every figure
 * any record quotes, and the method is the code rather than a paragraph describing
 * a script that no longer exists.
 *
 * ## What it reports, and why the third table is the one that matters
 *
 *   1. VARIANCE SHARE per category, over a population. Each figure is the
 *      category's share of the SUM of the raw per-category population variances,
 *      unweighted — the method §2 states. `--weighted` uses the aggregate's own
 *      squared category weights instead; it moves the numbers and changes no
 *      conclusion, so both are printed rather than one being implied.
 *
 *   2. RULE ATTRIBUTION per category, by ABLATION. For every rule the review and
 *      lint passes emit, drop that rule's findings and re-score: whichever
 *      categories move are the ones it feeds, and by how much. Nothing here
 *      restates the scorer's own rule-to-category mapping (HARD RULE #1) — the
 *      mapping is measured, so it cannot drift when a rule moves between
 *      categories.
 *
 *      Ablation is derived over EVERY population the run scores, not just the
 *      committed corpus, and the difference is not academic: no lint rule fires on
 *      the committed corpus at all (that is `contract`'s whole story — the gate
 *      keeps it clean), so a map built there attributes no rule to `contract` and
 *      the ledger below then reports `+0 / -0` for the one category the draft
 *      models perturb hardest. The first cut of this tool did exactly that and
 *      printed a ledger that flatly contradicted its own share table.
 *
 *   3. The PERTURBATION LEDGER, for each draft model: how many findings of each
 *      category's input family that model CREATES and DESTROYS relative to the
 *      full deck. This is the table that makes the other two readable, and
 *      leaving it out is what made the earlier bands mean less than they looked
 *      like they meant. A share is only evidence about a weight if the population
 *      it was measured on can express that category at all. Prefix truncation
 *      cannot: it manufactures the incompleteness `contract` detects and erases
 *      the authoring sloppiness `craftProse` detects, so the two categories'
 *      shares under it are largely a reading of the instrument.
 *      See engineering/decisions/2026-08-30-craft-weight-variance-proxy-bias.md.
 *
 * ## Populations
 *
 * The committed corpus is `examples/` + `exemplars/`, non-README, restricted to
 * decks carrying a class directive (the rest cannot be scored). Lint findings pass
 * through the same `typed-shape-glyph` exemption `tools/lint-deck.js` applies, so
 * the population matches the one the pre-push and CI gates actually police —
 * without it, one sanctioned deck reads a warning the gate forgives and `contract`
 * reports 0.4% instead of 0.0%.
 *
 * The draft models are prefix truncations of each deck at four depths, by line and
 * by character. They are a PROXY for a mid-authoring draft, not a draft corpus; the
 * repository has no real one. Table 3 is what says how far to trust each.
 *
 * Usage:
 *   node tools/score-variance.js              # the three tables
 *   node tools/score-variance.js --weighted   # add the weight-squared share
 *   node tools/score-variance.js --json       # machine-readable
 *   node tools/score-variance.js --committed  # skip the draft models (fast)
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { lintText, buildVocab } = require('../lib/authoring/lint');
const { reviewText } = require('../lib/authoring/review-core');
const { scoreDeck, CRAFT_WEIGHTS, STYLE_WEIGHTS } = require('../lib/authoring/scorecard');
const { loadAll } = require('../lib/components');

const CLASS_DIRECTIVE = /<!--\s*_?class:/;

// The prefix depths each draft model cuts at. `--depths` overrides them, and it
// exists because this parameter turned out to CHOOSE the answer rather than refine
// it: the 2026-08-25 record's 14.1% and this tool's default both decompose the same
// corpus with the same code and disagree, and the only thing between them is a set
// of cut depths that record never wrote down. A knob that swings a reported share by
// tens of points has to be a stated input, not a default buried in a script.
const DRAFT_DEPTHS = [0.25, 0.5, 0.75, 0.9];

// ── corpus ───────────────────────────────────────────────────────────────────

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.md') && !/README/i.test(entry.name)) out.push(full);
  }
  return out;
}

const relFromRoot = (file) => path.relative(ROOT, file).split(path.sep).join('/');

// Read the linter's own exemption list rather than repeating it (HARD RULE #1).
let glyphExemptCache = null;
function glyphExemptDecks() {
  if (glyphExemptCache) return glyphExemptCache;
  try {
    const { SANCTIONED_GLYPH_DECKS } = require('./check-ownership.js');
    glyphExemptCache = new Set(SANCTIONED_GLYPH_DECKS.map((d) => d.file));
  } catch {
    glyphExemptCache = new Set();
  }
  return glyphExemptCache;
}

// Line endings normalize at the READ, as every other deck ingest does — a CRLF deck
// otherwise lints differently from the same content in LF
// (engineering/decisions/2026-08-04-line-endings-lf-boundaries.md).
const readDeck = (file) => fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');

function loadCorpus() {
  const files = [...walk(path.join(ROOT, 'examples')), ...walk(path.join(ROOT, 'exemplars'))];
  const decks = [];
  for (const file of files) {
    const source = readDeck(file);
    if (!CLASS_DIRECTIVE.test(source)) continue;
    decks.push({ file: relFromRoot(file), source });
  }
  return { decks, seen: files.length };
}

// ── scoring ──────────────────────────────────────────────────────────────────

function makeScorer() {
  const vocab = buildVocab();
  let byName = new Map();
  try {
    byName = new Map(loadAll().map((m) => [m.name, m]));
  } catch { /* a manifest problem degrades the review pass, it never breaks the run */ }
  const bucketOf = (n) => { const m = byName.get(n); return m ? (m.bucket || m.function) : null; };
  const densityOf = (n) => byName.get(n)?.density || null;

  return function score(source, rel) {
    const exempt = glyphExemptDecks().has(rel);
    const lintFindings = lintText(source, { vocab }).filter(
      (f) => (f.severity === 'error' || f.severity === 'warning')
        && !(f.rule === 'typed-shape-glyph' && exempt),
    );
    const reviewFindings = [...reviewText(source, { bucketOf, densityOf })];
    return { deck: scoreDeck({ source, lintFindings, reviewFindings }), lintFindings, reviewFindings };
  };
}

// ── statistics ───────────────────────────────────────────────────────────────

function populationVariance(xs) {
  if (!xs.length) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
}

/**
 * A category's share of the summed raw per-category variance. `weights`, when
 * given, scales each variance by the weight SQUARED — the aggregate is a weighted
 * mean, so a weight enters its variance quadratically.
 */
function shares(columns, weights) {
  const vars = {};
  for (const [key, xs] of Object.entries(columns)) {
    const w = weights ? (weights[key] ?? 1) ** 2 : 1;
    vars[key] = populationVariance(xs) * w;
  }
  const total = Object.values(vars).reduce((a, b) => a + b, 0);
  const out = {};
  for (const key of Object.keys(vars)) out[key] = total ? (vars[key] / total) * 100 : 0;
  return out;
}

// The category keys of each half. The WEIGHTS come from the scorer itself
// (CRAFT_WEIGHTS / STYLE_WEIGHTS above), never a copy kept here.
const CRAFT_KEYS = ['structure', 'craftProse', 'contract'];
const STYLE_KEYS = ['brevity', 'framing', 'data', 'pacing'];

function collect(sources, score) {
  const columns = {};
  const halfScores = { craft: [], style: [] };
  for (const key of [...CRAFT_KEYS, ...STYLE_KEYS]) columns[key] = [];
  for (const { source, file } of sources) {
    const { deck } = score(source, file);
    for (const c of deck.categories) {
      // An `na` category drops out of the aggregate, so it must drop out here too —
      // averaging a missing Data score in as 100 would invent variance the grade
      // never saw. The consequence is that Style's columns are UNEQUAL in length:
      // `data` is scored only on decks with a data slide, and `pacing` is `na`
      // everywhere (nothing supplies `talkMinutes`), so it reports a flat 0.0%. Craft
      // is unaffected — all three of its categories score on every deck.
      if (c.na || c.score == null) continue;
      columns[c.key]?.push(c.score);
    }
    halfScores.craft.push(deck.craft.score);
    halfScores.style.push(deck.style.score);
  }
  return { columns, halfScores };
}

/**
 * Which rules feed which category, measured by ablation: drop every finding of one
 * rule, re-score, and record the TOTAL absolute movement per category, summed over
 * the population. A rule that
 * moves nothing is either never fired on this population or is not scored at all —
 * the `fires` count separates the two.
 */
function attributeRules(sources, score) {
  const movement = new Map(); // rule -> { fires, byCategory: Map<key, totalAbsDelta> }
  for (const { source, file } of sources) {
    const { deck, lintFindings, reviewFindings } = score(source, file);
    const baseline = new Map(deck.categories.map((c) => [c.key, c.na ? null : c.score]));
    const present = new Set([...lintFindings, ...reviewFindings].map((f) => f.rule));
    for (const rule of present) {
      const ablated = scoreDeck({
        source,
        lintFindings: lintFindings.filter((f) => f.rule !== rule),
        reviewFindings: reviewFindings.filter((f) => f.rule !== rule),
      });
      let entry = movement.get(rule);
      if (!entry) { entry = { fires: 0, byCategory: new Map() }; movement.set(rule, entry); }
      entry.fires += [...lintFindings, ...reviewFindings].filter((f) => f.rule === rule).length;
      for (const c of ablated.categories) {
        const before = baseline.get(c.key);
        if (before == null || c.na || c.score == null) continue;
        const delta = Math.abs(c.score - before);
        if (delta > 1e-9) entry.byCategory.set(c.key, (entry.byCategory.get(c.key) || 0) + delta);
      }
    }
  }
  return movement;
}

// ── draft models ─────────────────────────────────────────────────────────────

const DRAFT_MODELS = {
  line: (source, frac) => {
    const lines = source.split('\n');
    return lines.slice(0, Math.max(1, Math.floor(lines.length * frac))).join('\n');
  },
  char: (source, frac) => source.slice(0, Math.max(1, Math.floor(source.length * frac))),
};

function draftPopulation(decks, model, depths = DRAFT_DEPTHS) {
  const out = [];
  for (const { source, file } of decks) {
    for (const frac of depths) out.push({ file, source: DRAFT_MODELS[model](source, frac) });
  }
  return out;
}

/**
 * What a draft model does to each category's INPUT, per depth: findings created and
 * findings destroyed relative to the full deck, counted per category by the ablation
 * map so the families stay single-sourced.
 */
function perturbationLedger(decks, score, ruleCategory, depths = DRAFT_DEPTHS) {
  const rows = [];
  for (const model of Object.keys(DRAFT_MODELS)) {
    for (const frac of depths) {
      const created = {};
      const destroyed = {};
      for (const key of [...CRAFT_KEYS, ...STYLE_KEYS]) { created[key] = 0; destroyed[key] = 0; }
      for (const { source, file } of decks) {
        const full = score(source, file);
        const cut = score(DRAFT_MODELS[model](source, frac), file);
        const tally = (res) => {
          const counts = {};
          for (const f of [...res.lintFindings, ...res.reviewFindings]) {
            const key = ruleCategory.get(f.rule);
            if (key) counts[key] = (counts[key] || 0) + 1;
          }
          return counts;
        };
        const before = tally(full);
        const after = tally(cut);
        for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
          const delta = (after[key] || 0) - (before[key] || 0);
          if (delta > 0) created[key] += delta;
          else destroyed[key] -= delta;
        }
      }
      rows.push({ model, frac, created, destroyed });
    }
  }
  return rows;
}

// ── reporting ────────────────────────────────────────────────────────────────

const pct = (n) => `${n.toFixed(1)}%`;
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);

function printShareTable(title, keys, populations, weights, useWeighted) {
  console.log(`\n${title}`);
  console.log(`  ${pad('population', 30)}${lpad('n', 6)}  ${keys.map((k) => lpad(k, 12)).join('')}${lpad('half sd', 10)}`);
  for (const p of populations) {
    const s = shares(Object.fromEntries(keys.map((k) => [k, p.columns[k]])), useWeighted ? weights : null);
    const sd = Math.sqrt(populationVariance(p.half));
    console.log(`  ${pad(p.label, 30)}${lpad(p.n, 6)}  ${keys.map((k) => lpad(pct(s[k]), 12)).join('')}${lpad(sd.toFixed(2), 10)}`);
  }
}

function main(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  const committedOnly = flags.has('--committed');
  const asJson = flags.has('--json');
  const useWeighted = flags.has('--weighted');

  const depthArg = argv.find((a) => a.startsWith('--depths='));
  let depths = DRAFT_DEPTHS;
  if (depthArg) {
    depths = depthArg.slice('--depths='.length).split(',').map(Number).filter((n) => n > 0 && n < 1);
    if (!depths.length) {
      process.stderr.write('score:variance — --depths wants comma-separated fractions in (0,1), e.g. --depths=0.5,0.75\n');
      return 2;
    }
  }

  const { decks, seen } = loadCorpus();
  if (!decks.length) {
    process.stderr.write('score:variance — no scorable decks found under examples/ or exemplars/.\n');
    return 2;
  }
  const score = makeScorer();

  const drafts = committedOnly ? [] : Object.keys(DRAFT_MODELS).map((model) => ({ model, pop: draftPopulation(decks, model, depths) }));

  // Attribute over every population this run scores — see the docblock: a map built
  // on the committed corpus alone cannot see `contract`, because nothing lint-dirty
  // survives the gate to reach it.
  const ruleMovement = attributeRules([...decks, ...drafts.flatMap((d) => d.pop)], score);
  // A rule is attributed to the category it moves MOST — every rule in the scorer
  // today feeds exactly one, and a rule that ever fed two would show up here as a
  // split rather than being silently collapsed.
  const ruleCategory = new Map();
  const ruleSplit = [];
  for (const [rule, entry] of ruleMovement) {
    if (!entry.byCategory.size) continue;
    const ranked = [...entry.byCategory.entries()].sort((a, b) => b[1] - a[1]);
    ruleCategory.set(rule, ranked[0][0]);
    if (ranked.length > 1) ruleSplit.push({ rule, categories: ranked.map(([k, v]) => `${k} ${v.toFixed(1)}`) });
  }

  const committed = collect(decks, score);
  const populations = [{ label: 'committed corpus', n: decks.length, columns: committed.columns, half: committed.halfScores.craft, style: committed.halfScores.style }];
  for (const { model, pop } of drafts) {
    const c = collect(pop, score);
    populations.push({ label: `drafts, ${model}-truncated`, n: pop.length, columns: c.columns, half: c.halfScores.craft, style: c.halfScores.style });
  }

  const ledger = committedOnly ? [] : perturbationLedger(decks, score, ruleCategory, depths);

  if (asJson) {
    console.log(JSON.stringify({
      corpus: { filesSeen: seen, scorable: decks.length },
      craft: populations.map((p) => ({ population: p.label, n: p.n, shares: shares(Object.fromEntries(CRAFT_KEYS.map((k) => [k, p.columns[k]])), null), sd: Math.sqrt(populationVariance(p.half)) })),
      style: populations.map((p) => ({ population: p.label, n: p.n, shares: shares(Object.fromEntries(STYLE_KEYS.map((k) => [k, p.columns[k]])), null), sd: Math.sqrt(populationVariance(p.style)) })),
      rules: [...ruleMovement].map(([rule, e]) => ({ rule, fires: e.fires, category: ruleCategory.get(rule) || null, movement: Object.fromEntries(e.byCategory) })),
      ledger,
    }, null, 2));
    return 0;
  }

  console.log(`score:variance — ${decks.length} scorable decks of ${seen} non-README files under examples/ + exemplars/`);
  console.log(`Shares are each category's portion of the summed raw per-category population variance, ${useWeighted ? 'scaled by the aggregate\'s squared category weights' : 'unweighted'}.`);
  if (!committedOnly) console.log(`Draft models cut at ${depths.map((d) => `${d * 100}%`).join(', ')} — this choice moves the shares; see --depths.`);

  printShareTable('CRAFT — variance share', CRAFT_KEYS, populations, CRAFT_WEIGHTS, useWeighted);
  printShareTable('STYLE — variance share', STYLE_KEYS,
    populations.map((p) => ({ ...p, half: p.style })), STYLE_WEIGHTS, useWeighted);

  console.log(`\nRULE ATTRIBUTION — measured by ablation over ${committedOnly ? 'the committed corpus' : 'all populations above'}`);
  console.log(`  ${pad('rule', 24)}${lpad('fires', 7)}  ${pad('category', 14)}${lpad('total movement', 16)}`);
  const attributed = [...ruleMovement].filter(([r]) => ruleCategory.has(r))
    .sort((a, b) => [...b[1].byCategory.values()].reduce((x, y) => x + y, 0) - [...a[1].byCategory.values()].reduce((x, y) => x + y, 0));
  for (const [rule, e] of attributed) {
    const total = [...e.byCategory.values()].reduce((a, b) => a + b, 0);
    console.log(`  ${pad(rule, 24)}${lpad(e.fires, 7)}  ${pad(ruleCategory.get(rule), 14)}${lpad(total.toFixed(1), 16)}`);
  }
  const silent = [...ruleMovement].filter(([r]) => !ruleCategory.has(r)).map(([r]) => r);
  if (silent.length) console.log(`  (fired but scored nothing: ${silent.join(', ')})`);
  if (ruleSplit.length) for (const s of ruleSplit) console.log(`  (feeds more than one category: ${s.rule} → ${s.categories.join(', ')})`);

  if (ledger.length) {
    console.log('\nPERTURBATION LEDGER — what each draft model does to each category\'s input');
    console.log('  Read this BEFORE reading a share above it. A share is evidence about a weight only');
    console.log('  if the population can express that category; a model that destroys a category\'s');
    console.log('  findings and creates none is reporting its own construction, not the category.');
    console.log(`\n  ${pad('model', 8)}${lpad('depth', 7)}  ${CRAFT_KEYS.map((k) => lpad(`${k} +/-`, 22)).join('')}`);
    for (const row of ledger) {
      const cells = CRAFT_KEYS.map((k) => lpad(`+${row.created[k]} / -${row.destroyed[k]}`, 22)).join('');
      console.log(`  ${pad(row.model, 8)}${lpad(`${row.frac * 100}%`, 7)}  ${cells}`);
    }
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { loadCorpus, makeScorer, populationVariance, shares, attributeRules, DRAFT_MODELS, DRAFT_DEPTHS, CRAFT_KEYS, STYLE_KEYS };
