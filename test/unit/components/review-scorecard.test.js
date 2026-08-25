/**
 * Unit: lib/authoring/review-core.js (presentation review heuristics) and
 * lib/authoring/scorecard.js (deterministic deck scorecard). Both are pure,
 * browser-safe modules the Drawing Board's Architect panel runs client-side.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { reviewText, isLabelHeading } = require('../../../lib/authoring/review-core');
const { scoreDeck } = require('../../../lib/authoring/scorecard');
const { resolveProfile, PROFILES } = require('../../../lib/authoring/deck-profiles');

const FM = '---\nmarp: true\ntheme: indaco\n---\n\n';
// An UNDECLARED deck resolves to the lenient `general` profile, so a test that means
// to exercise a tight budget has to say which genre it is testing. `boardroom` is the
// tightest (70 slide words, a 14-word heading) — the numbers these rules shipped with.
const FM_BOARD = '---\nmarp: true\ntheme: indaco\nprofile: boardroom\n---\n\n';
const bucketOf = (n) => ({ kpi: 'evidence', stats: 'evidence', radar: 'chart', piechart: 'chart', gantt: 'chart' }[n] || 'statement');
const ruleOf = (findings, rule) => findings.find((f) => f.rule === rule);

describe('review-core: isLabelHeading', () => {
  test('flags bare label words + single words; spares takeaways with verbs/numbers', () => {
    assert.equal(isLabelHeading('Results'), true);
    assert.equal(isLabelHeading('Overview'), true);
    assert.equal(isLabelHeading('Roadmap'), true);
    assert.equal(isLabelHeading('Strategy'), true); // single word
    assert.equal(isLabelHeading('Revenue grew 18% last quarter'), false); // number → takeaway
    assert.equal(isLabelHeading('What ships in each phase'), false); // multi-word, not a label phrase
    assert.equal(isLabelHeading('We should ship APAC first'), false);
  });
});

describe('review-core: reviewText', () => {
  test('flags a label title on a content slide', () => {
    const f = reviewText(`${FM}<!-- _class: content -->\n\n## Results\n\nbody\n`, { bucketOf });
    assert.ok(ruleOf(f, 'label-title'));
  });

  test('does NOT flag a declarative takeaway title', () => {
    const f = reviewText(`${FM}<!-- _class: content -->\n\n## Revenue grew 18%, led by APAC\n\nbody\n`, { bucketOf });
    assert.equal(ruleOf(f, 'label-title'), undefined);
  });

  test('flags a data slide with no takeaway headline', () => {
    const f = reviewText(`${FM}<!-- _class: kpi -->\n\n## Metrics\n\n1. 18%\n`, { bucketOf });
    assert.ok(ruleOf(f, 'chart-no-takeaway'));
  });

  test('flags wall-of-text', () => {
    const big = `${FM}<!-- _class: content -->\n\n## A real takeaway here\n\n${'word '.repeat(90)}\n`;
    assert.ok(ruleOf(reviewText(big, { bucketOf }), 'wall-of-text'));
  });

  test('flags no-ask on a non-trivial deck without a decision/recommendation', () => {
    const deck = `${FM}<!-- _class: content -->\n\n## Point one matters\n\nx\n\n---\n\n<!-- _class: content -->\n\n## Point two also\n\nx\n\n---\n\n<!-- _class: content -->\n\n## Point three here\n\nx\n\n---\n\n<!-- _class: content -->\n\n## Point four too\n\nx\n`;
    assert.ok(ruleOf(reviewText(deck, { bucketOf }), 'no-ask'));
  });

  test('no-ask is silent when a decision slide is present', () => {
    const deck = `${FM}<!-- _class: content -->\n\n## A\n\nx\n\n---\n\n<!-- _class: content -->\n\n## B\n\nx\n\n---\n\n<!-- _class: content -->\n\n## C\n\nx\n\n---\n\n<!-- _class: decision -->\n\n## We recommend X\n\nx\n`;
    assert.equal(ruleOf(reviewText(deck, { bucketOf }), 'no-ask'), undefined);
  });

  test('length-vs-time fires only with a talk length set', () => {
    const deck = `${FM}<!-- _class: content -->\n\n## A B C\n\nx\n\n---\n\n<!-- _class: content -->\n\n## D E F\n\nx\n`;
    assert.equal(ruleOf(reviewText(deck, { bucketOf }), 'length-vs-time'), undefined);
    assert.ok(ruleOf(reviewText(deck, { bucketOf, talkMinutes: 1 }), 'length-vs-time'));
  });
});

describe('scorecard: scoreDeck — the Craft / Style split', () => {
  const clean = `${FM}<!-- _class: title silent -->\n\n# Q3 board review\n\nthe ask\n\n---\n\n<!-- _class: kpi -->\n\n## Revenue grew 18%, led by APAC\n\n1. 18%\n   - growth\n\n---\n\n<!-- _class: decision -->\n\n## We recommend funding APAC\n\n- option\n  - body\n\n---\n\n<!-- _class: closing -->\n\n## Fund APAC\n`;
  const card = (src, lint = []) => scoreDeck({ source: src, lintFindings: lint, reviewFindings: reviewText(src, { bucketOf }) });
  const cat = (c, key) => c.categories.find((x) => x.key === key);

  test('returns two grades, a resolved profile, and seven categories split across the halves', () => {
    const c = card(clean);
    for (const half of ['craft', 'style']) {
      assert.equal(typeof c[half].score, 'number');
      assert.ok(['A', 'A−', 'B+', 'B', 'C+', 'C', 'D', 'F'].includes(c[half].band));
      assert.equal(typeof c[half].summary, 'string');
    }
    assert.deepEqual(c.categories.map((x) => x.key),
      ['structure', 'craftProse', 'contract', 'brevity', 'framing', 'data', 'pacing']);
    assert.deepEqual(c.categories.filter((x) => x.half === 'craft').map((x) => x.key),
      ['structure', 'craftProse', 'contract']);
    assert.equal(typeof c.profile.key, 'string');
    assert.ok(['declared', 'override', 'inferred', 'default'].includes(c.profile.origin));
  });

  test('a clean deck scores high on both halves', () => {
    const c = card(clean);
    assert.ok(c.craft.score >= 85, `craft: expected >=85, got ${c.craft.score}`);
    assert.ok(c.style.score >= 85, `style: expected >=85, got ${c.style.score}`);
  });

  test('authoring errors tank Contract, which lives in CRAFT', () => {
    const lint = [{ rule: 'card-style-inline-title', severity: 'error' }, { rule: 'split-bodyless-item', severity: 'error' }];
    const c = card(clean, lint);
    assert.ok(cat(c, 'contract').score <= 60);
    assert.equal(cat(c, 'contract').half, 'craft');
  });

  test('a missing title drops Structure', () => {
    assert.ok(cat(card(`${FM}<!-- _class: content -->\n\n## A takeaway\n\nx\n`), 'structure').score < 100);
  });

  test('label titles drop Writing craft', () => {
    const labels = `${FM}<!-- _class: title silent -->\n\n# T\n\n---\n\n<!-- _class: content -->\n\n## Overview\n\nx\n`;
    assert.ok(cat(card(labels), 'craftProse').score < 100);
  });

  test('Data is N/A (not a free A) on a deck with no data slides', () => {
    const noData = `${FM}<!-- _class: title silent -->\n\n# T\n\n---\n\n<!-- _class: content -->\n\n## A takeaway\n\nbody\n`;
    const d = cat(card(noData), 'data');
    assert.equal(d.na, true);
    assert.equal(d.score, null);
  });

  test('Data IS scored when the deck has a data slide', () => {
    const withData = `${FM}<!-- _class: kpi -->\n\n## Metrics\n\n1. 18%\n`;
    assert.equal(cat(card(withData), 'data').na, undefined);
  });

  test('Pacing is N/A without a talk length — it graded nothing on 196 of 197 decks', () => {
    assert.equal(cat(card(clean), 'pacing').na, true);
  });

  // ── the defect this split exists to fix ───────────────────────────────────
  test('the density penalty is CAPPED and cannot floor a category (the saturation bug)', () => {
    // Every content slide a wall of text. Under the old uncapped `-= walls * 12`
    // this floored Clarity to 0 and dragged a defect-free deck to a C+.
    let deck = `${FM_BOARD}<!-- _class: title -->\n\n# A real deck title\n\nA framing line.\n`;
    // Headings deliberately VARIED — an identical opening would trip `monotone-openings`,
    // a real craft defect, and the point of this test is that density alone touches Craft
    // not at all. (It caught exactly that in an earlier draft of this test.)
    const openers = ['Latency', 'Cost', 'Retries', 'Throughput', 'Errors', 'Memory', 'Cache'];
    for (let i = 0; i < 14; i++) deck += `\n---\n\n<!-- _class: content -->\n\n## ${openers[i % openers.length]} ${i} moved after the change\n\n${'word '.repeat(120)}\n`;
    const c = card(deck);
    assert.ok(cat(c, 'brevity').score > 0, 'brevity must never floor to 0');
    // Craft must be INVARIANT to density. Compare against the byte-identical deck with
    // short bodies: any craft difference between them is density leaking across the split.
    const sparse = card(deck.replace(/(?:word ){120}/g, 'a short body. '));
    assert.equal(c.craft.score, sparse.craft.score, 'density is a STYLE signal — it must not touch Craft at all');
    assert.ok(cat(sparse, 'brevity').score > cat(c, 'brevity').score, 'and it must still move Brevity');
  });

  test('CRAFT is profile-blind: the same deck scores the same craft under every profile', () => {
    let body = `<!-- _class: title -->\n\n# A real deck title\n\nA framing line.\n`;
    const heads = ['Latency fell', 'Cost held flat', 'Retries dropped', 'Throughput rose', 'Errors cleared', 'Memory settled'];
    for (let i = 0; i < 6; i++) body += `\n---\n\n<!-- _class: content -->\n\n## ${heads[i]} after the change\n\n${'word '.repeat(90)}\n`;
    const scores = Object.keys(PROFILES).map((k) => card(`---\nmarp: true\nprofile: ${k}\n---\n\n${body}`));
    const craft = new Set(scores.map((c) => c.craft.score));
    assert.equal(craft.size, 1, `craft moved across profiles: ${[...craft].join(', ')}`);
    // ...while STYLE does move, which is the whole point.
    assert.ok(new Set(scores.map((c) => c.style.score)).size > 1, 'style must respond to the profile');
  });

  test('a profile is a different bar, never a lower one — teaching still fails real craft defects', () => {
    const stubs = `---\nmarp: true\nprofile: teaching\n---\n\n<!-- _class: content -->\n\n## Overview\n\n---\n\n<!-- _class: content -->\n\n## Overview\n`;
    const c = card(stubs);
    assert.ok(c.craft.score < 90, `expected craft to catch stubs+duplicates under teaching, got ${c.craft.score}`);
  });

  // review-core and scorecard resolve the profile INDEPENDENTLY, in different files. If
  // they ever disagree, a deck's findings are generated under one genre's budgets and
  // graded under another's — a silent mis-grade with no error anywhere.
  //
  // An earlier version of this test compared scoreDeck's answer against a THIRD,
  // hand-rolled regex written inside the test, so review-core could have drifted
  // arbitrarily and it would still have passed. It asserted nothing it claimed to. This
  // drives the real thing: reviewText stamps `scored` from ITS profile, so a disagreement
  // surfaces as a flag that contradicts the genre the scorecard reports.
  test('review-core and scorecard cannot disagree about the profile', () => {
    const long = (p) => {
      let d = `---\nmarp: true\n${p ? `profile: ${p}\n` : ''}---\n\n<!-- _class: title -->\n\n# A deck\n\nA framing line.\n`;
      for (let i = 0; i < 11; i++) d += `\n---\n\n<!-- _class: content -->\n\n## Point ${i} stands alone\n\nbody\n`;
      return d;
    };
    for (const prof of [null, 'teaching', 'mission', 'general']) {
      const src = long(prof);
      const findings = reviewText(src, { bucketOf });
      const c = scoreDeck({ source: src, lintFindings: [], reviewFindings: findings });
      const agenda = findings.find((f) => f.rule === 'agenda-missing');
      assert.ok(agenda, 'the 12-slide fixture must trip agenda-missing');
      assert.equal(
        agenda.scored !== false,                        // what review-core believed
        PROFILES[c.profile.key].scoresAgenda,           // what the scorecard reports
        `profile drift on profile=${prof}`,
      );
    }
  });

  test('the genre rules stay VISIBLE as advice even when the profile does not grade them', () => {
    let deck = `---\nmarp: true\nprofile: teaching\n---\n\n<!-- _class: title -->\n\n# Lesson one\n\nA framing line.\n`;
    for (let i = 0; i < 11; i++) deck += `\n---\n\n<!-- _class: content -->\n\n## Step ${i} builds on the last\n\nbody\n`;
    const findings = reviewText(deck, { bucketOf });
    const ask = findings.find((f) => f.rule === 'no-ask');
    const agenda = findings.find((f) => f.rule === 'agenda-missing');
    assert.ok(ask && agenda, 'both rules must still be surfaced to the author');
    assert.equal(ask.scored, false);
    assert.equal(agenda.scored, false);
    assert.equal(cat(card(deck), 'framing').score, 100, 'and must not deduct under this profile');
  });
});

describe('deck-profiles: declared-only resolution', () => {
  const { SLIDE_PROSE_BUDGET, UNIVERSAL_PROSE_BUDGETS } = require('../../../lib/authoring/prose-budgets');

  // THE load-bearing test of the whole design. `general` is the default for every deck
  // that says nothing, so if it drifts looser than the pre-profiles universal bar, the
  // change silently relaxes the grade for the entire corpus. An earlier cut set it to
  // 80 words / 16-word heading with both structural rules ungraded, and a padded
  // 2,332-word deck with no ask and no agenda scored Style 100 "no issues found",
  // beating a tight 395-word argued deck. This pins general TO the old constants.
  test('`general` reproduces the pre-profiles universal bar exactly', () => {
    const g = PROFILES.general;
    assert.equal(g.slideWords, SLIDE_PROSE_BUDGET.words);
    assert.equal(g.slideBullets, SLIDE_PROSE_BUDGET.bullets);
    assert.equal(g.titleHard, UNIVERSAL_PROSE_BUDGETS.title.hard);
    assert.equal(g.scoresAsk, true, 'silence must not buy relief from a graded rule');
    assert.equal(g.scoresAgenda, true);
  });

  // A profile may only ever LOOSEN, and only for a deck that asked by name.
  test('no profile is TIGHTER than general on any axis', () => {
    for (const p of Object.values(PROFILES)) {
      assert.ok(p.slideWords >= PROFILES.general.slideWords, `${p.key} slideWords`);
      assert.ok(p.slideBullets >= PROFILES.general.slideBullets, `${p.key} slideBullets`);
      assert.ok(p.titleHard >= PROFILES.general.titleHard, `${p.key} titleHard`);
    }
  });

  // The numbers ARE the deliverable, and nothing else constrains them: reverting
  // teaching's budget to 70 re-creates the reported bug, and used to be invisible to CI.
  test('the profile budgets are pinned', () => {
    assert.deepEqual(
      Object.fromEntries(Object.values(PROFILES).map((p) => [p.key, [p.slideWords, p.slideBullets, p.titleHard, p.scoresAsk, p.scoresAgenda]])),
      {
        general: [70, 6, 14, true, true],
        teaching: [95, 8, 14, false, false],
        mission: [70, 6, 18, true, true],
      },
    );
  });

  test('a declared profile wins, and an unknown one is reported rather than swallowed', () => {
    assert.equal(resolveProfile({ source: '---\nprofile: mission\n---\n' }).origin, 'declared');
    const bad = resolveProfile({ source: '---\nprofile: teachng\n---\n' });
    assert.equal(bad.declaredInvalid, 'teachng');
    assert.equal(bad.key, 'general', 'a typo falls back to the DEFAULT bar, which is also the strictest');
  });

  test('a trailing YAML comment does not become part of the name', () => {
    assert.equal(resolveProfile({ source: '---\nprofile: teaching  # for mentees\n---\n' }).key, 'teaching');
  });

  // This used to lose to a declaration, which made the Coach's profile control a silent
  // no-op on exactly the decks that declare one — including both shipped teaching decks.
  test('the override BEATS a declaration — the Coach control is a lens, not a suggestion', () => {
    const r = resolveProfile({ source: '---\nprofile: teaching\n---\n', override: 'general' });
    assert.equal(r.key, 'general');
    assert.equal(r.origin, 'override');
  });

  test('an undeclared deck lands on general, not on a guess', () => {
    const r = resolveProfile({ source: '---\nmarp: true\n---\n' });
    assert.equal(r.origin, 'default');
    assert.equal(r.key, 'general');
  });

  // Inference was removed after measuring that it fired on 46 decks, made 40 WORSE than
  // abstaining and 0 better, and that 21 of its 46 firings were on feature-demo decks.
  test('there is no inference — a genre is never guessed from component vocabulary', () => {
    const profiles = require('../../../lib/authoring/deck-profiles');
    assert.equal(profiles.inferProfile, undefined, 'inference must stay removed');
    const quoteAndMetric = `${FM}<!-- _class: quote -->\n\n## A voice\n\n> x\n\n---\n\n<!-- _class: kpi -->\n\n## It grew\n\n1. 9%\n`;
    assert.equal(resolveProfile({ source: quoteAndMetric }).key, 'general');
  });

  test('a BOM does not silently drop the declaration', () => {
    assert.equal(resolveProfile({ source: '\uFEFF---\nprofile: teaching\n---\n' }).key, 'teaching');
  });

  test('an absurd declared name is bounded before it reaches the panel', () => {
    const r = resolveProfile({ source: `---\nprofile: ${'a'.repeat(5000)}\n---\n` });
    assert.ok(r.declaredInvalid.length <= 32);
  });
});

// RESTORED VERBATIM from before the profile change. A review pass proved these nine
// were deleted and that SEVEN review-core rules were left with zero coverage across
// the whole suite — five of them (`stub-slide`, `duplicate-heading`, `title-incomplete`,
// `image-no-alt`, `possessive-stacking`, `monotone-openings`) are exactly the rules the
// CRAFT half is built from, the half the design calls "the same bar for every deck,
// forever". They could each be deleted wholesale with a green suite.
//
// They restore UNCHANGED because the default `general` profile is now byte-for-byte the
// pre-profiles universal bar, so every threshold they assert is the same one. That is a
// property worth noticing: if a future edit loosens `general`, these start failing.
describe('review-core: editorial + structural heuristics', () => {
  test('flags an over-long heading', () => {
    const f = reviewText(`${FM}<!-- _class: content -->\n\n## ${'word '.repeat(16)}\n\nbody\n`, { bucketOf });
    assert.ok(ruleOf(f, 'long-heading'));
  });

  test('flags a stub slide (heading, no body) but spares anchors', () => {
    assert.ok(ruleOf(reviewText(`${FM}<!-- _class: content -->\n\n## A real takeaway\n`, { bucketOf }), 'stub-slide'));
    assert.equal(ruleOf(reviewText(`${FM}<!-- _class: closing -->\n\n## Thanks\n`, { bucketOf }), 'stub-slide'), undefined);
  });

  test('flags a hero number with no referent, spares one with a comparison', () => {
    assert.ok(ruleOf(reviewText(`${FM}<!-- _class: big-number -->\n\n# 4.2M\n\nrevenue\n`, { bucketOf }), 'metric-no-referent'));
    assert.equal(ruleOf(reviewText(`${FM}<!-- _class: big-number -->\n\n# 4.2M\n\nup from 3.1M\n`, { bucketOf }), 'metric-no-referent'), undefined);
  });

  test('flags an image with empty alt text', () => {
    assert.ok(ruleOf(reviewText(`${FM}<!-- _class: content -->\n\n## Pic\n\n![](x.png)\n`, { bucketOf }), 'image-no-alt'));
  });

  test('flags stacked possessives (editorial speak-first)', () => {
    const f = reviewText(`${FM}<!-- _class: content -->\n\n## A takeaway\n\nThe system's policy's enforcement is slow.\n`, { bucketOf });
    assert.ok(ruleOf(f, 'possessive-stacking'));
  });

  test('flags duplicate headings across slides', () => {
    const dup = `${FM}<!-- _class: content -->\n\n## Results\n\nx\n\n---\n\n<!-- _class: content -->\n\n## Results\n\ny\n`;
    assert.ok(ruleOf(reviewText(dup, { bucketOf }), 'duplicate-heading'));
  });

  test('flags monotone heading cadence (3+ same opening)', () => {
    const mono = `${FM}` + ['How we win', 'How we scale', 'How we ship']
      .map((h) => `<!-- _class: content -->\n\n## ${h}\n\nx\n`).join('\n---\n\n');
    assert.ok(ruleOf(reviewText(mono, { bucketOf }), 'monotone-openings'));
  });

  test('flags a long deck with no agenda', () => {
    const long = `${FM}` + Array.from({ length: 11 }, (_, i) => `<!-- _class: content -->\n\n## Point ${i} stands alone\n\nbody\n`).join('\n---\n\n');
    assert.ok(ruleOf(reviewText(long, { bucketOf }), 'agenda-missing'));
  });

  test('flags a placeholder or subtitle-less title, spares a complete one', () => {
    assert.ok(ruleOf(reviewText(`${FM}<!-- _class: title -->\n\n# Title\n`, { bucketOf }), 'title-incomplete')); // placeholder
    assert.ok(ruleOf(reviewText(`${FM}<!-- _class: title -->\n\n# Our real title\n`, { bucketOf }), 'title-incomplete')); // no subtitle
    assert.equal(ruleOf(reviewText(`${FM}<!-- _class: title -->\n\n\`eyebrow\`\n\n# Our real title\n\nA framing subtitle line.\n`, { bucketOf }), 'title-incomplete'), undefined);
  });
});

describe('review-core: prose-density budgets (2026-06-30)', () => {
  // densityOf injected the same way the Architect does, from a tiny catalog.
  const densityOf = (n) => ({
    'cards-grid': { axis: 'item', soft: 15, hard: 24, note: 'a card body is one short clause' },
  }[n] || null);

  test('flags a per-element body over the density ceiling', () => {
    const body = `word `.repeat(30);
    const deck = `${FM}<!-- _class: cards-grid -->\n\n## A tidy title.\n\n- Alpha\n  - ${body}\n- Beta\n  - short\n`;
    const f = reviewText(deck, { bucketOf, densityOf });
    assert.ok(ruleOf(f, 'density-overflow'));
  });

  test('flags a crowded (soft) element without overflowing', () => {
    const body = `word `.repeat(18); // > soft 15, ≤ hard 24
    const deck = `${FM}<!-- _class: cards-grid -->\n\n## A tidy title.\n\n- Alpha\n  - ${body}\n`;
    const f = reviewText(deck, { bucketOf, densityOf });
    assert.ok(ruleOf(f, 'density-crowd'));
    assert.equal(ruleOf(f, 'density-overflow'), undefined);
  });

  test('stays silent when elements are within budget', () => {
    const deck = `${FM}<!-- _class: cards-grid -->\n\n## A tidy title.\n\n- Alpha\n  - a short clause body\n- Beta\n  - another short body\n`;
    const f = reviewText(deck, { bucketOf, densityOf });
    assert.equal(ruleOf(f, 'density-crowd'), undefined);
    assert.equal(ruleOf(f, 'density-overflow'), undefined);
  });

  test('costs nothing for a component with no density block', () => {
    const deck = `${FM}<!-- _class: content -->\n\n## Title.\n\n- ${'word '.repeat(40)}\n`;
    const f = reviewText(deck, { bucketOf, densityOf });
    assert.equal(ruleOf(f, 'density-overflow'), undefined);
  });

  test('flags an over-budget eyebrow and key-insight (universal chrome)', () => {
    const eyebrow = '`' + 'word '.repeat(10).trim() + '`';
    const ki = `> ${'word '.repeat(30).trim()}`;
    const deck = `${FM}<!-- _class: content -->\n\n${eyebrow}\n\n## A tidy title.\n\n${ki}\n`;
    const f = reviewText(deck, { bucketOf });
    assert.ok(ruleOf(f, 'verbose-eyebrow'));
    assert.ok(ruleOf(f, 'verbose-key-insight'));
  });

  test('long-heading still owns the slide title (no double-fire with verbose-title)', () => {
    const f = reviewText(`${FM_BOARD}<!-- _class: content -->\n\n## ${'word '.repeat(16)}\n\nbody\n`, { bucketOf });
    assert.ok(ruleOf(f, 'long-heading'));
    assert.equal(ruleOf(f, 'verbose-title'), undefined);
  });
});

describe('review-core: shared ask + pacing (one definition for Coach + scorecard)', () => {
  test('exports ASK_RE and pacingVerdict so the Coach action cards reuse them', async () => {
    const { ASK_RE, pacingVerdict } = require('../../../lib/authoring/review-core');
    assert.ok(ASK_RE instanceof RegExp);
    assert.match('we recommend funding APAC', ASK_RE);
    assert.equal(pacingVerdict(10, 20).level, 'comfortable'); // 120s/slide
    assert.equal(pacingVerdict(40, 10).level, 'fast'); // 15s/slide
    assert.equal(pacingVerdict(3, 30).level, 'leisurely'); // 600s/slide
  });
});
