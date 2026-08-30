/**
 * The prefix-truncation draft proxy is BIASED, and the bias runs the opposite way
 * from the conclusion drawn off it.
 *
 * `engineering/decisions/2026-08-25-deck-profiles-craft-style-split.md` §2 decomposes
 * the Craft half's variance over two draft populations — the committed decks cut
 * short by line and by character — and closes by naming `craftProse` "the next weight
 * to be suspicious of" because its share is thinnest on every one of them (1.5%-8.7%).
 *
 * That share is the instrument talking. Truncating a deck models an UNFINISHED deck,
 * not a badly-written one, so it manufactures the lint footguns `contract` detects and
 * erases the authoring sloppiness `craftProse` detects. This file pins the three
 * measurements that say so, because the wrong reading is one a future session would
 * otherwise re-derive and act on:
 *
 *   1. Every `craftProse` rule FIRES when driven. So its thin share is not the
 *      "starved input" story that explains `pacing`, and not a broken rule either.
 *   2. Line truncation creates ZERO `craftProse` findings at every depth while
 *      destroying real ones — the proxy is blind to the category by construction.
 *   3. Truncation creates `contract` findings and destroys none — the asymmetry that
 *      makes the two categories' shares incomparable on this population.
 *
 * See engineering/decisions/2026-08-30-craft-weight-variance-proxy-bias.md.
 */

const test = require('node:test');
const assert = require('node:assert');

const { reviewText } = require('../../../lib/authoring/review-core');
const { loadAll } = require('../../../lib/components');
const { loadCorpus, makeScorer, DRAFT_MODELS, DRAFT_DEPTHS } = require('../../../tools/score-variance.js');

const CRAFT_PROSE_RULES = ['label-title', 'monotone-openings', 'possessive-stacking', 'image-no-alt'];

const byName = new Map(loadAll().map((m) => [m.name, m]));
const bucketOf = (n) => { const m = byName.get(n); return m ? (m.bucket || m.function) : null; };
const densityOf = (n) => byName.get(n)?.density || null;
const rulesOf = (src) => [...reviewText(src, { bucketOf, densityOf })].map((f) => f.rule);

// Deliberately ordinary decks — a rule that only fires on a contrived shape is not
// reachable in the sense this file cares about.
const PROBES = [
  ['label-title', '<!-- _class: statement -->\n\n## Overview\n\nSome body text that fills the slide out nicely.\n'],
  ['label-title', '<!-- _class: statement -->\n\n## Glossary\n\nSome body text that fills the slide out nicely.\n'],
  ['image-no-alt', '<!-- _class: statement -->\n\n## Revenue grew 18%\n\n![](chart.png)\n'],
  ['possessive-stacking', "<!-- _class: statement -->\n\n## Revenue grew 18%\n\nThe system's policy's scope covers every tenant.\n"],
  ['possessive-stacking', "<!-- _class: statement -->\n\n## Revenue grew 18%\n\n- The vendor's contract's renewal date slipped.\n"],
  // The curly apostrophe is what an editor actually produces, and the rule's own
  // message quotes it — if only the straight form matched, the rule would miss the
  // spelling it advertises.
  ['possessive-stacking', '<!-- _class: statement -->\n\n## Revenue grew 18%\n\nThe system’s policy’s scope covers every tenant.\n'],
  ['monotone-openings', ['We shipped the parser', 'We shipped the linter', 'We shipped the scorer']
    .map((h) => `<!-- _class: statement -->\n\n## ${h}\n\nBody text for this slide.\n`).join('\n---\n\n')],
];

test('every craftProse rule fires when driven — the category is not starved', () => {
  for (const [rule, source] of PROBES) {
    const fired = rulesOf(source);
    assert.ok(
      fired.includes(rule),
      `${rule} did not fire on a deck written to trigger it — got [${fired.join(', ')}]. `
      + 'A silent rule makes craftProse look thin for a reason that has nothing to do with its weight.',
    );
  }
  const covered = new Set(PROBES.map(([r]) => r));
  for (const rule of CRAFT_PROSE_RULES) {
    assert.ok(covered.has(rule), `no probe for ${rule} — every craftProse rule needs one`);
  }
});

test('prefix truncation is blind to craftProse and manufactures contract findings', () => {
  const { decks } = loadCorpus();
  assert.ok(decks.length > 150, `expected the committed corpus, got ${decks.length} decks`);
  const score = makeScorer();

  const countCraftProse = (res) => res.reviewFindings.filter((f) => CRAFT_PROSE_RULES.includes(f.rule)).length;

  const totals = { lineCreated: 0, lineDestroyed: 0, contractCreated: 0, contractDestroyed: 0 };
  let baselineCraftProse = 0;

  for (const { source, file } of decks) {
    const full = score(source, file);
    baselineCraftProse += countCraftProse(full);
    for (const frac of DRAFT_DEPTHS) {
      const cutLine = score(DRAFT_MODELS.line(source, frac), file);
      const dLine = countCraftProse(cutLine) - countCraftProse(full);
      if (dLine > 0) totals.lineCreated += dLine;
      else totals.lineDestroyed -= dLine;

      // `contract` reads lint findings, and the corpus is lint-clean by construction
      // (--strict gates it), so anything here is something truncation invented.
      for (const model of Object.keys(DRAFT_MODELS)) {
        const cut = score(DRAFT_MODELS[model](source, frac), file);
        const d = cut.lintFindings.length - full.lintFindings.length;
        if (d > 0) totals.contractCreated += d;
        else totals.contractDestroyed -= d;
      }
    }
  }

  assert.ok(baselineCraftProse > 0, 'the corpus should carry some craftProse findings to destroy');

  // THE finding. Not "few" — none. Cutting a good deck short never makes it sloppy,
  // so a variance share measured on this population says nothing about craftProse.
  assert.strictEqual(
    totals.lineCreated, 0,
    `line truncation created ${totals.lineCreated} craftProse findings; it must create none. `
    + 'If this fails, the proxy has become able to express craftProse and the 2026-08-30 '
    + 'record\'s central claim needs re-deriving, not this assertion relaxing.',
  );
  assert.ok(
    totals.lineDestroyed >= baselineCraftProse / 2,
    `line truncation destroyed only ${totals.lineDestroyed} of ${baselineCraftProse} craftProse findings`,
  );

  // The mirror image, and the reason the two categories' shares are incomparable here.
  assert.ok(totals.contractCreated > 100, `truncation created only ${totals.contractCreated} contract findings`);
  assert.strictEqual(
    totals.contractDestroyed, 0,
    `truncation destroyed ${totals.contractDestroyed} contract findings; the corpus is lint-clean, so it has none to destroy`,
  );
});
