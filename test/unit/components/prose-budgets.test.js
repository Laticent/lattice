/**
 * Unit: lib/authoring/prose-budgets.js — the pure, browser-safe prose-density
 * table + detectors that review-core surfaces as brevity suggestions. Phase 2 of
 * the content-capacity contract; see
 * engineering/decisions/2026-06-30-prose-density-budget.md.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  UNIVERSAL_PROSE_BUDGETS,
  SLIDE_PROSE_BUDGET,
  chromeWordCount,
  bodyWordCount,
  elementWordCounts,
  universalProseOverages,
} = require('../../../lib/authoring/prose-budgets');

describe('prose-budgets: table', () => {
  test('every budget has soft ≤ hard and a label', () => {
    for (const [kind, b] of Object.entries(UNIVERSAL_PROSE_BUDGETS)) {
      assert.ok(Number.isInteger(b.soft) && Number.isInteger(b.hard), `${kind} integer bounds`);
      assert.ok(b.soft <= b.hard, `${kind} soft ≤ hard`);
      assert.ok(b.label && b.note, `${kind} has label + note`);
    }
  });
  test('slide backstop carries the wall-of-text numbers', () => {
    assert.equal(SLIDE_PROSE_BUDGET.words, 70);
    assert.equal(SLIDE_PROSE_BUDGET.bullets, 6);
  });
});

describe('prose-budgets: chromeWordCount', () => {
  test('typographic separators delimit, they are not words', () => {
    assert.equal(chromeWordCount('Section 01 · Foundations'), 3);
    assert.equal(chromeWordCount('Financial · Q4 2026'), 3);
    assert.equal(chromeWordCount('one — two – three'), 3);
  });
  test('strips emphasis marks', () => {
    assert.equal(chromeWordCount('**bold** _italic_ `code`'), 3);
  });
});

describe('prose-budgets: bodyWordCount', () => {
  test('drops inline code (pills/values) and list markers', () => {
    // "Owns the scoring model" = 4 prose words; the `pill` and markers don't count.
    assert.equal(bodyWordCount('- Owns the scoring model `Head of Product`'), 4);
  });
  test('counts the nested body too', () => {
    assert.equal(bodyWordCount('- Title here\n  - two more words'), 5);
  });
});

describe('prose-budgets: elementWordCounts', () => {
  test('one count per top-level item, nested body folded in', () => {
    const slide = [
      '<!-- _class: cards-grid -->',
      '## Title.',
      '- Alpha card',
      '  - body of four words here',
      '- Beta card',
      '  - short body',
    ].join('\n');
    const counts = elementWordCounts(slide, 'item');
    assert.equal(counts.length, 2);
    assert.equal(counts[0], 7); // "Alpha card body of four words here"
    assert.equal(counts[1], 4); // "Beta card short body"
  });
  test('ignores list-looking lines inside fenced code', () => {
    const slide = '<!-- _class: code -->\n```\n- not an item\n- also not\n```\n';
    assert.deepEqual(elementWordCounts(slide, 'item'), []);
  });
  test('row axis counts pipe-table data rows (header + separator excluded)', () => {
    const slide = '| A | B |\n| - | - |\n| one two | three |\n| four | five six |\n';
    const counts = elementWordCounts(slide, 'row');
    assert.deepEqual(counts, [3, 3]);
  });
  test('unbudgeted axes return empty', () => {
    assert.deepEqual(elementWordCounts('- a\n- b\n', 'col'), []);
  });
});

describe('prose-budgets: universalProseOverages', () => {
  test('flags an over-budget eyebrow above a heading', () => {
    const slide = '`This eyebrow has far too many words to be a tidy label`\n\n## A heading.\n';
    const ov = universalProseOverages(slide);
    const eb = ov.find((o) => o.kind === 'eyebrow');
    assert.ok(eb, 'eyebrow detected');
    assert.equal(eb.level, 'hard'); // 10 words > hard 8
  });
  test('classifies a code-only paragraph BELOW a heading as a subtitle (not eyebrow)', () => {
    // 16 words → over the subtitle soft budget (12), so it surfaces as a subtitle.
    const long = Array.from({ length: 16 }, (_, i) => `w${i}`).join(' ');
    const ov = universalProseOverages(`## A heading.\n\n\`${long}\`\n`);
    assert.ok(ov.some((o) => o.kind === 'subtitle'));
    assert.ok(!ov.some((o) => o.kind === 'eyebrow'));
  });
  test('flags an over-budget key-insight blockquote', () => {
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    const ov = universalProseOverages(`## T.\n\n> ${long}\n`);
    const ki = ov.find((o) => o.kind === 'keyInsight');
    assert.ok(ki && ki.level === 'hard');
  });
  test('stays silent on tidy chrome', () => {
    const slide = '`Context · Foundations`\n\n## Revenue grew 18%.\n\n> One tight memorable line.\n';
    assert.deepEqual(universalProseOverages(slide), []);
  });

  test('ignores blockquotes and code-only lines INSIDE a fenced code block', () => {
    const longQuote = `> ${Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ')}`;
    const slide = `## A tidy title.\n\n\`\`\`\n${longQuote}\n\`${'x '.repeat(10).trim()}\`\n\`\`\`\n`;
    assert.deepEqual(universalProseOverages(slide), []); // all inside the fence — sample content, not chrome
  });

  test('budgets only the TRAILING blockquote, not a leading pull-quote summed in', () => {
    // Two separate 10-word blockquotes; each is within the 18-word key-insight
    // soft, so neither should fire (the old code summed them to 20 and false-fired).
    const ten = Array.from({ length: 10 }, (_, i) => `w${i}`).join(' ');
    const slide = `> ${ten}\n\n## A title.\n\n- a card\n  - body\n\n> ${ten}\n`;
    assert.ok(!universalProseOverages(slide).some((o) => o.kind === 'keyInsight'));
  });
});

// The check's full form counts exactly like its shortcut (engineering/decisions/2026-10-18-checks.md §18): moving a
// criterion from `[x] …` to `@check{pass, label="…"}` must not take it out of the density budget it was held to.
test('a check written in full counts the same as its bracket shortcut', () => {
  const { elementWordCounts } = require('../../../lib/authoring/prose-budgets.js');
  const shortcut = '- Path A\n  - [x] Residency within the European area\n  - [-] Speed\n  - [ ] Calibration\n  - [/] Adoption\n  - Body.\n';
  const full = '- Path A\n  - `@check{pass, label="Residency within the European area"}`\n  - `@check{partly, label=Speed}`\n'
    + '  - `@check{todo, label=Calibration}`\n  - `@check{na, label=Adoption}`\n  - Body.\n';
  assert.deepEqual(elementWordCounts(full, 'item'), elementWordCounts(shortcut, 'item'));
  // A span that does not read is code like any other, and counts nothing.
  assert.deepEqual(elementWordCounts('- A\n  - `@check{maybe, label=Words here}`\n', 'item'), elementWordCounts('- A\n  - `x`\n', 'item'));
});
