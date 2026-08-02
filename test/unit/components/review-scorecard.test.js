/**
 * Unit: lib/authoring/review-core.js (presentation review heuristics) and
 * lib/authoring/scorecard.js (deterministic deck scorecard). Both are pure,
 * browser-safe modules the Drawing Board's Architect panel runs client-side.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { reviewText, isLabelHeading } = require('../../../lib/authoring/review-core');
const { scoreDeck } = require('../../../lib/authoring/scorecard');

const FM = '---\nmarp: true\ntheme: indaco\n---\n\n';
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

describe('scorecard: scoreDeck', () => {
  const clean = `${FM}<!-- _class: title silent -->\n\n# Q3 board review\n\nthe ask\n\n---\n\n<!-- _class: kpi -->\n\n## Revenue grew 18%, led by APAC\n\n1. 18%\n   - growth\n\n---\n\n<!-- _class: decision -->\n\n## We recommend funding APAC\n\n- option\n  - body\n\n---\n\n<!-- _class: closing -->\n\n## Fund APAC\n`;

  test('returns overall + band + five categories', () => {
    const card = scoreDeck({ source: clean, lintFindings: [], reviewFindings: reviewText(clean, { bucketOf }) });
    assert.equal(typeof card.overall, 'number');
    assert.ok(['A', 'A−', 'B+', 'B', 'C+', 'C', 'D', 'F'].includes(card.band));
    assert.equal(card.categories.length, 5);
    assert.deepEqual(card.categories.map((c) => c.key), ['structure', 'clarity', 'data', 'pacing', 'contract']);
  });

  test('a clean deck scores high', () => {
    const card = scoreDeck({ source: clean, lintFindings: [], reviewFindings: reviewText(clean, { bucketOf }) });
    assert.ok(card.overall >= 85, `expected >=85, got ${card.overall}`);
  });

  test('authoring errors tank the Contract score', () => {
    const lint = [{ rule: 'card-style-inline-title', severity: 'error' }, { rule: 'split-bodyless-item', severity: 'error' }];
    const card = scoreDeck({ source: clean, lintFindings: lint, reviewFindings: [] });
    assert.ok(card.categories.find((c) => c.key === 'contract').score <= 60);
  });

  test('a missing title drops Structure', () => {
    const noTitle = `${FM}<!-- _class: content -->\n\n## A takeaway\n\nx\n`;
    const card = scoreDeck({ source: noTitle, lintFindings: [], reviewFindings: [] });
    assert.ok(card.categories.find((c) => c.key === 'structure').score < 100);
  });

  test('label titles drop Clarity', () => {
    const labels = `${FM}<!-- _class: title silent -->\n\n# T\n\n---\n\n<!-- _class: content -->\n\n## Overview\n\nx\n`;
    const card = scoreDeck({ source: labels, lintFindings: [], reviewFindings: reviewText(labels, { bucketOf }) });
    assert.ok(card.categories.find((c) => c.key === 'clarity').score < 100);
  });

  test('Data is N/A (not a free A) on a deck with no data slides, and drops from the overall', () => {
    const noData = `${FM}<!-- _class: title silent -->\n\n# T\n\n---\n\n<!-- _class: content -->\n\n## A takeaway\n\nbody\n`;
    const card = scoreDeck({ source: noData, lintFindings: [], reviewFindings: reviewText(noData, { bucketOf }) });
    const data = card.categories.find((c) => c.key === 'data');
    assert.equal(data.na, true);
    assert.equal(data.score, null);
    assert.equal(card.categories.length, 5); // still present, just unscored
  });

  test('Data IS scored when the deck has a data slide', () => {
    const withData = `${FM}<!-- _class: kpi -->\n\n## Metrics\n\n1. 18%\n`;
    const card = scoreDeck({ source: withData, lintFindings: [], reviewFindings: reviewText(withData, { bucketOf }) });
    assert.equal(card.categories.find((c) => c.key === 'data').na, undefined);
  });
});

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
    const f = reviewText(`${FM}<!-- _class: content -->\n\n## ${'word '.repeat(16)}\n\nbody\n`, { bucketOf });
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
