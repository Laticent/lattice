/**
 * Unit: lib/authoring/lint-core.js — the pure, browser-safe lint engine.
 *
 * lint-core is the SINGLE SOURCE shared by the Node CLI (via lib/authoring/
 * lint.js), lib/components/index.js's validate(), and the Drawing Board's
 * in-browser Architect panel. lint-deck.test.js covers it indirectly through
 * the Node binding; this exercises the pure API directly (lintTextWith with a
 * hand-built vocab, the detector helpers, isKnownModifier) so the contract the
 * browser depends on is locked independently of the manifests.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../../lib/authoring/lint-core');

const FM = '---\nmarp: true\ntheme: indaco\n---\n\n';
// A fixed, manifest-independent vocab — every component name used below so the
// unknown-class rule (rule 1) doesn't add noise to the targeted assertions.
const vocab = {
  names: new Set(['cards-grid', 'principles', 'split-panel', 'split-compare', 'kpi', 'gantt']),
  modifiers: new Set(['dark', 'compact', 'pullquote', 'metric']),
};
const ruleFor = (src, rule) => core.lintTextWith(src, vocab).find((f) => f.rule === rule);

describe('lint-core: detector helpers', () => {
  test('findInlineTitleBodyLine catches "- **Title.** body", null when clean', () => {
    assert.equal(core.findInlineTitleBodyLine('- **First.** body here'), '- **First.** body here');
    assert.equal(core.findInlineTitleBodyLine('- First\n  - body here'), null);
  });
  test('findBoldOrderedStatement catches bold in an ordered item', () => {
    assert.equal(core.findBoldOrderedStatement('1. a **bold** span'), '1. a **bold** span');
    assert.equal(core.findBoldOrderedStatement('1. a plain statement'), null);
  });
  test('findSplitBodylessItem catches a top-level item with no nested body', () => {
    assert.equal(core.findSplitBodylessItem('- Title. body'), '- Title. body');
    assert.equal(core.findSplitBodylessItem('- Title\n  - body'), null);
  });
  test('findOrderedInlineTitleBodyLine catches "1. **Title.** body", null when clean', () => {
    assert.equal(core.findOrderedInlineTitleBodyLine('1. **Claim.** body here'), '1. **Claim.** body here');
    assert.equal(core.findOrderedInlineTitleBodyLine('1. Claim\n   - body here'), null);
    assert.equal(core.findOrderedInlineTitleBodyLine('1. 94%'), null); // bare number, no trailing body
  });
});

describe('lint-core: isKnownModifier', () => {
  test('set membership and prefix families are known; gibberish is not', () => {
    assert.equal(core.isKnownModifier('dark', vocab), true);
    assert.equal(core.isKnownModifier('tint-corner', vocab), true); // prefix family
    assert.equal(core.isKnownModifier('mark-orbit', vocab), true);
    assert.equal(core.isKnownModifier('wobble', vocab), false);
  });
});

describe('lint-core: unknown-debug-facet', () => {
  const facetTokens = (src) =>
    core.lintTextWith(src, vocab).filter((f) => f.rule === 'unknown-debug-facet').map((f) => f.classToken);

  test('the canonical vocabulary — off / on-hover / on-always / verbose — is clean', () => {
    for (const v of ['off', 'on-hover', 'on-always', 'on-hover verbose', 'on-always verbose']) {
      assert.deepEqual(facetTokens(`---\ndebug: ${v}\n---\n\n# A\n`), [], `\`debug: ${v}\` should be clean`);
    }
  });

  test('bare `on`, dropped aliases, and typos warn (one finding per bad token)', () => {
    assert.deepEqual(facetTokens('---\ndebug: on\n---\n\n# A\n'), ['on']);
    assert.deepEqual(facetTokens('---\ndebug: sixe\n---\n\n# A\n'), ['sixe']);
    assert.deepEqual(facetTokens('---\ndebug: identity size\n---\n\n# A\n'), ['identity', 'size']);
    // No aliases: the old synonyms now warn (steering authors to the one true name).
    assert.deepEqual(facetTokens('---\ndebug: hover\n---\n\n# A\n'), ['hover']);
    assert.deepEqual(facetTokens('---\ndebug: on-hover full\n---\n\n# A\n'), ['full']);
  });

  test('a per-slide `<!-- _debug: … -->` typo warns too', () => {
    assert.deepEqual(facetTokens('# A\n\n<!-- _debug: bogus -->\n'), ['bogus']);
  });
});

describe('lint-core: the capacity budget speaks, and autosplit is retired', () => {
  const capVocab = {
    names: new Set(['checklist']),
    modifiers: new Set(),
    capacity: { checklist: { axis: 'item', sweet: 6, soft: 8, hard: 9 } },
  };
  const overflowDeck = (fmExtra = '') =>
    `---\nmarp: true\ntheme: indaco\n${fmExtra}---\n\n<!-- _class: checklist -->\n\n## H\n\n` +
    `${Array.from({ length: 14 }, (_, i) => `- [ ] item ${i + 1}`).join('\n')}\n`;

  // WHICH terminal an over-`hard` slide gets is a question about the BOX, because the SPLIT
  // move is gated on the box (lattice-emulator.js `AUTOSPLIT_APPLIES`): square · tall · strip
  // paginate, `wide` does not — 16:9 is the box a deck is AUTHORED in, and the engine does not
  // re-cut a slide its author composed. So the linter forks the same way, and each half must
  // describe the terminal that actually happens.
  test('at a LANDSCAPE @size there is no split move — a 14-item checklist warns about overflow', () => {
    for (const fmExtra of ['', 'size: 16:9\n', 'size: 4K\n']) {
      const out = core.lintTextWith(overflowDeck(fmExtra), capVocab);
      const f = out.find((x) => x.rule === 'capacity-overflow');
      assert.ok(f, `expected capacity-overflow for ${JSON.stringify(fmExtra) || 'the default @size'}`);
      assert.equal(f.severity, 'warning', 'the author has to act — this is not advisory');
      assert.match(f.fix, /Nothing will divide it for you/, 'and it says why nothing will be split for them');
      assert.match(f.fix, /Content clipped/, 'and names what the export actually shows');
      assert.doesNotMatch(f.message, /expect it to overflow|will overflow/,
        'a COUNT may not predict FIT — that is the error this whole change removed from the splitter');
      assert.equal(out.find((x) => x.rule === 'capacity-autosplit'), undefined,
        'promising a split that the size gate forbids is the lie-to-the-author defect');
    }
  });

  // `hd` and `4K` are the SAME box — cqi is width-relative, so a 3840×2160 render is a
  // 1920×1080 render at 2×, identical layout and identical fit. Both are `wide`, so both take
  // the overflow branch above; the loop asserts it rather than leaving it to be assumed.

  test('at a PORTRAIT @size the slide may be divided — the advisory, at info tier', () => {
    const out = core.lintTextWith(overflowDeck('size: portrait\n'), capVocab);
    const f = out.find((x) => x.rule === 'capacity-autosplit');
    assert.ok(f, 'expected the capacity-autosplit advisory');
    assert.equal(f.severity, 'info', 'advisory tier — a deliberate split must not red `lint:deck --strict`');
    assert.equal(out.find((x) => x.rule === 'capacity-overflow'), undefined);
  });

  // The advisory states the split EXACTLY, because the split is now knowable without rendering
  // (2026-09-01): one structural element per page, and the trigger is the structure the author
  // can see in their own markup. It used to be conditional ("if it does not fit") and bounded
  // from below ("or more pages"), because the measured trigger could decline to fire at all and
  // could cut smaller pages than the manifest asked for. Neither hedge is true any more, and a
  // hedge that is not true is worse than no advisory — the author cannot act on it.
  test('the advisory states the split exactly — no "if it fits", no "or more"', () => {
    const f = core.lintTextWith(overflowDeck('size: portrait\n'), capVocab)
      .find((x) => x.rule === 'capacity-autosplit');
    assert.match(f.message, /pages of 1 — one item per page/, 'the pacing is stated, not bounded');
    assert.doesNotMatch(f.message, /if it does not fit/, 'the split is not conditional on fit');
    assert.doesNotMatch(f.message, /or more/, 'and the page count is exact');
    assert.match(f.message, /this slide has 14, so at tall auto-split makes it a cover \+ 14 pages of 1/);
  });

  // The advisory's fix text describes what the split will DO, so it must not promise a
  // cover the run won't get: `splitEnvelope` needs an `<h2>` masthead to build one and
  // returns null without it (→ the bare partition). Caught in review on #1191.
  test('capacity-autosplit promises a cover only when the slide HAS a `## ` headline', () => {
    const f = core.lintTextWith(overflowDeck('size: portrait\n'), capVocab)
      .find((x) => x.rule === 'capacity-autosplit');
    assert.ok(f);
    assert.match(f.fix, /leads with a cover/);
  });

  test('capacity-autosplit says NO cover on a title-less slide, and to add a headline', () => {
    const titleless =
      '---\nmarp: true\ntheme: indaco\nsize: portrait\n---\n\n<!-- _class: checklist -->\n\n' +
      `${Array.from({ length: 14 }, (_, i) => `- [ ] item ${i + 1}`).join('\n')}\n`;
    const f = core.lintTextWith(titleless, capVocab).find((x) => x.rule === 'capacity-autosplit');
    assert.ok(f, 'the advisory still fires on a title-less slide');
    assert.doesNotMatch(f.fix, /leads with a cover/, 'must not promise a cover it will not get');
    assert.match(f.fix, /no `## ` headline/);
  });

  // A retired directive is FLAGGED, not ignored. Silence would read as "this still
  // works", and a deck carrying `autosplit: off` would look opted-out while the engine
  // paginated it anyway — which is why `off` is the error and `on` is only a suggestion.
  test('autosplit: off is an ERROR — it asks for something the engine no longer offers', () => {
    // The MESSAGE is family-aware, because "this deck paginates anyway" is only true where the
    // split move runs. It shipped once asserting it unconditionally, which was false at the
    // DEFAULT @size — the lie-to-the-author defect inside the rule that exists to prevent it.
    const f = core.lintTextWith(overflowDeck('size: portrait\nautosplit: off\n'), capVocab)
      .find((x) => x.rule === 'autosplit-retired');
    assert.ok(f, 'expected autosplit-retired');
    assert.equal(f.severity, 'error');
    assert.match(f.message, /WILL paginate/);

    const wide = core.lintTextWith(overflowDeck('autosplit: off\n'), capVocab)
      .find((x) => x.rule === 'autosplit-retired');
    assert.equal(wide.severity, 'error', 'still an error — the directive is retired either way');
    assert.doesNotMatch(wide.message, /WILL paginate/,
      'at a landscape @size nothing paginates, so the message must not claim it does');
    assert.match(wide.message, /does not run there/);
    assert.match(f.fix, /stress-slide/, 'points at the per-slide replacement');
    assert.match(f.fix, /--no-split/, 'and at the tool flag for measurement rigs');
  });

  test('autosplit: on is a SUGGESTION — it asks for what already happens', () => {
    const f = core.lintTextWith(overflowDeck('autosplit: on\n'), capVocab)
      .find((x) => x.rule === 'autosplit-retired');
    assert.ok(f);
    assert.equal(f.severity, 'suggestion');
  });

  test('a deck that never mentions the directive is not flagged', () => {
    assert.equal(
      core.lintTextWith(overflowDeck('size: portrait\n'), capVocab).find((x) => x.rule === 'autosplit-retired'),
      undefined,
    );
  });
});

describe('lint-core: lintTextWith rules', () => {
  test('returns an array and skips front matter (slide 0)', () => {
    const out = core.lintTextWith(`${FM}<!-- _class: cards-grid -->\n\n## H\n\n- A\n  - b\n`, vocab);
    assert.ok(Array.isArray(out));
    assert.equal(out.length, 0);
  });

  test('rule 1 — unknown class token is flagged (warning)', () => {
    const f = ruleFor(`${FM}<!-- _class: cards-gridd -->\n\n## H\n\n- A\n  - b\n`, 'unknown-class');
    assert.ok(f);
    assert.equal(f.severity, 'warning');
    assert.equal(f.classToken, 'cards-gridd');
  });

  test('rule 1 — known name + known modifier produce no unknown-class', () => {
    assert.equal(ruleFor(`${FM}<!-- _class: cards-grid dark compact -->\n\n## H\n\n- A\n  - b\n`, 'unknown-class'), undefined);
  });

  test('rule 2 — card-style inline title+body is an error', () => {
    const f = ruleFor(`${FM}<!-- _class: cards-grid -->\n\n## H\n\n- **First.** inline body\n`, 'card-style-inline-title');
    assert.ok(f);
    assert.equal(f.severity, 'error');
    assert.equal(f.classToken, 'cards-grid');
  });

  test('rule 2 — card-style ORDERED inline title+body is also an error', () => {
    const f = ruleFor(`${FM}<!-- _class: cards-grid -->\n\n## H\n\n1. **Claim.** inline body\n`, 'card-style-inline-title');
    assert.ok(f, 'ordered `1. **Title.** body` on a card-style layout must be flagged');
    assert.equal(f.severity, 'error');
  });

  test('rule 2b — unordered inline title+body on a ledger/numbered layout is an error', () => {
    const f = ruleFor(`${FM}<!-- _class: kpi -->\n\n## H\n\n- **Platform licensing.** $1.2M — 3-year commitment.\n`, 'ledger-inline-title');
    assert.ok(f, 'ledger layouts want a numbered list, not an unordered bold lead-in');
    assert.equal(f.severity, 'error');
    assert.equal(f.classToken, 'kpi');
  });

  test('rule 2b — a correctly authored numbered ledger slide is clean', () => {
    assert.equal(ruleFor(`${FM}<!-- _class: kpi -->\n\n## H\n\n1. 94%\n   - label\n`, 'ledger-inline-title'), undefined);
  });

  test('rule 3 — bold in an ordered statement (principles) is an error', () => {
    const f = ruleFor(`${FM}<!-- _class: principles -->\n\n1. a **bold** span\n`, 'statement-ol-bold');
    assert.ok(f);
    assert.equal(f.severity, 'error');
  });

  test('rule 4 — split right-panel item with no nested body is an error', () => {
    const f = ruleFor(`${FM}<!-- _class: split-panel -->\n\n## Head\n\n- Title. body\n`, 'split-bodyless-item');
    assert.ok(f);
    assert.equal(f.severity, 'error');
  });

  test('rule 5 — h2-anchored split slide with no "## " headline is a warning', () => {
    const f = ruleFor(`${FM}<!-- _class: split-panel -->\n\n- Title\n  - body\n`, 'split-missing-headline');
    assert.ok(f);
    assert.equal(f.severity, 'warning');
  });

  test('rule 6 — split-statement with no blockquote is a warning', () => {
    const f = ruleFor(`${FM}<!-- _class: split-panel pullquote -->\n\n## Head\n\n- Title\n  - body\n`, 'split-statement-missing-quote');
    assert.ok(f);
    assert.equal(f.severity, 'warning');
  });

  test('rule 7 — split-compare without exactly two options is a warning', () => {
    const f = ruleFor(`${FM}<!-- _class: split-compare -->\n\n## Head\n\n- A\n  - x\n- B\n  - y\n- C\n  - z\n`, 'split-compare-option-count');
    assert.ok(f);
    assert.equal(f.severity, 'warning');
  });

  test('rule 8 — kpi number item with no nested label is a warning', () => {
    const f = ruleFor(`${FM}<!-- _class: kpi -->\n\n1. 73%\n`, 'number-slot-bodyless-item');
    assert.ok(f);
    assert.equal(f.severity, 'warning');
  });

  test('a clean card-style deck yields no findings', () => {
    assert.equal(core.lintTextWith(`${FM}<!-- _class: cards-grid -->\n\n## H\n\n- First\n  - body\n- Second\n  - body\n`, vocab).length, 0);
  });
});

describe('lint-core: auto-fix', () => {
  test('autofixNestedTitle converts the bold inline shape; null otherwise', () => {
    assert.equal(core.autofixNestedTitle('- **Title.** body here'), '- Title\n  - body here');
    assert.equal(core.autofixNestedTitle('* **A** b'), '* A\n  * b');
    assert.equal(core.autofixNestedTitle('- bare title'), null); // nothing to split
    assert.equal(core.autofixNestedTitle('- Title. body'), null); // non-bold = ambiguous, not auto-fixed
  });

  test('card-style inline-title findings are flagged autofixable', () => {
    const f = ruleFor(`${FM}<!-- _class: cards-grid -->\n\n## H\n\n- **First.** inline body\n`, 'card-style-inline-title');
    assert.equal(f.autofixable, true);
  });

  test('applyFix rewrites the offending line in place, and the result re-lints clean', () => {
    const src = `${FM}<!-- _class: cards-grid -->\n\n## H\n\n- **First.** inline body\n`;
    const f = ruleFor(src, 'card-style-inline-title');
    const fixed = core.applyFix(src, f);
    assert.ok(fixed.includes('- First\n  - inline body'));
    assert.equal(core.lintTextWith(fixed, vocab).some((x) => x.rule === 'card-style-inline-title'), false);
  });

  test('applyFix targets the finding\'s own slide, not an identical line elsewhere', () => {
    const bad = '<!-- _class: cards-grid -->\n\n- **Dup.** body\n';
    const src = `${FM}${bad}---\n${bad}`;
    const findings = core.lintTextWith(src, vocab).filter((x) => x.rule === 'card-style-inline-title');
    assert.equal(findings.length, 2);
    const fixed = core.applyFix(src, findings[1]); // fix the SECOND slide only
    assert.equal(core.lintTextWith(fixed, vocab).filter((x) => x.rule === 'card-style-inline-title').length, 1);
  });

  test('applyFix returns null for a non-autofixable finding', () => {
    const f = ruleFor(`${FM}<!-- _class: split-panel pullquote -->\n\n## Head\n\n- Title\n  - body\n`, 'split-statement-missing-quote');
    assert.equal(core.applyFix('x', f), null);
  });

  test('autofixOrderedNestedTitle converts to the numbered ledger shape; null otherwise', () => {
    assert.equal(core.autofixOrderedNestedTitle('- **Plan.** ship it'), '1. Plan\n   - ship it');
    assert.equal(core.autofixOrderedNestedTitle('  - **A** b'), '  1. A\n     - b'); // indentation preserved
    assert.equal(core.autofixOrderedNestedTitle('- bare title'), null);
  });

  test('ledger inline-title is autofixable; applyFix writes the numbered shape and re-lints clean', () => {
    const src = `${FM}<!-- _class: kpi -->\n\n## H\n\n- **Build.** in-house\n`;
    const f = ruleFor(src, 'ledger-inline-title');
    assert.equal(f.autofixable, true);
    const fixed = core.applyFix(src, f);
    assert.ok(fixed.includes('1. Build\n   - in-house'));
    assert.equal(core.lintTextWith(fixed, vocab).some((x) => x.rule === 'ledger-inline-title'), false);
  });

  test('autofixGanttDelimiter swaps a retired delimiter only in the TRAILING span pills; null otherwise', () => {
    assert.equal(core.autofixGanttDelimiter('- Design `Q1→Q2`'), '- Design `Q1..Q2`');
    assert.equal(core.autofixGanttDelimiter('  - Build `Q1 -> Q3` `after: Design`'), '  - Build `Q1..Q3` `after: Design`');
    assert.equal(core.autofixGanttDelimiter('- No delim `Q1..Q2`'), null);
    assert.equal(core.autofixGanttDelimiter('prose with a → arrow, no code'), null); // outside a code span → untouched
    // Inline code in the LABEL (not a trailing pill) is prose — it must be left alone.
    assert.equal(core.autofixGanttDelimiter('- See `a->b` ref `Q1→Q2`'), '- See `a->b` ref `Q1..Q2`');
  });

  test('gantt retired-delimiter is autofixable; applyFix swaps it and re-lints clean', () => {
    const src = `${FM}<!-- _class: gantt -->\n\n## Plan\n\n- Phase 1\n  - Design \`Q1→Q2\`\n`;
    const f = ruleFor(src, 'gantt-retired-delimiter');
    assert.equal(f.autofixable, true);
    const fixed = core.applyFix(src, f);
    assert.ok(fixed.includes('  - Design `Q1..Q2`')); // indentation preserved
    assert.equal(core.lintTextWith(fixed, vocab).some((x) => x.rule === 'gantt-retired-delimiter'), false);
  });

  test('retiredQuadrantAxis rewrites every shipped retired shape; null for an ordinary eyebrow', () => {
    assert.equal(core.retiredQuadrantAxis('Effort 0–10 → Reach 0–100'), '[{Effort, 0..10}, {Reach, 0..100}]');
    // The detached `targets` blob moves INTO the axis each number constrains.
    assert.equal(core.retiredQuadrantAxis('Effort 0–10 → Reach 0–100 · targets 5, 50'), '[{Effort, 0..10, 5}, {Reach, 0..100, 50}]');
    // The ASCII spelling the old transform never honored still means what it says.
    assert.equal(core.retiredQuadrantAxis('Effort 0-10 -> Reach 0-100'), '[{Effort, 0..10}, {Reach, 0..100}]');
    assert.equal(core.retiredQuadrantAxis('Effort → Reach'), '[Effort, Reach]');
    // A comma in a name is quoted, or it would split into a third axis.
    assert.equal(core.retiredQuadrantAxis('Cost, ex tax 0–5 → Reach'), '[{"Cost, ex tax", 0..5}, Reach]');
    assert.equal(core.retiredQuadrantAxis('Impact vs effort'), null, 'a plain eyebrow stays an eyebrow');
    assert.equal(core.retiredQuadrantAxis('0–10 → 0–100'), null, 'a domain with no name cannot be expressed');
    assert.equal(core.retiredQuadrantAxis('[Effort, Reach]'), null);
  });

  test('quadrant retired axis is an autofixable error; applyFix rewrites it and re-lints clean', () => {
    const src = `${FM}<!-- _class: quadrant -->\n\n\`Effort 0–10 → Reach 0–100\`\n\n## H\n\n- Bets\n  - A \`3, 70\`\n`;
    const f = ruleFor(src, 'quadrant-retired-axis');
    assert.equal(f.severity, 'error');
    assert.equal(f.autofixable, true);
    const fixed = core.applyFix(src, f);
    assert.ok(fixed.includes('`[{Effort, 0..10}, {Reach, 0..100}]`'));
    const after = core.lintTextWith(fixed, vocab).map((x) => x.rule);
    assert.equal(after.includes('quadrant-retired-axis'), false);
    // The fix's own output must not trip a sibling rule on the same line.
    assert.equal(after.some((r) => /^label-set-|typed-shape-glyph|quadrant-axis-part/.test(r)), false, after.join(', '));
  });

  test('quadrant axis rules are scoped: radar quadrant, a gantt, and a line BELOW the list are left alone', () => {
    const retired = '`Effort 0–10 → Reach 0–100`';
    assert.equal(core.findQuadrantAxisIssues(`${FM}<!-- _class: radar quadrant -->\n\n${retired}\n\n## H\n\n- a\n`).length, 0);
    assert.equal(core.findQuadrantAxisIssues(`${FM}<!-- _class: gantt -->\n\n${retired}\n\n## H\n\n- a\n`).length, 0);
    assert.equal(core.findQuadrantAxisIssues(`${FM}<!-- _class: quadrant -->\n\n## H\n\n- a\n  - b \`1, 2\`\n\n${retired}\n`).length, 0);
  });

  test('retiredQuadrantAxis keeps what the old parser kept', () => {
    // `.5` was a number to the old `[\d.]+` range reader.
    assert.equal(core.retiredQuadrantAxis('Effort 1.5–2.5 → Reach .5–1'), '[{Effort, 1.5..2.5}, {Reach, .5..1}]');
    // A reversed range was never a domain; it was part of the name.
    assert.equal(core.retiredQuadrantAxis('Effort 10–0 → Reach 100–0'), '[Effort 10–0, Reach 100–0]');
    // The author's own quotes survive; the wrapping quote is the other kind.
    assert.equal(core.retiredQuadrantAxis('Effort "fast", ish 0–10 → Reach'), `[{'Effort "fast", ish', 0..10}, Reach]`);
  });

  test('quadrant axis rules skip a line inside an HTML comment, like the render', () => {
    const src = `${FM}<!-- _class: quadrant -->\n\n<!--\n\`Effort 0–10 → Reach 0–100\`\n-->\n\n## H\n\n- a\n  - b \`1, 2\`\n`;
    assert.equal(core.findQuadrantAxisIssues(src).length, 0);
  });

  test('a list with more members than axes is named: it prints as text, not as the axis', () => {
    const src = `${FM}<!-- _class: quadrant -->\n\n\`[Effort, Reach, Spend]\`\n\n## H\n\n- a\n  - b \`1, 2\`\n`;
    assert.match(ruleFor(src, 'quadrant-axis-part').message, /3 members but a quadrant has two axes/);
  });

  test('quadrant-axis-part names a part the chart ignores', () => {
    const src = `${FM}<!-- _class: quadrant -->\n\n\`[{Effort, 10..0}, {Reach, 0..100, soon}]\`\n\n## H\n\n- a\n  - b \`1, 2\`\n`;
    const f = ruleFor(src, 'quadrant-axis-part');
    assert.match(f.message, /`10\.\.0`, `soon`/);
    assert.equal(ruleFor(src.replace('10..0', '0..10').replace(', soon', ', 50'), 'quadrant-axis-part'), undefined);
  });

  test('applyAllFixes clears every autofixable finding across passes', () => {
    // Two inline-bold items on one slide: the rule flags the first per pass, so
    // applyAllFixes must loop (re-lint after each fix) to clear both.
    const src = `${FM}<!-- _class: cards-grid -->\n\n## H\n\n- **A.** one\n- **B.** two\n`;
    const fixed = core.applyAllFixes(src, vocab);
    assert.ok(fixed.includes('- A\n  - one'));
    assert.ok(fixed.includes('- B\n  - two'));
    assert.equal(core.lintTextWith(fixed, vocab).some((x) => x.autofixable), false);
  });

  test('replaceToken swaps a whole token, never a substring, and reports a miss', () => {
    assert.equal(core.replaceToken('<!-- _class: kpu dark -->', 'kpu', 'kpi'), '<!-- _class: kpi dark -->');
    assert.equal(core.replaceToken('finish: atrum', 'atrum', 'atrium'), 'finish: atrium');
    // The token is a WORD. A substring replace would rewrite the `text` inside
    // `pretext` and leave the author's prose quietly edited.
    assert.equal(core.replaceToken('pretext and text', 'text', 'X'), 'pretext and X');
    assert.equal(core.replaceToken('nothing here', 'kpu', 'kpi'), null, 'a miss is null, not the unchanged line');
    // A regex-special character in the value is matched literally, not compiled.
    assert.equal(core.replaceToken('mode: a.b', 'a.b', 'ab'), 'mode: ab');
    assert.equal(core.replaceToken('mode: axb', 'a.b', 'ab'), null);
  });

  test('withTokenSuggestion attaches a machine fix only when one candidate is close', () => {
    const near = core.withTokenSuggestion({ classToken: 'atrum', message: 'm' }, ['atrium', 'halo', 'loom']);
    assert.equal(near.autofixable, true);
    assert.equal(near.didYouMean, 'atrium');
    assert.deepEqual(near.replace, { from: 'atrum', to: 'atrium' });
    // Nothing close → the finding is returned untouched, keeping its prose guidance.
    const far = core.withTokenSuggestion({ classToken: 'zzzzzzzz', message: 'm' }, ['atrium', 'halo']);
    assert.equal(far.autofixable, undefined);
    assert.equal(far.replace, undefined);
    // The message is NOT rewritten — every existing surface prints and asserts it;
    // the suggestion rides on `didYouMean`, which is what names the button.
    assert.equal(near.message, 'm');
  });

  test('a typo\'d `_class` token is one-click fixable, and applyAllFixes lands it', () => {
    const src = `${FM}<!-- _class: kpu -->\n\n# 42%\n`;
    const f = ruleFor(src, 'unknown-class');
    assert.equal(f.autofixable, true, 'a near-miss component name offers a machine fix');
    assert.equal(f.didYouMean, 'kpi');
    const fixed = core.applyFix(src, f);
    assert.ok(fixed.includes('<!-- _class: kpi -->'));
    assert.equal(core.lintTextWith(fixed, vocab).some((x) => x.rule === 'unknown-class'), false);
    assert.ok(core.applyAllFixes(src, vocab).includes('<!-- _class: kpi -->'));
  });

  test('a typo\'d front-matter REGISTER value is one-click fixable too', () => {
    // The register validators all report the same shape (a value + the list it should
    // have come from) and could only ever offer prose. This is the shared arm.
    const src = '---\nmarp: true\ntheme: indaco\nfinish: atrum\n---\n\n# T\n';
    const v = { ...vocab, finishNames: ['none', 'atrium', 'halo', 'loom'] };
    const f = core.lintTextWith(src, v).find((x) => x.rule === 'unknown-finish');
    assert.equal(f.autofixable, true);
    assert.equal(f.didYouMean, 'atrium');
    const fixed = core.applyFix(src, f);
    assert.ok(fixed.includes('finish: atrium'));
    assert.equal(core.lintTextWith(fixed, v).some((x) => x.rule === 'unknown-finish'), false);
  });

  test('an unknown value with NO near candidate stays prose-only — no misleading button', () => {
    // `sketch` is a MODE, not a finish (the message says so). A suggestion engine that
    // reached for the nearest thing regardless would offer to rewrite it to an unrelated
    // register; `nearestRegion`'s length-scaled bound is what stops that.
    const src = '---\nmarp: true\ntheme: indaco\nfinish: sketch\n---\n\n# T\n';
    const v = { ...vocab, finishNames: ['none', 'atrium', 'halo', 'loom', 'gallery'] };
    const f = core.lintTextWith(src, v).find((x) => x.rule === 'unknown-finish');
    assert.equal(f.autofixable, undefined);
    assert.ok(f.fix, 'it keeps the prose guidance instead');
  });

  test('applyAllFixes is a no-op on a clean deck', () => {
    const src = `${FM}<!-- _class: cards-grid -->\n\n## H\n\n- A\n  - one\n`;
    assert.equal(core.applyAllFixes(src, vocab), src);
  });

  test('applyFix scopes fence-aware: a fenced --- before the target does not desync the fix', () => {
    // Slide 1 DEMONSTRATES markdown (a `---` inside a code fence); slide 2 has an
    // autofixable inline-title. The fix must still target slide 2 — a fence-blind chunk
    // walk would mis-scope, return null, and (via applyAllFixes' break) halt the pass.
    const code = '<!-- _class: code -->\n\n```md\ntitle: X\n---\nbody\n```\n';
    const bad = '<!-- _class: cards-grid -->\n\n## H\n\n- **First.** inline body\n';
    const src = `${FM}${code}---\n${bad}`;
    const f = ruleFor(src, 'card-style-inline-title');
    assert.equal(f.slide, 2, 'the finding is numbered fence-aware (slide 2, not 3)');
    const fixed = core.applyFix(src, f);
    assert.ok(fixed?.includes('- First\n  - inline body'), 'the fix applied to slide 2');
    assert.ok(fixed.includes('title: X\n---\nbody'), 'the fenced code sample is untouched');
    // …and the batch pass clears it rather than halting on it.
    const all = core.applyAllFixes(src, vocab);
    assert.equal(core.lintTextWith(all, vocab).some((x) => x.rule === 'card-style-inline-title'), false);
  });
});

describe('lint-core: focus directive grammar (rule 11)', () => {
  const slide = (dirs) => `${FM}<!-- _class: cards-grid -->\n${dirs}\n\n## Head\n\n- A\n  - a\n- B\n  - b\n`;
  test('valid _focus specs pass clean', () => {
    for (const spec of ['row 4', 'item 3', 'col 5', 'cell 4,5', 'line 3-4', 'row 2, row 5', 'item 2-4']) {
      assert.equal(ruleFor(slide(`<!-- _focus: ${spec} -->`), 'focus-spec'), undefined, spec);
    }
  });
  test('unknown axis is flagged', () => {
    assert.match(ruleFor(slide('<!-- _focus: rows 4 -->'), 'focus-spec').message, /not a focus axis/);
  });
  test('malformed cell is flagged', () => {
    assert.match(ruleFor(slide('<!-- _focus: cell 4 -->'), 'focus-spec').message, /R,C/);
  });
  test('non-numeric ordinal is flagged', () => {
    assert.match(ruleFor(slide('<!-- _focus: row abc -->'), 'focus-spec').message, /ordinal/);
  });
  test('unknown _focusStyle is flagged, valid ones pass', () => {
    assert.match(ruleFor(slide('<!-- _focusStyle: glow -->'), 'focus-style').message, /spotlight \| ring \| list-fill/);
    for (const s of ['spotlight', 'ring', 'list-fill', 'blur', 'pop']) {
      assert.equal(ruleFor(slide(`<!-- _focusStyle: ${s} -->`), 'focus-style'), undefined, s);
    }
  });
  test('malformed _focusSteps step is flagged', () => {
    assert.match(ruleFor(slide('<!-- _focusSteps: item 1 | rows 2 -->'), 'focus-steps').message, /not a focus axis/);
    assert.equal(ruleFor(slide('<!-- _focusSteps: item 1 | item 2 -->'), 'focus-steps'), undefined);
  });
});

describe('lint-core: countPrimaryCollection', () => {
  test('item axis counts top-level list markers, ignores nested bodies', () => {
    const s = '<!-- _class: cards-grid -->\n\n## H\n\n- A\n  - body a\n- B\n  - body b\n- C\n';
    assert.equal(core.countPrimaryCollection(s, 'item'), 3);
  });
  test('item axis counts ordered markers too', () => {
    assert.equal(core.countPrimaryCollection('1. one\n2. two\n3. three\n', 'item'), 3);
  });
  test('item axis ignores list lines inside fenced code', () => {
    const s = '## H\n\n- real\n\n```\n- not a real item\n- nor this\n```\n';
    assert.equal(core.countPrimaryCollection(s, 'item'), 1);
  });
  test('row axis counts table data rows (excludes header + separator)', () => {
    const t = '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n';
    assert.equal(core.countPrimaryCollection(t, 'row'), 3);
  });
  test('row axis: a dash-placeholder data row is not mistaken for the separator', () => {
    const t = '| Metric | A | B |\n|---|---|---|\n| Latency | - | - |\n| Cost | 1 | 2 |\n| Uptime | 9 | 9 |\n';
    assert.equal(core.countPrimaryCollection(t, 'row'), 3);
  });
  test('col axis counts header cells', () => {
    const t = '| A | B | C |\n|---|---|---|\n| 1 | 2 | 3 |\n';
    assert.equal(core.countPrimaryCollection(t, 'col'), 3);
  });
  test('line axis counts the first fenced code block lines', () => {
    assert.equal(core.countPrimaryCollection('```\nx\ny\nz\n```\n', 'line'), 3);
  });
  test('returns 0 when nothing of the axis is present', () => {
    assert.equal(core.countPrimaryCollection('## just a heading\n', 'item'), 0);
    assert.equal(core.countPrimaryCollection('- a\n- b\n', 'row'), 0);
  });
});

describe('lint-core: axisNoun', () => {
  test('col reads as column(s), others pluralize plainly', () => {
    assert.equal(core.axisNoun('col', 1), 'column');
    assert.equal(core.axisNoun('col', 3), 'columns');
    assert.equal(core.axisNoun('item', 1), 'item');
    assert.equal(core.axisNoun('item', 2), 'items');
    assert.equal(core.axisNoun('row', 4), 'rows');
  });
});

describe('lint-core: capacity rule', () => {
  // A vocab carrying a capacity contract for one layout, plus its name so the
  // unknown-class rule stays quiet.
  const capVocab = {
    names: new Set(['cards-grid', 'table']),
    modifiers: new Set(),
    capacity: {
      'cards-grid': { axis: 'item', min: 2, sweet: 3, soft: 4, hard: 5, escalateTo: ['list-tabular', 'split across slides'], note: 'the grid loses scannability past four cards' },
      'table': { axis: 'row', sweet: 4, soft: 6, hard: 8, escalateTo: ['split across slides'] },
    },
  };
  const capRule = (src, rule) => core.lintTextWith(src, capVocab).find((f) => f.rule === rule);
  const itemsSlide = (n) => `${FM}<!-- _class: cards-grid -->\n\n## H\n\n` + Array.from({ length: n }, (_, i) => `- Item ${i + 1}\n  - body ${i + 1}\n`).join('');

  test('within soft → no capacity finding', () => {
    const out = core.lintTextWith(itemsSlide(4), capVocab);
    assert.equal(out.filter((f) => f.rule.startsWith('capacity')).length, 0);
  });
  test('past soft (but within hard) → crowd warning with escalateTo fix', () => {
    const f = capRule(itemsSlide(5), 'capacity-crowd');
    assert.ok(f, 'expected a capacity-crowd finding at 5 items');
    assert.equal(f.severity, 'warning');
    assert.equal(f.classToken, 'cards-grid');
    assert.match(f.message, /this slide has 5/);
    assert.match(f.fix, /list-tabular/);
  });
  test('past hard at WIDE → the overflow warning; the split move is gated off there', () => {
    const f = capRule(itemsSlide(8), 'capacity-overflow');
    assert.ok(f, 'expected a capacity-overflow finding at 8 items');
    assert.equal(f.severity, 'warning');
    assert.match(f.message, /does not paginate — so if it does not fit, it is clipped/);
    assert.match(f.fix, /list-tabular/, 'the escalateTo fix still leads');
    assert.equal(capRule(itemsSlide(8), 'capacity-autosplit'), undefined, 'nothing will be split at 16:9');
    // overflow and crowd stay mutually exclusive per slide
    assert.equal(capRule(itemsSlide(8), 'capacity-crowd'), undefined);
  });
  test('past hard at PORTRAIT → the split advisory instead, at info tier', () => {
    const portrait = itemsSlide(8).replace('theme: indaco\n', 'theme: indaco\nsize: portrait\n');
    assert.equal(capRule(portrait, 'capacity-overflow'), undefined);
    const f = capRule(portrait, 'capacity-autosplit');
    assert.ok(f, 'expected a capacity-autosplit finding at 8 items');
    assert.equal(f.severity, 'info', 'advisory tier — a deliberate split must not red --strict');
    assert.match(f.message, /auto-split makes it a cover \+ 8 pages of 1/);
    assert.equal(capRule(portrait, 'capacity-crowd'), undefined);
  });
  test('table layout counts the row axis', () => {
    const rows = (n) => `${FM}<!-- _class: table -->\n\n## H\n\n| A | B |\n|---|---|\n` + Array.from({ length: n }, (_, i) => `| ${i} | x |\n`).join('');
    assert.equal(capRule(rows(6), 'capacity-crowd'), undefined); // 6 == soft, not past
    assert.ok(capRule(rows(7), 'capacity-crowd'), 'expected crowd at 7 rows');
    assert.ok(capRule(rows(9), 'capacity-overflow'), 'expected the overflow warning at 9 rows');
  });
  test('no capacity data → rule is inert', () => {
    const out = core.lintTextWith(itemsSlide(20), { names: new Set(['cards-grid']), modifiers: new Set() });
    assert.equal(out.filter((f) => f.rule.startsWith('capacity')).length, 0);
  });
});

describe('lint-core: conflicting-variants (mutually-exclusive per-slide axes)', () => {
  const axVocab = {
    names: new Set(['kpi']),
    modifiers: new Set([
      'dark', 'tone-pass', 'tone-warn', 'tone-fail', 'scale-l', 'scale-xl',
      'with-period', 'no-period', 'compact', 'claim-quiet', 'claim-hero', 'finish', 'finish-atrium',
      'finish-meridian', 'finish-none',
    ]),
    exclusiveAxes: {
      tone: ['tone-pass', 'tone-warn', 'tone-fail', 'tone-skip'],
      scale: ['scale-l', 'scale-xl', 'scale-2xl'],
      period: ['with-period', 'no-period'],
      claim: ['claim-framed', 'claim-quiet', 'claim-hero', 'claim-bleed'],
    },
  };
  const conflict = (cls) => core.lintTextWith(`${FM}<!-- _class: ${cls} -->\n\n## H`, axVocab).find((f) => f.rule === 'conflicting-variants');

  test('two tones conflict', () => {
    const f = conflict('kpi tone-warn tone-fail');
    assert.ok(f, 'expected a conflicting-variants finding');
    assert.equal(f.severity, 'warning');
    assert.match(f.message, /tone/);
  });
  test('two type scales conflict', () => assert.ok(conflict('kpi scale-l scale-xl')));
  test('with-period + no-period conflict', () => assert.ok(conflict('kpi with-period no-period')));
  test('two claim presets conflict', () => assert.ok(conflict('kpi claim-quiet claim-hero')));
  test('a single axis member is clean', () => assert.equal(conflict('kpi tone-warn scale-l compact'), undefined));
  test('two finish presets conflict (dynamic axis)', () => {
    const f = conflict('kpi finish-atrium finish-meridian');
    assert.ok(f);
    assert.match(f.message, /finish/);
  });
  test('a finish preset + finish-none opt-out conflict', () => assert.ok(conflict('kpi finish-atrium finish-none')));
  test('a single finish is clean', () => assert.equal(conflict('kpi finish-atrium'), undefined));
  test('finish-preview is not a real finish (no conflict with a preset)', () => assert.equal(conflict('kpi finish-preview finish-atrium'), undefined));
  test('no exclusiveAxes vocab → rule inert (except finish prefix)', () => {
    const out = core.lintTextWith(`${FM}<!-- _class: kpi tone-warn tone-fail -->\n\n## H`, { names: new Set(['kpi']), modifiers: new Set(['tone-warn', 'tone-fail']) });
    assert.equal(out.filter((f) => f.rule === 'conflicting-variants').length, 0);
  });
});

describe('lint-core: claim safety (2026-07-03 claim decision §8)', () => {
  const cvocab = {
    names: new Set(['table', 'big-number']),
    modifiers: new Set(['claim-bleed', 'claim-hero', 'claim-quiet', 'claim-framed']),
    claimExcludes: { 'table': ['claim-bleed'] },
    claimNames: ['framed', 'quiet', 'hero', 'bleed'],
  };
  const table = (cls) => `${FM}<!-- _class: ${cls} -->\n\n## H\n\n| a | b |\n| - | - |\n| 1 | 2 |\n`;
  const has = (src, rule) => core.lintTextWith(src, cvocab).some((f) => f.rule === rule);

  test('per-slide claim-bleed on an excluding component warns', () => {
    assert.ok(has(table('table claim-bleed'), 'claim-bleed-unsafe'));
  });
  test('claim-bleed on a non-excluding component is silent', () => {
    assert.equal(has(`${FM}<!-- _class: big-number claim-bleed -->\n\n- 42\n  - x\n`, 'claim-bleed-unsafe'), false);
  });
  test('deck-wide claim: bleed warns on an excluding component (no per-slide token)', () => {
    assert.ok(has('---\nmarp: true\nclaim: bleed\n---\n\n<!-- _class: table -->\n\n## H\n\n| a | b |\n| - | - |\n| 1 | 2 |\n', 'claim-bleed-unsafe'));
  });
  test('a per-slide claim-framed opts a slide out of a deck-wide bleed → no warning', () => {
    assert.equal(has('---\nmarp: true\nclaim: bleed\n---\n\n<!-- _class: table claim-framed -->\n\n## H\n\n| a | b |\n| - | - |\n| 1 | 2 |\n', 'claim-bleed-unsafe'), false);
  });
  test('an unknown claim: value warns (typo → silent framed baseline)', () => {
    assert.ok(has('---\nmarp: true\nclaim: heo\n---\n\n<!-- _class: big-number -->\n\n- 42\n  - x\n', 'unknown-claim'));
  });
  test('a known claim: value is silent', () => {
    assert.equal(has('---\nmarp: true\nclaim: hero\n---\n\n<!-- _class: big-number -->\n\n- 42\n  - x\n', 'unknown-claim'), false);
  });
});

describe('lint-core: lexicon-single-letter-key (read-aloud footgun, PR #952 follow-up)', () => {
  const has = (src) => core.lintTextWith(src, vocab).some((f) => f.rule === 'lexicon-single-letter-key');
  const findingFor = (src) => core.findSingleLetterLexiconKeys(src);

  test('a single-letter key warns (it rewrites every embedded letter)', () => {
    const f = findingFor('---\nlexicon:\n  e: EEK\n---\n\n# Deck\n');
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'warning');
    assert.equal(f[0].classToken, 'e');
    assert.equal(f[0].slide, 0);
  });

  test('a single DIGIT key warns too (it matches inside "2025")', () => {
    assert.ok(has('---\nlexicon:\n  "2": two\n---\n\n# Deck\n'));
  });

  test('a quoted single-letter key warns identically', () => {
    assert.ok(has('---\nlexicon:\n  "s": ess\n---\n\n# Deck\n'));
  });

  test('a single NON-ASCII letter key warns too (per-code-point substitution is language-blind)', () => {
    // `é` rewrites every embedded "é" ("café" → "caf ay"), exactly the ASCII footgun in another script.
    assert.ok(has('---\nlexicon:\n  é: ay\n---\n\n# Deck\n'));
  });

  test('a single GLYPH or emoji key is silent — that is the intended use', () => {
    assert.equal(has('---\nlexicon:\n  "→": to\n  ×: times\n  "🎯": ""\n---\n\n# Deck\n'), false);
  });

  test('catches the key on a `--- ` trailing-space fence (parity with the parser)', () => {
    // frontMatterBody tolerates a trailing space after the opening fence; the warning must too,
    // else a deck the engine actually narrates dodges it.
    assert.ok(has('--- \nlexicon:\n  e: EEK\n--- \n\n# Deck\n'));
  });

  test('a whole-word key is silent', () => {
    assert.equal(has('---\nlexicon:\n  Kubernetes: koober-net-eez\n---\n\n# Deck\n'), false);
  });

  test('warns per offending key while leaving safe siblings alone', () => {
    const f = findingFor('---\nlexicon:\n  e: EEK\n  Kubernetes: koober-net-eez\n  "→": to\n  x: ex\n---\n\n# Deck\n');
    assert.deepEqual(f.map((x) => x.classToken).sort(), ['e', 'x']);
  });

  test('no lexicon block → no findings', () => {
    assert.equal(findingFor('---\ntheme: indaco\n---\n\n# Deck\n').length, 0);
  });
});

describe('lint-core: big-number-hero-heading', () => {
  // big-number's required `number` slot is `ul > li:first-child`; a `#`/`##`
  // heading leaves it empty and the giant number renders blank.
  const bnVocab = { names: new Set(['big-number']), modifiers: new Set() };
  const hero = (src) => core.lintTextWith(FM + src, bnVocab).find((f) => f.rule === 'big-number-hero-heading');

  test('detector: heading + no top-level list item is the mistake; a list item is clean', () => {
    assert.equal(core.findBigNumberHeroInHeading('## 92%'), true);
    assert.equal(core.findBigNumberHeroInHeading('- 92%\n  - caption'), false);
    assert.equal(core.findBigNumberHeroInHeading('`eyebrow only`'), false); // no heading → not the mistake
    assert.equal(core.findBigNumberHeroInHeading(''), false);
    // A heading AND a list item present → the hero renders; not the mistake.
    assert.equal(core.findBigNumberHeroInHeading('## Aside\n\n- 92%\n  - caption'), false);
    // A `#` INSIDE a code fence (no real heading, no list) is not the mistake.
    assert.equal(core.findBigNumberHeroInHeading('```\n# not a heading\n```'), false);
  });

  test('warns when the hero is authored as a heading', () => {
    const f = hero('<!-- _class: big-number -->\n\n## eudaimonia\n');
    assert.ok(f, 'a heading hero should warn');
    assert.equal(f.severity, 'warning');
    assert.equal(f.classToken, 'big-number');
  });

  test('clean when the hero is the first list item', () => {
    assert.equal(hero('<!-- _class: big-number -->\n\n- 92%\n  - of the audience\n'), undefined);
  });

  test('clean for an empty stub (no heading) — a different, non-hero problem', () => {
    assert.equal(hero('<!-- _class: big-number -->\n\n`just an eyebrow`\n'), undefined);
  });

  test('does not fire on non big-number slides', () => {
    assert.equal(hero('<!-- _class: content -->\n\n## A normal heading\n'), undefined);
  });
});

describe('lint-core: bookend-finish-contrast', () => {
  // A deck-wide `finish:` paints a backdrop over title/closing bookends. That used
  // to WASH OUT their inverse display text, and the rule reported it as a defect;
  // since #1656 the finish composites against `--fin-canvas` (the slide's own
  // surface), so the bookend stays legible. The rule survives as an EDITORIAL note
  // at `info` — the house pattern is still a clean bookend
  // (examples/finish-backdrops.md) — and must no longer claim a contrast failure.
  const beVocab = {
    names: new Set(['title', 'closing', 'content']),
    modifiers: new Set(['silent']),
    // Only a registered finish paints a backdrop; the rule gates on this vocab.
    finishNames: ['none', 'atrium', 'meridian', 'strata', 'halo', 'ledger', 'nimbus', 'loom', 'savile', 'gallery'],
  };
  const FMF = (fin) => `---\nmarp: true\ntheme: indaco\n${fin ? `finish: ${fin}\n` : ''}---\n\n`;
  const be = (fin, cls) => core.lintTextWith(`${FMF(fin)}<!-- _class: ${cls} -->\n\n# H\n`, beVocab)
    .find((f) => f.rule === 'bookend-finish-contrast');

  test('notes a title bookend under a deck finish with no opt-out', () => {
    const f = be('atrium', 'title silent');
    assert.ok(f, 'title under a deck finish should be noted');
    assert.equal(f.severity, 'info');
    assert.equal(f.classToken, 'title');
  });

  test('notes a closing bookend too', () => {
    assert.ok(be('ledger', 'closing silent'), 'closing under a deck finish should be noted');
  });

  test('no longer claims the display text washes out — that defect is fixed (#1656)', () => {
    const f = be('atrium', 'title silent');
    assert.ok(f, 'expected the editorial note');
    assert.doesNotMatch(f.message, /wash(es)? out|contrast/i, 'the message must not describe a contrast failure the engine no longer has');
    assert.doesNotMatch(f.fix, /keep its own surface/i, 'the fix is a preference now, not a repair');
  });

  test('clean when the bookend opts out with finish-none', () => {
    assert.equal(be('atrium', 'title silent finish-none'), undefined);
  });

  test('clean when the bookend makes an explicit finish choice', () => {
    assert.equal(be('atrium', 'title silent finish-halo'), undefined);
  });

  test('clean when the deck has no finish', () => {
    assert.equal(be(null, 'title silent'), undefined);
    assert.equal(be('none', 'title silent'), undefined);
  });

  test('does not fire on non-bookend slides under a finish', () => {
    assert.equal(be('atrium', 'content'), undefined);
  });

  test('does NOT fire on an unknown/typo finish (no backdrop renders — unknown-finish owns that)', () => {
    // `atriumm` is not a registered finish, so the engine paints no backdrop;
    // this rule must not contradict the `unknown-finish` warning.
    assert.equal(be('atriumm', 'title silent'), undefined);
    // The per-slide opt-out spelling written at deck level is also not a backdrop.
    assert.equal(be('finish-none', 'title silent'), undefined);
  });

  test('a body-level `finish:` (inside a code fence) is not read as the deck finish', () => {
    const src = '---\nmarp: true\ntheme: indaco\n---\n\n<!-- _class: title silent -->\n\n# H\n\n```yaml\nfinish: atrium\n```\n';
    assert.equal(core.lintTextWith(src, beVocab).find((f) => f.rule === 'bookend-finish-contrast'), undefined);
  });
});

// `paginate: skip` / `hold` are Marp values Lattice does NOT implement — `truthy()` rejects
// all three of false/skip/hold identically, so each merely hides the badge while the slide
// keeps its place in the numbering. For `false` that is the intent; for the other two the
// author asked for a renumbering they will not get, and the deck still renders, so nothing
// told them. Same "silence reads as it works" reasoning as the retired-autosplit rule.
describe('paginate: skip / hold are flagged rather than silently downgraded', () => {
  const find = (src) => ruleFor(src, 'paginate-unsupported-value');

  test('a spot `_paginate: skip` is flagged, on the right slide', () => {
    const f = find('---\npaginate: true\n---\n\n# A\n\n---\n\n<!-- _paginate: skip -->\n\n## B.\n');
    assert.ok(f, 'expected paginate-unsupported-value');
    assert.equal(f.severity, 'suggestion'); // the render is legitimate; only the renumbering is absent
    assert.equal(f.slide, 2);
    assert.match(f.message, /STILL counted/);
    assert.match(f.fix, /_paginate: false/);
  });

  test('`hold` gets its own message — it is a different unmet promise from `skip`', () => {
    const f = find('---\npaginate: hold\n---\n\n# A\n');
    assert.ok(f);
    assert.equal(f.slide, 1); // front matter is deck-level, so it reports against slide 1
    assert.match(f.message, /repeat the previous number/);
  });

  test('`false` is NOT flagged — hiding the badge is exactly what it means', () => {
    assert.equal(find('---\npaginate: false\n---\n\n# A\n'), undefined);
    assert.equal(find('---\npaginate: true\n---\n\n# A\n\n---\n\n<!-- _paginate: false -->\n\n## B.\n'), undefined);
  });

  test('a value inside a FENCED code block is documentation, not a directive', () => {
    // This rule's own docs entry is a fenced sample, so a whole-source scan would flag it.
    assert.equal(find('---\npaginate: true\n---\n\n# A\n\n```\n<!-- _paginate: skip -->\n```\n'), undefined);
  });

  test('the slide number counts slides, not front-matter fences', () => {
    // Counting bare `---` reported two too high, because front matter's own fences split too.
    const f = find('---\npaginate: true\n---\n\n# A\n\n---\n\n## B.\n\n---\n\n<!-- _paginate: skip -->\n\n## C.\n');
    assert.equal(f.slide, 3);
  });

  test('one finding per distinct directive+value, not one per slide', () => {
    const all = core.lintTextWith(
      '---\npaginate: true\n---\n\n<!-- _paginate: skip -->\n\n# A\n\n---\n\n<!-- _paginate: skip -->\n\n## B.\n',
      vocab,
    ).filter((x) => x.rule === 'paginate-unsupported-value');
    assert.equal(all.length, 1);
  });
});

/**
 * Two shapes of `overflow-marker` that a deck should not carry.
 *
 * The level is an EXPORT setting, not a deck key — one deck source is previewed,
 * exported and printed, and those want three different answers
 * (engineering/decisions/2026-07-30-overflow-marker-register.md). The rules exist
 * because the alternative is silence, and silence on an inert setting is what the
 * move was meant to end.
 */
describe('lint-core: stray overflow-marker (an export setting, not a deck key)', () => {
  const fm = (body) => `---\nmarp: true\n${body}---\n\n# A\n`;
  const rules = (src) => core.lintTextWith(src, vocab).map((f) => f.rule);

  test('a front-matter key is flagged — nothing reads it', () => {
    const f = core.lintTextWith(fm('overflow-marker: off\n'), vocab).find((x) => x.rule === 'stray-overflow-marker');
    assert.ok(f, 'the dead key is named');
    assert.equal(f.severity, 'warning', 'a deletion, not a broken render');
    assert.match(f.fix, /--overflow-marker=/, 'and it says where the setting actually lives');
  });

  // A same-named key nested under a mapping is different config, not this register.
  test('a NESTED key of the same name is not flagged', () => {
    assert.ok(!rules(fm('meta:\n  overflow-marker: off\n')).includes('stray-overflow-marker'));
  });

  test('a deck that says nothing is clean', () => {
    assert.deepEqual(rules(fm('')).filter((r) => r.startsWith('stray-')), []);
  });

  // The shape that used to change behavior, and still does downstream: Lattice
  // strips the block when rendering, but it survives into a Marp bundle built from
  // this source, where marp-cli's browser reads it.
  test('a PLANTED export-settings block is flagged', () => {
    const src = `${fm('')}\n<script type="application/lattice-export-settings">{"overflowMarker":"off"}</script>\n`;
    const f = core.lintTextWith(src, vocab).find((x) => x.rule === 'stray-export-settings');
    assert.ok(f, 'the planted block is named');
    assert.match(f.message, /not a setting for this deck/);
    assert.match(f.fix, /Marp bundle/, 'and says why it still matters after the strip');
  });

  test('both shapes at once produce both findings', () => {
    const src = `${fm('overflow-marker: off\n')}\n<script type="application/lattice-export-settings">{"overflowMarker":"off"}</script>\n`;
    const found = rules(src).filter((r) => r.startsWith('stray-'));
    assert.deepEqual(found.sort(), ['stray-export-settings', 'stray-overflow-marker']);
  });
});

// An unterminated `<!--` is a PRIVACY trap on export, not only a rendering one: the note
// extractor's comment matcher requires a terminator, so `--strip-notes` finds no body to
// remove and the text ships verbatim in the shared file's embedded source. The author asked
// for the opposite. It is a lint finding rather than a scrub because making the strip match
// to EOF would delete the rest of the deck from the author's own source.
describe('lint-core: unterminated comment', () => {
	const vocab = {};
	const rules = (src) => core.lintTextWith(src, vocab).map((f) => f.rule);

	test('an unclosed comment is flagged as an error', () => {
		const src = '---\nmarp: true\n---\n\n# Q3\n\n<!-- Board only: 4.2M\n\n# Next\n';
		const f = core.lintTextWith(src, vocab).find((x) => x.rule === 'unterminated-comment');
		assert.ok(f, 'the unclosed comment is named');
		assert.equal(f.severity, 'error');
		assert.match(f.message, /strip-notes/, 'and says why it matters on export, not just on screen');
		// A plain containment check, not a regex: this asserts the fix TEXT names the
		// terminator, and a `/-->/` literal here reads to a scanner (correctly) as an
		// HTML-comment matcher that forgets `--!>` — the very bug fixed elsewhere on this
		// branch. Nothing here parses HTML, so nothing here should look like it does.
		assert.ok(f.fix.includes('-->'), 'the fix names the terminator to add');
	});

	test('a well-formed comment is not flagged', () => {
		const src = '---\nmarp: true\n---\n\n# Q3\n\n<!-- Board only: 4.2M -->\n\n# Next\n';
		assert.ok(!rules(src).includes('unterminated-comment'));
	});

	test('the `--!>` terminator counts as closed, as it does in the parser', () => {
		const src = '---\nmarp: true\n---\n\n# Q3\n\n<!-- Board only: 4.2M --!>\n';
		assert.ok(!rules(src).includes('unterminated-comment'));
	});

	test('a hanging-indent comment is NOT flagged — its terminator line is indented', () => {
		// The rule originally ran against `withoutCodeBlocks`, which deletes every line
		// indented four spaces or more as an indented code block — taking the terminator of
		// an ordinary hanging-indent note with it. A well-formed comment then reported as
		// unterminated, at ERROR severity, claiming the author's notes would ship when they
		// asked to strip them. A false alarm about a privacy failure teaches authors to
		// distrust the strip, which is worse than the miss it was guarding against.
		const src = [
			'---', 'marp: true', '---', '', '# Q3', '',
			'<!-- Talk track:',
			'     open with the number, then the ask.',
			'     Keep it under two minutes. -->',
			'',
		].join('\n');
		assert.ok(!rules(src).includes('unterminated-comment'));
	});

	test('a fence whose markers OVERLAP cannot reconstitute one — the reason blanking replaced deleting', () => {
		// Deleting a multi-character marker in one pass can rebuild it from the text either
		// side: `<!<!----` loses the inner `<!--` and the halves close up into a fresh one, so
		// the detector sees a marker the masking believed it had removed and reports a
		// well-formed deck as leaking its notes. Blanking to spaces cannot do that. Reverting
		// `blank` to a deletion previously left all 117 tests in this file green.
		const src = ['---', 'marp: true', '---', '', '# Q3', '', '```html', '<!<!---- overlapping sample', '```', ''].join('\n');
		assert.ok(!rules(src).includes('unterminated-comment'));
	});

	test('a `<!--` inside a code fence is sample text, not a comment', () => {
		const src = ['---', 'marp: true', '---', '', '# Q3', '', '```html', '<!-- sample, deliberately unclosed', '```', ''].join('\n');
		assert.ok(!rules(src).includes('unterminated-comment'));
	});
});

// #1651 — a universal editorial modifier that has no host on this layout.
// `insight-*` and `no-note` are accepted everywhere (they are universals, and the
// manifest lists them among every component's effectiveVariants), but they only do
// something where the block they govern renders. On a `quote` neither does.
describe('lint-core: block-unsupported', () => {
  const bVocab = {
    names: new Set(['quote', 'content', 'cards-grid', 'math', 'timeline-list']),
    modifiers: new Set(['insight-key', 'insight-verdict', 'no-note', 'bare']),
  };
  const bu = (cls, body = '# H\n') =>
    core.lintTextWith(`---\nmarp: true\n---\n\n<!-- _class: ${cls} -->\n\n${body}`, bVocab).filter((f) => f.rule === 'block-unsupported');

  test('flags insight-* on a quote — the case that opened the issue', () => {
    const f = bu('quote insight-key');
    assert.equal(f.length, 1);
    assert.equal(f[0].classToken, 'insight-key');
    assert.match(f[0].message, /does nothing on a quote slide/);
  });

  test('flags no-note on a quote too', () => {
    const f = bu('quote no-note');
    assert.equal(f.length, 1);
    assert.equal(f[0].classToken, 'no-note');
  });

  test('flags BOTH when both are inert on the same slide', () => {
    assert.equal(bu('quote insight-key no-note').length, 2);
  });

  test('stays silent where the block really renders', () => {
    assert.deepEqual(bu('content insight-key'), []);
    assert.deepEqual(bu('cards-grid no-note'), []);
    assert.deepEqual(bu('content insight-verdict no-note'), []);
  });

  test('handles a layout that takes one block and not the other', () => {
    // timeline-list renders the key-insight callout but not a below-note.
    assert.deepEqual(bu('timeline-list insight-key'), []);
    assert.equal(bu('timeline-list no-note').length, 1);
  });

  test('says nothing about a correctly-authored quote carrying no modifier', () => {
    assert.deepEqual(bu('quote', '> A quotation.\n\n— Someone\n'), []);
    assert.deepEqual(bu('quote bare', '> A quotation.\n\n— Someone\n'), []);
  });

  test('ignores a slide whose class names no known component', () => {
    assert.deepEqual(bu('insight-key'), []);
  });
});

describe('lint-core: author-script-defers (#1792)', () => {
  // The export captures at the load event and does not wait on author timers, so a slide
  // painted from a `setTimeout` ships empty. The render says so at capture; this rule says
  // it while the deck is still being written, and covers the one shape the render probe
  // structurally cannot see — a `<script type="module">`, where `document.currentScript` is
  // null and there is nobody to attribute the timer to.
  const deckWith = (script) => `${FM}# Deck\n\n---\n\n## Slide\n\n<div id="a">x</div>\n\n${script}\n`;

  test('flags an inline script that defers, and names the call and the slide', () => {
    const f = ruleFor(deckWith('<script>\nsetTimeout(function(){}, 400);\n</script>'), 'author-script-defers');
    assert.ok(f, 'a deferring inline script must be flagged');
    assert.equal(f.slide, 2, 'slide numbering follows the file convention, not a raw chunk index');
    assert.match(f.line, /setTimeout/);
    assert.match(f.message, /MISSING from the PDF/);
    assert.equal(f.severity, 'warning');
  });

  test('a synchronous script is NOT flagged — it lands in the export', () => {
    const src = deckWith('<script>\ndocument.getElementById("a").textContent = "now";\n</script>');
    assert.equal(ruleFor(src, 'author-script-defers'), undefined);
  });

  test('a `<script src>` is NOT flagged — all three shipped decks carry one', () => {
    // examples/gallery-jargon.md, diagram.gallery.md and the baseline gallery each embed
    // mermaid + lattice-runtime for the LIVE preview. Flagging src would fire on every one
    // of them, which is how a rule gets ignored.
    const src = deckWith('<script src="../mermaid-v11.min.js"></script>');
    assert.equal(ruleFor(src, 'author-script-defers'), undefined);
  });

  test('a module script that awaits IS flagged — the render probe cannot see this one', () => {
    const src = deckWith('<script type="module">\nawait fetch("./d.json");\n</script>');
    assert.ok(ruleFor(src, 'author-script-defers'), 'the static net exists for exactly this case');
  });

  test('a fenced code sample showing a timer is NOT flagged', () => {
    const src = `${FM}# Deck\n\n---\n\n## Slide\n\n\`\`\`html\n<script>\nsetTimeout(fn, 400);\n</script>\n\`\`\`\n`;
    assert.equal(ruleFor(src, 'author-script-defers'), undefined, 'this rule must not trip on its own documentation');
  });

  test('the inert export-settings block is left to its own rule', () => {
    const src = deckWith('<script type="application/lattice+json">{"then":"(not code)"}</script>');
    assert.equal(ruleFor(src, 'author-script-defers'), undefined, 'a JSON data block never executes');
  });

  // The rule used to match the whole element with one `<script …>…</script>` span, so the
  // end tag had a single spelling and every other spelling the HTML parser accepts walked
  // straight past it — a deck that ships empty and a rule that says nothing. These are the
  // spellings, and each one FAILED to flag before the span was replaced by a search.
  for (const [label, close] of [
    ['a space before the bracket', '</script >'],
    ['a newline before the bracket', '</script\n>'],
    ['a solidus, which the parser ignores', '</script/>'],
    ['a tab and an attribute the parser drops', '</script\tfoo>'],
  ]) {
    test(`an end tag with ${label} still closes the script, and the timer is still flagged`, () => {
      const f = ruleFor(deckWith(`<script>\nsetTimeout(fn, 400);\n${close}`), 'author-script-defers');
      assert.ok(f, `\`${close}\` ends a script element; the rule must read the body before it`);
      assert.match(f.line, /setTimeout/);
    });
  }

  test('`</scriptish>` is not an end tag, so the body runs on and is still read', () => {
    const f = ruleFor(deckWith('<script>\nsetTimeout(fn, 400);\n</scriptish>\n</script>'), 'author-script-defers');
    assert.ok(f, 'the terminator is `</script` followed by HTML whitespace, `/` or `>` — nothing else');
  });

  // HTML whitespace is TAB/LF/FF/SPACE (and CR, folded to LF before the tokenizer sees it).
  // JavaScript's `\s` is a much larger set, so a character class of `[\s/>]` ends the body
  // on runs a browser keeps inside it — truncating before the real code and saying nothing.
  // An NBSP is the one that matters: it is what survives a paste out of a document.
  for (const [label, ch] of [
    ['a non-breaking space', '\u00a0'],
    ['a vertical tab', '\u000b'],
    ['an en space', '\u2002'],
    ['a zero-width no-break space', '\ufeff'],
    ['a line separator', '\u2028'],
  ]) {
    test(`\`</script\` followed by ${label} is NOT an end tag, so the timer after it is still read`, () => {
      const src = deckWith(`<script>\nvar t = "</script${ch}>";\nsetTimeout(fn, 400);\n</script>`);
      const f = ruleFor(src, 'author-script-defers');
      assert.ok(f, 'the body runs past that run to the real end tag');
      assert.match(f.line, /setTimeout/);
    });
  }

  // An end tag may carry attributes, which the parser drops — and an attribute value may
  // contain an opening tag. Resuming the scan at the `<` of `</script` re-read that value
  // as a second element and flagged the prose after it.
  test('an opening tag inside the END tag\'s attributes does not open a phantom element', () => {
    const src = deckWith('<script>\nvar a=1;\n</script x="<script>">\nsetTimeout(fn, 400);');
    assert.equal(ruleFor(src, 'author-script-defers'), undefined,
      'setTimeout here is prose outside every script element');
  });

  // The rule reads MARKDOWN, and DEFERRAL_API_RE matches bare English words. Reading an
  // unclosed script to the end of the chunk — faithful to the parser — made ordinary deck
  // copy after a missing `</script>` report a `Worker` call the deck never made.
  test('an unclosed script does not turn the prose after it into a deferral finding', () => {
    const src = `${FM}# Deck\n\n---\n\n## Q3 headcount\n\n<script>\nconsole.log(1);\n\n- Worker productivity rose 12%\n- We await board sign-off\n`;
    assert.equal(ruleFor(src, 'author-script-defers'), undefined,
      'a rule that fires on legitimate prose is a rule authors learn to ignore');
  });

  // The span form advanced past the whole element for free. The search form has to set
  // lastIndex itself, and getting that wrong re-enters the body it just read, so one
  // element reports twice. (The quoted `<script>` is NOT a second element: in RAWTEXT only
  // `</script` ends the first one, which is why the deck below is one script, one finding.)
  test('an opening tag quoted inside a script body reports once, not twice', () => {
    const src = deckWith('<script>\ndocument.title = "<script>";\nsetTimeout(fn, 400);\n</script>');
    const found = core.lintTextWith(src, vocab).filter((f) => f.rule === 'author-script-defers');
    assert.equal(found.length, 1, 'the scan resumes after the element, not inside it');
  });
});

describe('lint-core: crowded circle / diamond pills (pill-shape-crowded)', () => {
  const crowded = (src) => core.lintTextWith(src, vocab).filter((f) => f.rule === 'pill-shape-crowded');
  const deck = (body) => `${FM}## Heading\n\n${body}\n`;

  test('the budget is one character, or a number up to two digits', () => {
    for (const ok of ['3', '!', '?', '%', 'W', '12', '99']) {
      assert.equal(core.pillFitsShape(ok), true, `${ok} fits`);
      assert.equal(crowded(deck(`\`{${ok}}:circle\` \`{${ok}}:diamond\``)).length, 0, `${ok} is not flagged`);
    }
    for (const bad of ['OK', 'AB', '1/2', 'WM', '100', 'NEW']) {
      assert.equal(core.pillFitsShape(bad), false, `${bad} does not fit`);
      assert.equal(crowded(deck(`\`{${bad}}:circle\` \`{${bad}}:diamond\``)).length, 2, `${bad} is flagged on both shapes`);
    }
  });

  test('it WARNS, names the span for the editor underline, and points at :tag', () => {
    const [f] = crowded(deck('Status is `{WM}:circle:c5` today.'));
    assert.equal(f.severity, 'warning');
    assert.equal(f.span, '`{WM}:circle:c5`');
    assert.match(f.message, /too long for a circle/);
    assert.match(f.fix, /:tag/);
  });

  test('modifier order does not hide it, and other shapes are not its business', () => {
    assert.equal(crowded(deck('`{WM}:lg:c3:diamond`')).length, 1);
    assert.equal(crowded(deck('`{WM}:tag` `{WM}` `{WM}:chevron-right`')).length, 0);
  });

  test('code, escapes and the literal register draw no pill, so they get no finding', () => {
    assert.equal(crowded(deck('```\n`{WM}:circle`\n```')).length, 0, 'fenced code is quoted material');
    assert.equal(crowded(deck('`\\{WM}:circle` and ``{WM}:circle``')).length, 0, 'escaped and double-backtick spans are literal');
    assert.equal(crowded('---\nmarp: true\ninline-code: literal\n---\n\n## H\n\n`{WM}:circle`\n').length, 0, 'inline-code: literal draws no pills');
  });
});

describe('lint-core: typed shape glyphs (rule 15, HARD RULE #29)', () => {
  const glyphs = (src) => core.lintTextWith(src, vocab).filter((f) => f.rule === 'typed-shape-glyph');
  const slide = (cls, body) => `${FM}<!-- _class: ${cls} -->\n\n## Heading\n\n${body}\n`;

  test('it WARNS and never errors — coaching is the policy, not a soft touch', () => {
    const found = glyphs(slide('cards-grid', '- Ship it ✓'));
    assert.equal(found.length, 1);
    assert.equal(found[0].severity, 'warning');
  });

  test('one finding per LINE, not per glyph', () => {
    // Four checks in one comparison row is ONE decision. Four warnings on one
    // row is the noise that teaches people to pass --quiet.
    const found = glyphs(slide('cards-grid', '| Speed | ✓ | ✗ | ✓ | ✓ |'));
    assert.equal(found.length, 1);
    assert.match(found[0].message, /✓ ✗/);
  });

  test('a table cell is pointed at `[x]` AND at `state-cells`', () => {
    const [found] = glyphs(slide('cards-grid', '| Speed | ✓ |'));
    assert.match(found.fix, /\[x\]/);
    assert.match(found.fix, /state-cells/);
  });

  test('a slide that already decodes cells is not told to add the modifier', () => {
    const [found] = glyphs(slide('cards-grid state-cells', '| Speed | ✓ |'));
    assert.match(found.fix, /already decodes/);
  });

  test('a retired quadrant arrow eyebrow IS flagged — the carve-out is gone', () => {
    // The arrow was quadrant's axis delimiter and was exempt. The axis is now a
    // bracketed list (`[{Effort, 0..10}, {Reach, 0..100}]`), which has no glyph
    // in it, so the arrow is a typed glyph like any other — and the retired
    // eyebrow gets its own `quadrant-retired-axis` error with the rewrite.
    const [found] = glyphs(`${FM}<!-- _class: quadrant -->\n\n\`Effort 0–10 → Reach 0–100\`\n\n## Heading\n`);
    assert.ok(found);
  });

  test('the bracketed quadrant axis carries no glyph to flag', () => {
    assert.deepEqual(glyphs(`${FM}<!-- _class: quadrant -->\n\n\`[{Effort, 0..10}, {Reach, 0..100}]\`\n\n## Heading\n`), []);
  });

  test('prose falls back to the table\'s own per-glyph coaching', () => {
    const [found] = glyphs(slide('cards-grid', '- The plan → the outcome'));
    assert.match(found.fix, /write the word/i);
  });

  test('the arrow coaching does NOT promise ASCII `->`', () => {
    // It was drafted that way and it was false: markdown-it escapes `->` to
    // `-&gt;` inside a code span, so no transform ever saw the ASCII arrow.
    const [found] = glyphs(slide('cards-grid', '- The plan → the outcome'));
    assert.doesNotMatch(found.fix, /accepts ASCII/);
  });

  test('a fenced block is quoted material and is left alone', () => {
    // examples/content-capacity.md quotes the CLI's own overflow warning
    // verbatim, and the CLI really does print `⚠`. "Fixing" it would make the
    // deck lie about what the tool prints.
    const src = `${FM}<!-- _class: cards-grid -->\n\n## Heading\n\n\`\`\`text\n⚠ deck.md · slide 4 · capacity-overflow\n\`\`\`\n`;
    assert.deepEqual(glyphs(src), []);
  });

  test('an INLINE code span is still in scope — it is set on the slide', () => {
    assert.equal(glyphs(slide('cards-grid', '- The `A → B` handoff')).length, 1);
  });

  test('punctuation the house actually uses is never flagged', () => {
    const src = slide('cards-grid', '- Q1–Q2 · 2×2 · “quoted” · ±0.4 · 90° — and an ellipsis…');
    assert.deepEqual(glyphs(src), []);
  });

  test('the finding carries the slide number and the offending line', () => {
    const [found] = glyphs(slide('cards-grid', '- Ship it ✓'));
    assert.equal(found.slide, 1);
    assert.equal(found.line, '- Ship it ✓');
  });
});

describe('lint-core: shell-fence-is-script (rule 12b)', () => {
  // The tag that makes highlighting look broken while every renderer behaves.
  // `shell` / `console` / `shellsession` are highlight.js's terminal-SESSION
  // grammar; the same eleven-line script measured 15 highlight spans as ```sh
  // and 2 as ```shell on every render path.
  const F = '```';
  const slide = (tag, ...body) => `${FM}<!-- _class: code -->\n\n## A block.\n\n${F}${tag}\n${body.join('\n')}\n${F}\n`;

  test('flags a script tagged with a session grammar', () => {
    const f = ruleFor(slide('shell', '#!/bin/sh', 'set -eu'), 'shell-fence-is-script');
    assert.ok(f, 'expected a finding');
    assert.equal(f.severity, 'info');
    assert.equal(f.classToken, 'shell');
    assert.match(f.fix, /```bash/);
  });

  test('info, not a warning — the tag is legal and the render is correct', () => {
    const findings = core.lintTextWith(slide('shell', 'set -eu'), vocab);
    assert.equal(findings.filter((x) => x.rule === 'shell-fence-is-script' && x.severity !== 'info').length, 0);
  });

  test('silent on a genuine transcript', () => {
    assert.equal(ruleFor(slide('console', '$ ./deploy.sh', 'ok'), 'shell-fence-is-script'), undefined);
  });

  test('silent on a script already tagged bash / sh / zsh', () => {
    for (const tag of ['bash', 'sh', 'zsh']) {
      assert.equal(ruleFor(slide(tag, '#!/bin/sh', 'set -eu'), 'shell-fence-is-script'), undefined, tag);
    }
  });

  test('fires regardless of the slide component — it is a fence rule, not a layout rule', () => {
    const src = `${FM}## No class directive here.\n\n${F}shell\nset -eu\n${F}\n`;
    assert.ok(ruleFor(src, 'shell-fence-is-script'), 'a slide with no _class directive is still linted');
  });
});

describe("lint-core: the topic anchor's `_track` override", () => {
  // The `topic` anchor derives its sibling track from every topic slide's own
  // `<h2>`; `_track` overrides that. Both failures below are SILENT on the
  // rendered slide — a band that never draws, or one with no column lit — which
  // is why they are caught in the linter rather than left to a reviewer's eye.
  const tv = { names: new Set(['topic', 'content']), modifiers: new Set(['dark', 'fact']) };
  const rule = (src, name) => core.lintTextWith(src, tv).find((f) => f.rule === name);
  const topic = (...lines) => `${FM}<!-- _class: topic -->\n${lines.join('\n')}\n\n## Payback\n\nA claim.\n`;

  test('silent on a well-formed override', () => {
    const src = topic('<!-- _track: Cost to win | Lifetime value | [Payback] -->');
    assert.equal(rule(src, 'track-directive'), undefined);
    assert.equal(rule(src, 'track-list'), undefined);
  });

  test('silent on a slide that derives — no directive is the normal case', () => {
    assert.equal(rule(topic(), 'track-directive'), undefined);
  });

  test('flags an override that marks no current topic', () => {
    const f = rule(topic('<!-- _track: Cost to win | Lifetime value -->'), 'track-directive');
    assert.ok(f, 'expected a finding');
    assert.equal(f.severity, 'warning');
    assert.match(f.message, /no current topic/);
    assert.match(f.fix, /square brackets/);
  });

  test('flags a scale of one — it draws no track at all', () => {
    const f = rule(topic('<!-- _track: [Payback] -->'), 'track-directive');
    assert.ok(f, 'expected a finding');
    assert.match(f.message, /one label/);
  });

  test('flags `_track` on `topic fact` — it draws nothing AND costs the siblings', () => {
    // `fact` is one flat canvas and its CSS drops the track, so the directive
    // renders nothing — while still opting the slide out of derivation, which
    // removes this topic's name from every sibling's scale. Silent both ways.
    const src = `${FM}<!-- _class: topic fact -->\n<!-- _track: A | [B] -->\n\n## Alpha\n\nA claim.\n`;
    const f = rule(src, 'track-directive');
    assert.ok(f, 'expected a finding');
    assert.match(f.message, /draws nothing on `topic fact`/);
    assert.match(f.fix, /Drop the directive/);
  });

  test('flags `_track` on a slide that is not a topic anchor', () => {
    const src = `${FM}<!-- _class: content -->\n<!-- _track: A | [B] -->\n\n## A heading.\n\nText.\n`;
    const f = rule(src, 'track-directive');
    assert.ok(f, 'expected a finding');
    assert.match(f.message, /not `topic`/);
  });

  test('flags the RETIRED authored-list override, and names the directive', () => {
    // A deck written against the old contract still renders — the list as
    // content, plus a derived track below it. Warn and coach; never refuse.
    const f = rule(topic('', '- Cost to win', '- Lifetime value', '- **Payback**'), 'track-list');
    assert.ok(f, 'expected a finding');
    assert.equal(f.severity, 'warning');
    assert.equal(f.line, '- Cost to win');
    assert.match(f.fix, /_track:/);
  });

  test('a fenced list is not a list — the rule reads past code blocks', () => {
    const src = `${FM}<!-- _class: topic -->\n\n## Payback\n\n\`\`\`text\n- Cost to win\n\`\`\`\n`;
    assert.equal(rule(src, 'track-list'), undefined);
  });

  /* ── what the two rules must READ ──────────────────────────────────────────
   * Each of these shipped a finding that was FALSE about what the renderer did,
   * which trains an author to ignore the rule. They are pinned by the behavior a
   * reader would see, not by the matcher that produces it.
   */
  test('the LIVE directive is the last one — the engine resolves last-wins', () => {
    // Measured: `render()` stamps data-track="B | [C]" here. Reading the first
    // warned "a scale of one … NO track is drawn" about a slide that drew one.
    const src = topic('<!-- _track: A -->', '<!-- _track: B | [C] -->');
    assert.equal(rule(src, 'track-directive'), undefined);
  });

  test('a directive inside a FENCE is an example, not a directive', () => {
    const src = `${FM}<!-- _class: topic -->\n\n## B\n\n\`\`\`\n<!-- _track: A -->\n\`\`\`\n`;
    assert.equal(rule(src, 'track-directive'), undefined);
  });

  test('a label carrying `>` is still read — both silent failures stay catchable', () => {
    // `[^>]*?` could not cross a `>`, so the rule simply did not match, and the
    // two arms it exists to catch went unreported on exactly the labels most
    // likely to be malformed.
    assert.match(rule(topic('<!-- _track: a > b -->'), 'track-directive').message, /one label/);
    assert.match(rule(topic('<!-- _track: a > b | c -->'), 'track-directive').message,
      /no current topic/);
    assert.equal(rule(topic('<!-- _track: a > b | [C] -->'), 'track-directive'), undefined);
  });

  /* ── THE SUBSET TABLE ────────────────────────────────────────────────────────
   * THE CONTRACT IS ONE-SIDED, and that is the point. Six review rounds each
   * found a shape where a rule written to AGREE with the renderer did not —
   * in both directions, every time. The rule is now a deliberate SUBSET of the
   * engine (see `liveTrackDirective`), so the assertion is one-sided too:
   *
   *   · NEVER a false positive — every shape the linter warns about is one the
   *     engine really applies, and really applies degenerately. This is the arm
   *     that bites, and it is checked against `render()` itself rather than
   *     against anyone's model of markdown-it.
   *   · Silence is allowed. The shapes where the engine applies and the rule says
   *     nothing are listed by name below, so the cost is a written-down list
   *     rather than a surprise, and adding to it is a visible diff.
   *
   * A new shape is a new row, not a new round.
   */
  test('the linter never warns about a directive the ENGINE did not apply', () => {
    const { render } = require('../../../lib/engine');
    const { parseTrackSpec, MIN_TRACK_LABELS: MIN } = require('../../../lib/core/track-spec');
    const D = '<!-- _class: topic -->\n';
    const H = '\n## T\n\n';
    // Every row measured through the real engine. Four review rounds each found a
    // shape this rule got wrong — in BOTH directions — so the contract is data:
    // the linter must warn exactly when the engine applies a DEGENERATE `_track`.
    const SHAPES = {
      'line start': `${D}<!-- _track: A -->\n\n## T\n`,
      'three-space indent': `${D}${H}   <!-- _track: A -->\n`,
      'four-space indent (code)': `${D}${H}    <!-- _track: A -->\n`,
      // A comment in a blockquote or list item is still its own `html_block`.
      blockquote: `${D}${H}> <!-- _track: A -->\n`,
      'blockquote, four spaces': `${D}${H}>    <!-- _track: A -->\n`,
      'blockquote, five spaces (code)': `${D}${H}>     <!-- _track: A -->\n`,
      'nested blockquote': `${D}${H}> > <!-- _track: A -->\n`,
      'nested blockquote, wide': `${D}${H}> >    <!-- _track: A -->\n`,
      bullet: `${D}${H}- <!-- _track: A -->\n`,
      'bullet, four spaces': `${D}${H}-    <!-- _track: A -->\n`,
      'bullet, five spaces (code)': `${D}${H}-     <!-- _track: A -->\n`,
      'star bullet': `${D}${H}* <!-- _track: A -->\n`,
      'plus bullet': `${D}${H}+ <!-- _track: A -->\n`,
      'ordered item': `${D}${H}1. <!-- _track: A -->\n`,
      'blockquote then bullet': `${D}${H}> - <!-- _track: A -->\n`,
      'bare tab (code)': `${D}${H}\t<!-- _track: A -->\n`,
      'bullet then tab': `${D}${H}-\t<!-- _track: A -->\n`,
      // An `html_block` runs to the END OF ITS LINE, so trailing prose makes the
      // token something `readDirectiveComment` rejects.
      'trailing text': `${D}${H}<!-- _track: A --> tail\n`,
      'trailing text, two labels': `${D}${H}<!-- _track: A | B --> tail\n`,
      'an arrow inside a label': `${D}${H}<!-- _track: a --> b | [C] -->\n`,
      // A type-6 block runs to a blank line; the comment inside is its content.
      'inside a div block': `${D}${H}<div>\n<!-- _track: A -->\n</div>\n`,
      'after a p block': `${D}${H}<p>x</p>\n<!-- _track: A -->\n`,
      // An empty value is skipped by the engine, so the DERIVED track still draws.
      'empty value': `${D}${H}<!-- _track: -->\n`,
      'in a paragraph': `${D}${H}Some text <!-- _track: A -->\n`,
      'inline code': `${D}${H}\`<!-- _track: A -->\`\n`,
      'nested in another comment': `${D}<!-- outer <!-- _track: A --> tail -->\n\n## T\n`,
      'after an unclosed comment': `${D}${H}<!-- oops\n\n<!-- _track: A -->\n`,
      'fenced example': `${D}${H}\`\`\`\n<!-- _track: A -->\n\`\`\`\n`,
      'fence inside a comment': `${D}${H}<!--\n\`\`\`\nnote\n-->\n\n<!-- _track: A -->\n`,
      'uppercase _TRACK': `${D}<!-- _TRACK: A -->\n\n## T\n`,
      'no spaces at all': `${D}<!--_track:A-->\n\n## T\n`,
      'two directives, last wins': `${D}<!-- _track: A -->\n<!-- _track: B | [C] -->\n\n## T\n`,
      // Consecutive comment lines each open their own token — this must NOT be
      // mistaken for "inside an open HTML block".
      'after another directive': `${D}<!-- _footer: "x" -->\n<!-- _track: A -->\n\n## T\n`,
      'CRLF throughout': `${D.replace(/\n/g, '\r\n')}<!-- _track: A -->\r\n\r\n## T\r\n`,
      // A MARKER NEEDS ITS SEPARATOR. `-<!--` is not a list item, so the engine
      // reads nothing; an earlier scanner defaulted the character after the
      // marker to a space and warned about 174 prefixes like these.
      'bullet, no separator': `${D}${H}-<!-- _track: A -->\n`,
      'star, no separator': `${D}${H}*<!-- _track: A -->\n`,
      'plus, no separator': `${D}${H}+<!-- _track: A -->\n`,
      'ordered, no separator': `${D}${H}1.<!-- _track: A -->\n`,
      'indent then bullet, no separator': `${D}${H} -<!-- _track: A -->\n`,
      'blockquote then bullet, no separator': `${D}${H}> -<!-- _track: A -->\n`,
      // A type-1 raw-text block runs to its CLOSING TAG, straight through blank
      // lines — which the blank-line back-scan this replaced could not see.
      'inside <pre>': `${D}${H}<pre>\n\n<!-- _track: A -->\n\n</pre>\n`,
      'inside <script>': `${D}${H}<script>\n<!-- _track: A -->\n</script>\n`,
      'inside <style>': `${D}${H}<style>\n<!-- _track: A -->\n</style>\n`,
      'after a closed <pre>': `${D}${H}<pre>x</pre>\n\n<!-- _track: A -->\n`,
      // A type-2 block ends at its own `-->`, so a MULTI-LINE speaker note — the
      // commonest multi-line comment in a deck — does not swallow what follows.
      'after a multi-line note': `${D}${H}<!--\nnote\n-->\n<!-- _track: A -->\n`,
      // A whitespace-only line is a blank line, so it closes a type-6 block.
      'after a div, spaces-only line between': `${D}${H}<div>x</div>\n   \n<!-- _track: A -->\n`,
      // `<3` is not a tag, so the line is a paragraph — and a comment interrupts
      // a paragraph.
      'after `<3 you`': `${D}${H}<3 you\n<!-- _track: A -->\n`,
      // FOUR COLUMNS, not four characters. A space then a tab is four columns of
      // indent — indented code — but it does not match `withoutCodeBlocks`'s
      // `^(?: {4}|\t)`, so these are the only rows that reach the scanner's own
      // leading bound. Without them, widening that bound to four passes.
      'space then tab (code)': `${D}${H} \t<!-- _track: A -->\n`,
      'two spaces then tab (code)': `${D}${H}  \t<!-- _track: A -->\n`,
      'three spaces then tab (code)': `${D}${H}   \t<!-- _track: A -->\n`,
    };
    // The written-down cost of being a subset. Two families, both deliberate:
    //   · a directive inside a CONTAINER (blockquote, list item) is a live
    //     `html_block` the rule declines, because reading it means re-deriving
    //     CommonMark's container-indent and tab-expansion rules — which is the
    //     exact machinery six rounds of checkers falsified;
    //   · a directive after a block that CLOSED above it — `<pre>x</pre>`, a
    //     `<div>` ended by a blank line — is declined because the rule never
    //     tries to work out whether a block closed, only that one opened.
    const EXPECTED_QUIET = [
      'blockquote', 'blockquote, four spaces', 'nested blockquote',
      'nested blockquote, wide', 'bullet', 'bullet, four spaces', 'star bullet',
      'plus bullet', 'ordered item', 'blockquote then bullet', 'bullet then tab',
      'after a closed <pre>', 'after a div, spaces-only line between',
    ];
    const misses = [];
    const quiet = [];
    for (const [what, body] of Object.entries(SHAPES)) {
      const out = render(FM + body, {});
      const html = typeof out === 'string' ? out : out.html;
      const attr = (html.match(/data-track="([^"]*)"/) || [])[1];
      let shouldWarn = false;
      if (attr !== undefined) {
        // The attribute is HTML-escaped; the rule reads raw source.
        const raw = attr.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
        const { labels, current } = parseTrackSpec(raw);
        shouldWarn = labels.length < MIN || current === -1;
      }
      const fired = Boolean(rule(FM + body, 'track-directive'));
      if (fired && !shouldWarn) {
        misses.push(`${what}: engine ${attr === undefined ? 'inert' : JSON.stringify(attr)},`
          + ` but the linter WARNED`);
      }
      if (!fired && shouldWarn) quiet.push(what);
    }
    // The arm that bites: not one false warning, on any shape in the table.
    assert.deepEqual(misses, []);
    // And the cost, written down. Every name here is a shape the engine applies
    // degenerately and the rule declines to warn about, because proving it would
    // mean modelling a block type — a container marker, raw text, a tag line, a
    // processing instruction. Silence is the safe direction; the list is the
    // price, and it is reviewed as a diff rather than discovered by a fuzz.
    assert.deepEqual(quiet.sort(), [...EXPECTED_QUIET].sort());
  });

  test('KNOWN RESIDUAL: a directive in list continuation is not seen', () => {
    // Recorded rather than fixed. The cause has been RESTATED twice as the rule
    // was rewritten under it, and a checker caught the second statement naming two
    // functions this branch had already deleted — an instruction a future fix
    // could not follow. Today it is silent for one reason only: `COMMENT_LINE`
    // requires the comment to open its own line at most three spaces in, and a
    // list continuation is indented four. That is the subset rule working as
    // designed, not a defect to remove; the test pins the behaviour, and any
    // future widening of that bound will notice it.
    const { render } = require('../../../lib/engine');
    const src = `${FM}<!-- _class: topic -->\n\n## T\n\n- item\n\n    <!-- _track: A -->\n`;
    const out = render(src, {});
    const html = typeof out === 'string' ? out : out.html;
    assert.match(html, /data-track="A"/, 'the engine really does apply it');
    assert.equal(rule(src, 'track-directive'), undefined, 'and the rule really is silent');
  });

  /* A GENERATED fuzz, not a curated list — the curated table is what six rounds of
   * checkers kept walking around. Every line shape a deck can carry is crossed with
   * every other and rendered through the real engine; the rule must not warn about
   * a single one the engine leaves inert. The full cross (44 x 44 x 3 = 5,808) runs
   * in `.scratch`; this is the one-context slice, which is fast enough to stand in
   * the suite and still covers every shape by itself.
   */
  test('FUZZ: not one false warning across every generated line shape', () => {
    const { render } = require('../../../lib/engine');
    const { parseTrackSpec, MIN_TRACK_LABELS: MIN } = require('../../../lib/core/track-spec');
    const LINES = [
      '', '   ', '\t', 'prose', '## H', '> quote', '- item', '1. item',
      '<div>', '</div>', '<div class="x">', '<p>x</p>', '<b>b</b> text', '<3 you', '<',
      '<pre>', '</pre>', '</pre nope', '<pre></pre nope', '<pre-x>', '</pre-x>',
      '<script>', '</script>', 'var s = "</scriptx";', '<style>', '</style>', '<textarea>',
      '<?php', '?>', '<![CDATA[', ']]>', '<!A', '<!DOCTYPE html>',
      '<!--->', '<!-- n -->', '<!--', '-->', '--> trailing', '<!-- a --> b',
      '`code`', '    indented', '```', '~~~', '<!-- _footer: "x" -->',
      // The nine shapes round seven used to refute the previous fence handling.
      // A curated alphabet is still curation; these are here because their
      // absence is what let a fence bug through a 5,808-shape cross.
      '~~~ see `docs`', '~~~ run `npm`', '``` js', '- ```', '* ```', '+ ~~~',
      '1. ```', '\t```', '> ```', '~~~~', '``````',
      // Container-prefixed MARKUP openers. Round eight's regression lived here:
      // `- <figure>` opens an html_block that swallows the indented comment under
      // it, and no alphabet entry could say so.
      '- <div>', '* <figure>', '+ <table>', '1. <pre>', '> <div>', '- <!-- note',
      '  <div>', '- <p>x</p>',
      // Phantom-block openers: a `<!--` that markdown-it never turns into an
      // `html_block`, because it is indented into a list continuation or sits
      // under something that already opened a block.
      '   <!--', '1. x\n   <!--', '- <!--', '\t<!--',
    ];
    const warned = [];
    let degenerate = 0;
    let deg1 = 0;
    let sil1 = 0;
    let silent = 0;
    // THREE AXES, and the two added last are the ones the previous generator
    // could not express — which is exactly where round eight found its two
    // families. A directive is now also tried at a SPACE INDENT (a list
    // continuation), and a line is generated BELOW it (a table delimiter row
    // turns the directive into a table header before `html_block` ever runs).
    for (const a of LINES) {
      for (const pre of ['', '> ', '- ', ' ', '  ', '   ']) {
        // BELOW IS AN AXIS TOO, and round ten found two families in it. A
        // delimiter row with trailing blanks is a real table the scanner
        // rejected; a markup line plus a COMMENT below a directive was voiding
        // the answer it had already read. Two lines, and one of them a comment.
        for (const below of ['', '| --- | --- |', '| --- | --- | ', '| :-- | --: |',
          '> | --- | --- |', 'prose', '<div>x</div>\n<!-- note -->',
          '<!-- note -->', '<!--\n_track: A | [B] -->']) {
        // THE DIRECTIVE COUNT IS AN AXIS, and it is the one round nine was
        // missing. With ONE directive, declining it IS silence, so "poison can
        // only make it quieter" holds vacuously. With TWO, declining the LATER
        // one promotes the earlier — and if the earlier is degenerate and the
        // later is not, silence becomes a false warning. That is why a skipped
        // comment line now voids the whole slide's answer rather than falling
        // back; this loop is what proves it.
        // MULTI-LINE directives are an axis of their own: the engine reads a
        // comment block, this rule reads lines, and a directive split across two
        // lines missed 91 times out of 91 before round ten.
        for (const first of ['', '<!-- _track: A | B -->\n', '<!--\n_track: A | B -->\n',
          '<!-- track: A | B -->\n', '<!-- track: -->\n']) {
        // And the VALUE axis: the directive under test is degenerate half the time,
        // so the single-directive arm still exercises a real warning. Adding the
        // `first` axis without this silently emptied that arm — `deg1` went to 0.
        for (const value of ['A | B', 'A | [B]', '']) {
        const src = `${FM}<!-- _class: topic -->\n\n## T\n\n${first}${a}\n${pre}<!-- _track: ${value} -->\n${below}\n`;
        const out = render(src, {});
        const html = typeof out === 'string' ? out : out.html;
        const attr = (html.match(/data-track="([^"]*)"/) || [])[1];
        let should = false;
        if (attr !== undefined) {
          const raw = attr.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
          const spec = parseTrackSpec(raw);
          should = spec.labels.length < MIN || spec.current === -1;
        }
        const fired = Boolean(rule(src, 'track-directive'));
        if (fired && !should) {
          warned.push(`${JSON.stringify(a)} + ${JSON.stringify(pre)} + ${JSON.stringify(below)}`
            + ` + first=${JSON.stringify(first)} value=${JSON.stringify(value)}: engine applied nothing degenerate, linter WARNED`);
        }
        if (should) { degenerate += 1; if (!fired) silent += 1; if (!first) { deg1 += 1; if (!fired) sil1 += 1; } }
        }
        }
        }
      }
    }
    // The arm that bites.
    assert.deepEqual(warned, []);
    // And the arm that keeps the SUBSET honest. A rule that went quiet everywhere
    // would also pass "no false warnings"; it would not pass this. The counts move
    // with the alphabet, so they are a reviewed diff rather than a discovery.
    assert.equal(degenerate, 23955, 'shapes the engine applies degenerately');
    assert.equal(silent, 21423, 'of those, the ones the subset rule declines');
    // Split by directive count. Almost all the silence is the multi-directive
    // half, where a declined later directive makes the answer unknowable and the
    // rule voids the slide. The one-directive half is the ordinary deck: 1077 /
    // 657, which moved from 1002 / 582 only because the bare deck-wide forms are
    // now generated as a  value and count as one-directive shapes too.
    assert.equal(deg1, 1077, 'one-directive shapes the engine applies degenerately');
    assert.equal(sil1, 657, 'of those, the ones the subset rule declines');
    // Split by directive count. Almost all the silence is the multi-directive
    // half, where a declined later directive makes last-wins unknowable and the
    // rule voids the slide. The one-directive half is the ordinary deck, and it
    // is 1002 / 582 — unchanged by the last two rounds of fixes, which is the
    // evidence that neither the voiding nor the empty-value clearing cost
    // anything a real author would notice.

    // SPLIT BY DIRECTIVE COUNT, because the aggregate hides the case that matters.
    // Almost all the silence is the multi-directive half, where a poisoned later
    // directive makes last-wins unknowable and the rule voids the slide rather
    // than falling back to an earlier one. The one-directive half is the ordinary
    // deck, and a checker caught an earlier version of this rule voiding 38% more
    // of it than it needed to — only a skipped line that would ITSELF have been
    // applied can supersede, so only that one blinds.


  });

  /* The delimiter scanner's own pins. A checker mutated it to `/-/` and to a form
   * with no leading-indent class and BOTH passed the whole suite — the table said
   * only "matches `| --- | --- |`, does not match `prose`", which is not a
   * contract. Each row below dies under one of those mutants.
   */
  test('the table-delimiter lookahead is pinned in both directions', () => {
    const { render } = require('../../../lib/engine');
    const applied = (src) => {
      const out = render(src, {});
      const html = typeof out === 'string' ? out : out.html;
      return (html.match(/data-track="([^"]*)"/) || [])[1];
    };
    const T = (...lines) => `${FM}<!-- _class: topic -->\n\n## T\n\n${lines.join('\n')}\n`;

    // A `- item` line is NOT a delimiter row. Reading it as one silences a real
    // warning — the mutant that replaced the whole scanner with `/-/`.
    const bullet = T('<!-- _track: A | B -->', '- item');
    assert.match(applied(bullet), /A \| B/, 'the engine applies it');
    assert.ok(rule(bullet, 'track-directive'), 'so the rule must still warn');

    // An INDENTED delimiter row under an indented directive really does make a
    // table, so declining is right — this is the shape the space-indent axis
    // exists for, and the mutant that drops the leading-indent class warns here.
    const indented = T('- item', '  <!-- _track: A | B -->', '  | --- | --- |');
    assert.equal(applied(indented), undefined, 'the engine reads no directive');
    assert.equal(rule(indented, 'track-directive'), undefined, 'so the rule is silent');

    // A single-label `_track` has no pipe, so markdown-it refuses it as a header
    // and the engine applies it. Dropping the `|` guard would silence this.
    const single = T('<!-- _track: A -->', '| --- |');
    assert.match(applied(single), /^A$/, 'the engine applies it');
    assert.ok(rule(single, 'track-directive'), 'so the rule must still warn');

    // END OF SLIDE: no line below at all. A checker showed the `?? ''` fallback is
    // a no-op — `String(undefined)` is `'undefined'`, which the scanner rejects
    // exactly as it rejects `''` — so this row does NOT pin that expression. It
    // pins the outcome: a deck whose last line is the directive still warns.
    const last = `${FM}<!-- _class: topic -->\n\n## T\n\n<!-- _track: A | B -->`;
    assert.match(applied(last), /A \| B/, 'the engine applies it');
    assert.ok(rule(last, 'track-directive'), 'so the rule must still warn');

    // ALIGNMENT COLONS were entirely unpinned — two mutants that dropped them
    // survived the whole file, and each turns a real table into a false warning.
    const aligned = T('<!-- _track: A | B -->', '| :--- | ---: |', '| a | b |');
    assert.equal(applied(aligned), undefined, 'the engine reads no directive');
    assert.equal(rule(aligned, 'track-directive'), undefined, 'so the rule is silent');

    // A CLOSING PIPE MAY BE FOLLOWED BY BLANKS. markdown-it splits the row on `|`
    // and skips an empty last cell, so this is a real table; rejecting it was 532
    // false positives over 11,610 generated rows, and invisible in any editor.
    const trailing = T('<!-- _track: A | B -->', '| --- | --- | ', '| a | b |');
    assert.equal(applied(trailing), undefined, 'the engine reads no directive');
    assert.equal(rule(trailing, 'track-directive'), undefined, 'so the rule is silent');

    // A BLOCKQUOTED delimiter row is a blockquote, not a table — the engine
    // applies the directive, so accepting `>` here silenced a real warning.
    const quoted = T('<!-- _track: A | B -->', '> | --- | --- |');
    assert.match(applied(quoted), /A \| B/, 'the engine applies it');
    assert.ok(rule(quoted, 'track-directive'), 'so the rule must still warn');
  });

  test('a pipe-carrying comment over a long blank line does not hang', () => {
    // THE FOURTH backtracking-or-quadratic defect on this rule, and the first one
    // a test would have caught. The delimiter check runs on ANY comment line
    // carrying a `|`, so a note plus one long whitespace-led line was enough: the
    // regex this replaces took 33 s on a 195 KB deck, on the Studio's main-thread
    // lint source. The scanner is linear; this arm is the standing proof.
    const src = `${FM}<!-- _class: topic -->\n\n## T\n\n<!-- note: revenue | margin -->\n${' '.repeat(200000)}x\n`;
    const started = Date.now();
    core.lintTextWith(src, { names: new Set(['topic']), modifiers: new Set() });
    const ms = Date.now() - started;
    assert.ok(ms < 2000, `195 KB must not take ${ms}ms — the old regex took 33,000`);
  });

  /* An EMPTY `_track` is a directive, not a non-directive — and the difference is a
   * false warning. It parses with `value: ''`, the engine APPLIES it, it supersedes
   * every `_track` above it, and the slide then draws no authored track — so any
   * warning about an earlier directive is wrong. Three sites tested the value's
   * truthiness instead of "is this a directive" and promoted the earlier one.
   */
  test('an empty `_track` clears the answer rather than being ignored', () => {
    const { render } = require('../../../lib/engine');
    const applied = (src) => {
      const out = render(src, {});
      const html = typeof out === 'string' ? out : out.html;
      return (html.match(/data-track="([^"]*)"/) || [])[1];
    };
    const T = (...lines) => `${FM}<!-- _class: topic -->\n\n## T\n\n${lines.join('\n')}\n`;
    const shapes = {
      'plain, after a degenerate one': T('<!-- _track: A | B -->', '<!-- _track: -->'),
      'across a markup line': T('<!-- _track: A | B -->', '<b>n</b>', '<!-- _track: -->'),
      'clearing a MULTI-LINE one': T('<!--', '_track: A | B -->', '<!-- _track: -->'),
      'itself multi-line': T('<!-- _track: A | B -->', '<!--', '_track: -->'),
      'quoted empty value': T('<!-- _track: A | B -->', '<!-- _track: "" -->'),
    };
    for (const [what, src] of Object.entries(shapes)) {
      assert.equal(applied(src), undefined, `${what}: the engine draws no track`);
      assert.equal(rule(src, 'track-directive'), undefined, `${what}: so the rule is silent`);
    }
  });

  /* BOTH HALVES of the multi-line block's `markup` fork. A checker mutated each
   * direction away and both survived the whole file — the branch was doing real
   * work that nothing asserted.
   */
  test('a multi-line directive is read, or voids, depending on what is above it', () => {
    const { render } = require('../../../lib/engine');
    const applied = (src) => {
      const out = render(src, {});
      const html = typeof out === 'string' ? out : out.html;
      return (html.match(/data-track="([^"]*)"/) || [])[1];
    };
    const T = (...lines) => `${FM}<!-- _class: topic -->\n\n## T\n\n${lines.join('\n')}\n`;

    // NO markup above: the block is READ, and a well-formed one supersedes the
    // degenerate directive before it. Dropping the read warns about the first.
    const read = T('<!-- _track: A | B -->', '<!--', '_track: C | [D] -->');
    assert.match(applied(read), /C \| \[D\]/, 'the engine applies the later block');
    assert.equal(rule(read, 'track-directive'), undefined, 'so there is nothing to warn about');

    // MARKUP above: the block is not this rule's to read, so it VOIDS rather than
    // letting the earlier directive answer. Dropping the void warns about the first.
    const voided = T('<!-- _track: A | B -->', '<b>x</b>', '', '<!--', '_track: C | [D] -->');
    assert.match(applied(voided), /C \| \[D\]/, 'the engine still applies the later block');
    assert.equal(rule(voided, 'track-directive'), undefined, 'so the rule must not warn');

    // And the other half of the fork, which needs a shape where the markup above
    // means the engine does NOT read the block: a type-6 or type-1 block swallows
    // it, so nothing is applied. Reading it anyway invents a degenerate directive
    // out of a code sample — collapsing the fork to always-read passes every other
    // row in this file, so these three are the only thing holding it.
    for (const inside of [
      T('<div>', '<!--', '_track: A | B -->', '</div>'),
      T('<pre>', '<!--', '_track: A | B -->', '</pre>'),
      T('- <div>', '  <!--', '  _track: A | B -->'),
    ]) {
      assert.equal(applied(inside), undefined, 'the engine reads no directive');
      assert.equal(rule(inside, 'track-directive'), undefined, 'so the rule is silent');
    }
  });

  /* TWO CHANNELS. `lib/engine/slides.js` merges `{ ...runningGlobal, ...slideLocal }`,
   * so a SPOT `_track` beats a bare deck-wide `track:` on its own slide whatever the
   * line order. Modelling one "last directive" lost a real warning and invented a
   * false one, in opposite directions.
   */
  test('a spot directive beats a deck-wide one, whatever the order', () => {
    const { render } = require('../../../lib/engine');
    const applied = (src) => {
      const out = render(src, {});
      const html = typeof out === 'string' ? out : out.html;
      return (html.match(/data-track="([^"]*)"/) || [])[1];
    };
    const T = (...lines) => `${FM}<!-- _class: topic -->\n\n## T\n\n${lines.join('\n')}\n`;

    // An empty BARE directive clears only the deck-wide channel, so the spot
    // directive above it still answers — and it is degenerate, so it still warns.
    const bareEmpty = T('<!-- _track: A -->', '<!-- track: -->');
    assert.match(applied(bareEmpty), /^A$/, 'the engine still applies the spot directive');
    assert.ok(rule(bareEmpty, 'track-directive'), 'so the rule must still warn');

    // And the deck-wide finding must NOT fire where a spot directive on the same
    // slide already overrides it — both halves of "it overrides this slide and
    // every one after it" are false there.
    const bothOnOne = T('<!-- _track: A | [B] -->', '<!-- track: C | [D] -->');
    assert.match(applied(bothOnOne), /A \| \[B\]/, 'the spot directive wins');
    assert.equal(rule(bothOnOne, 'track-directive'), undefined, 'so nothing is wrong here');
  });

  /* A PHANTOM BLOCK IS NOT A BLOCK. A `<!--` at a list-continuation indent, or one
   * under a fence or a tag, opens no `html_block` in markdown-it — so the engine
   * never reads a comment there. Collecting lines into a block anyway swallowed a
   * live directive unread and, worse, fabricated a warning from a slide that has
   * no applied directive at all.
   */
  test('an indented or poisoned `<!--` opens no block', () => {
    const { render } = require('../../../lib/engine');
    const applied = (src) => {
      const out = render(src, {});
      const html = typeof out === 'string' ? out : out.html;
      return (html.match(/data-track="([^"]*)"/) || [])[1];
    };
    // Fabricated from nothing: no directive is applied anywhere on this slide.
    const fabricated = `${FM}<!-- _class: topic -->\n\n## Cost to win\n\n1. Pipeline\n   <!--\n_track: Cost to win -->\n\nA claim.\n`;
    assert.equal(applied(fabricated), undefined, 'the engine reads no directive');
    assert.equal(rule(fabricated, 'track-directive'), undefined, 'so the rule must be silent');

    // And the promote direction: a phantom block under a fence or raw text
    // swallowed the well-formed directive after it, leaving the degenerate one.
    const T = (...lines) => `${FM}<!-- _class: topic -->\n\n## T\n\n${lines.join('\n')}\n`;
    for (const poisoned of [
      T('<!-- _track: A -->', '```', '<!--', '```', '<!-- _track: X | [Y] -->'),
      T('<!-- _track: A -->', '<pre>', '<!--', '</pre>', '<!-- _track: X | [Y] -->'),
      T('<!-- _track: A -->', '<script>', '<!--', '</script>', '<!-- _track: X | [Y] -->'),
    ]) {
      assert.match(applied(poisoned), /X \| \[Y\]/, 'the engine applies the later directive');
      assert.equal(rule(poisoned, 'track-directive'), undefined, 'so the rule must not warn');
    }
  });

  test('KNOWN RESIDUAL: a raw-text block closed by a DIFFERENT tag', () => {
    // CommonMark ends a type-1 block on `</pre>`, `</script>`, `</style>` OR
    // `</textarea>` — whichever comes first — so the engine really does read the
    // directive here. The rule never tries to work out whether a block closed, so
    // it stays silent. Pinned because an earlier commit CLAIMED this shape was
    // pinned when nothing in the tree recorded it; a checker caught the claim.
    const { render } = require('../../../lib/engine');
    const src = `${FM}<!-- _class: topic -->\n\n## T\n\n<script>\n</style>\n<!-- _track: A -->\n`;
    const out = render(src, {});
    const html = typeof out === 'string' ? out : out.html;
    assert.match(html, /data-track="A"/, 'the engine really does apply it');
    assert.equal(rule(src, 'track-directive'), undefined, 'and the rule really is silent');
  });

  test('KNOWN RESIDUAL: a markup line above a directive silences the rest', () => {
    // NOT A BUG — the subset rule's headline cost, pinned so it is a written-down
    // price rather than a discovery. `<b>bold</b> text` is a PARAGRAPH to
    // markdown-it (type 7 wants the tag alone on the line, and `b` is not a type-6
    // name), so the comment under it really is its own token and really is applied.
    // The rule declines anyway, because it does not try to work out WHICH kind of
    // block a markup line opened or whether it closed — that judgement is exactly
    // what six rounds of checkers falsified. A false NEGATIVE, which is the safe
    // direction for an advisory rule.
    const { render } = require('../../../lib/engine');
    const src = `${FM}<!-- _class: topic -->\n\n## T\n\n<b>bold</b> text\n<!-- _track: A -->\n`;
    const out = render(src, {});
    const html = typeof out === 'string' ? out : out.html;
    assert.match(html, /data-track="A"/, 'the engine really does apply it');
    assert.equal(rule(src, 'track-directive'), undefined, 'and the rule really is silent');
  });

  test('a bare `track:` is reported as the DECK-WIDE form it is', () => {
    // One missing underscore overrides every slide after this one; the rule used
    // to say "_track does nothing on a slide that is not `topic`", which is the
    // opposite of what happens.
    const src = `${FM}<!-- _class: divider -->\n<!-- track: Alpha | [Beta] -->\n\n## S\n`;
    const f = rule(src, 'track-directive');
    assert.ok(f, 'expected a finding');
    assert.match(f.message, /DECK-WIDE/);
    assert.match(f.fix, /underscore/);
  });

  test('the rule fires exactly where the ENGINE applies the directive', () => {
    // The whole point of the two rules: agree with the renderer. Each row was
    // measured through `require('lib/engine').render` — only a comment that OPENS
    // A LINE becomes a directive, which is markdown-it's `html_block` rule.
    const inert = [
      ['inline in a paragraph', '## T\n\nSome text <!-- _track: A -->\n'],
      ['indented four spaces', '## T\n\n    <!-- _track: A -->\n'],
      ['inline code', '## T\n\n`<!-- _track: A -->`\n'],
      ['nested in another comment', '<!-- outer <!-- _track: A --> tail -->\n\n## T\n'],
    ];
    for (const [what, body] of inert) {
      const src = `${FM}<!-- _class: topic -->\n${body}`;
      assert.equal(rule(src, 'track-directive'), undefined, `${what} is inert to the engine`);
    }
    // …and it is NOT silent where the engine does apply one.
    const live = `${FM}<!-- _class: topic -->\n<!-- _track: A -->\n\n## T\n`;
    assert.match(rule(live, 'track-directive').message, /one label/);
  });

  test('a stray fence inside a comment does not silence a real directive', () => {
    // `stripFencedCode` blanks from an UNCLOSED fence to the end of the slide, so
    // a ``` in a speaker note hid a `_track` the engine really applies — the file
    // linted clean on a slide whose track the renderer then declined to draw.
    const src = `${FM}<!-- _class: topic -->\n\n## B\n\n<!--\n\`\`\`\nnote\n-->\n\n<!-- _track: A -->\n`;
    assert.match(rule(src, 'track-directive').message, /one label/);
  });

  test('bullets inside an UNTERMINATED comment are not a list either', () => {
    // A browser swallows the rest of the slide, and the engine emits no `<ul>` at
    // all — so `track-list` told the author to delete prose no reader ever sees,
    // contradicting the `unterminated-comment` finding on the same slide.
    const src = `${FM}<!-- _class: topic -->\n\n## B\n\n<!-- oops\n\n- bullet one\n- bullet two\n`;
    assert.equal(rule(src, 'track-list'), undefined);
  });

  test('bullets inside a speaker-note comment are not a list', () => {
    // markdown-it emits no list for them, so "it renders as content" was false
    // and the fix told the author to delete prose no reader ever sees.
    const src = `${FM}<!-- _class: topic -->\n\n## A\n\nx\n\n<!--\n- speaker point one\n- speaker point two\n-->\n`;
    assert.equal(rule(src, 'track-list'), undefined);
  });
});

describe('label-set-above-body — coaching, never refusal', () => {
  const vocab = { names: new Set(['matrix-grid']), modifiers: new Set() };
  const grid = (spanAbove) => [
    '<!-- _class: matrix-grid -->', '',
    '`[Wider reach, Deeper cognition]`', '',
    ...(spanAbove ? ['`[{[-], within reach}]`', ''] : []),
    '## Rubric', '',
    '| Verb | Self |', '| --- | :--: |', '| Notice | [x] |',
    ...(spanAbove ? [] : ['', '`[{[-], within reach}]`']),
  ].join('\n');

  // A key above the body is eaten as an axis, silently and degenerately —
  // `data-col-axis="[-] ▶"` and no key at all. The deck still renders, so we
  // coach rather than refuse (HARD RULE #29's posture).
  test('warns when a label set sits above the body, and says how to fix it', () => {
    const hits = core.lintTextWith(grid(true), vocab)
      .filter((f) => f.rule === 'label-set-above-body');
    assert.equal(hits.length, 1);
    assert.equal(hits[0].severity, 'warning', 'never an error — the deck still renders');
    assert.match(hits[0].message, /ABOVE the table/);
    assert.match(hits[0].fix, /below the table/);
    // The axis position names come from the CATALOG, never a literal here.
    assert.match(hits[0].fix, /column, row/);
  });

  test('is silent when the key sits below the body, where it belongs', () => {
    const hits = core.lintTextWith(grid(false), vocab)
      .filter((f) => f.rule === 'label-set-above-body');
    assert.deepEqual(hits, []);
  });

  // `parseInlineSet` accepts the braced AXIS form as a set, so the rule used to
  // fire on the documented axis itself — and on scatter told the author to
  // delete it. Above the body, only a list naming a KEY member is a misplaced key.
  // The rule's body detector has to agree with the render's boundary (the first
  // body TAG markdown-it emits), or it warns on the wrong side of it.
  test('a list line inside an HTML comment is not the body', () => {
    // Without the comment blanking the note's bullet set the boundary, so the
    // key BELOW it read as below the body and the above-body coaching was lost.
    const all = { names: new Set(['scatter']), modifiers: new Set() };
    const src = ['<!-- _class: scatter -->', '', '<!--', '- speaker note', '-->', '',
      '`[{[x], Enacted}]`', '', '## H', '', '- A `1` `2`'].join('\n');
    assert.deepEqual(core.lintTextWith(src, all).filter((f) => /^label-set-/.test(f.rule)).map((f) => f.rule), ['label-set-above-body']);
  });

  test('a literal `<!--` quoted in inline code is text, not a comment', () => {
    // It used to blank the rest of the slide from the lint rules' view.
    const src = ['<!-- _class: matrix-grid -->', '', 'Use `<!--` for notes.', '', '## Rubric', '',
      '| Verb | Self |', '| --- | :--: |', '| Notice | [x] |', '', '`[{[q], met}]`'].join('\n');
    assert.deepEqual(core.lintTextWith(src, vocab).filter((f) => /^label-set-/.test(f.rule)).map((f) => f.rule), ['label-set-unbound']);
  });

  test('an inline `<!--` closes only inside its paragraph, as markdown-it reads it', () => {
    // A speaker note at the end of the slide used to close a `<!--` quoted in prose
    // above the table, blanking everything between — the key below went unlinted.
    const src = ['<!-- _class: matrix-grid -->', '', 'Type <!-- to open a note.', '', '## Rubric', '',
      '| Verb | Self |', '| --- | :--: |', '| Notice | [x] |', '', '`[{[q], met}]`', '', '<!-- n -->'].join('\n');
    assert.deepEqual(core.lintTextWith(src, vocab).filter((f) => /^label-set-/.test(f.rule)).map((f) => f.rule), ['label-set-unbound']);
  });

  test('comment blanking stays linear on untrusted input (HARD RULE #22)', () => {
    // It went quadratic once: 280 KB of `a <!--` lines took 12 s. Linear, this is
    // tens of milliseconds; the bound is generous so a slow runner cannot flake it,
    // and still an order of magnitude under the quadratic shape.
    const body = 'a <!--\n'.repeat(100000);
    const deck = `<!-- _class: quadrant -->\n\n${body}\n## H\n\n- a\n  - b \`1, 2\`\n`;
    const t = Date.now();
    core.findQuadrantAxisIssues(deck);
    const oneLine = `<!-- _class: quadrant -->\n\n${'<!--'.repeat(100000)}\n\n## H\n\n- a\n  - b \`1, 2\`\n`;
    core.findQuadrantAxisIssues(oneLine);
    // Many CLOSED comments on one line — the shape the second quadratic path hid in.
    const pairs = `<!-- _class: quadrant -->\n\n${'<!-- x -->'.repeat(100000)}\n\n## H\n\n- a\n  - b \`1, 2\`\n`;
    core.findQuadrantAxisIssues(pairs);
    assert.ok(Date.now() - t < 2000, `took ${Date.now() - t}ms`);
  });

  test('a key with more members than axes is not called the axis — it prints as text', () => {
    const src = ['<!-- _class: matrix-grid -->', '', '`[{[-], within reach}, {[x], met}, {[ ], out}]`', '', '## R', '',
      '| Verb | Self |', '| --- | :--: |', '| N | [x] |'].join('\n');
    const [hit] = core.lintTextWith(src, vocab).filter((f) => f.rule === 'label-set-above-body');
    assert.match(hit.message, /neither the axis nor the key/);
  });

  test('a blockquoted list is the body, as markdown-it emits its <ul>', () => {
    // The render's boundary is that <ul>, so the span after it is BELOW the body
    // and stays on the slide — lint must not call it an axis above the body.
    const all = { names: new Set(['scatter']), modifiers: new Set() };
    const src = ['<!-- _class: scatter -->', '', '> - quoted point', '',
      '`[{[x], Enacted}]`', '', '## H', '', '- A `1` `2`'].join('\n');
    assert.deepEqual(core.lintTextWith(src, all).filter((f) => /^label-set-/.test(f.rule)).map((f) => f.rule), ['label-set-unbound']);
  });

  test('a state-marker key above a keyless chart is still a misplaced key', () => {
    // scatter declares no key vocabulary, so the state markers stand in for it.
    const all = { names: new Set(['scatter']), modifiers: new Set() };
    const src = '<!-- _class: scatter -->\n\n`[{[x], Enacted}]`\n\n## H\n\n- A `1` `2`\n';
    assert.deepEqual(core.lintTextWith(src, all).filter((f) => f.rule === 'label-set-above-body').length, 1);
  });

  test('the braced axis form above the body is an axis, never a misplaced key', () => {
    const all = { names: new Set(['matrix-grid', 'scatter', 'quadrant']), modifiers: new Set() };
    const decks = [
      ['matrix-grid', '`[{Wider reach, 0..4}, {Deeper cognition, 0..6}]`', '| Verb | Self |\n| --- | :--: |\n| Notice | [x] |'],
      ['scatter', '`[{Effort, 0..10}, {Reach, 0..100}]`', '- A `1` `2`\n- B `3` `4`'],
      ['quadrant', '`[{Effort, 0..10, 5}, {Reach, 0..100, 50}]`', '- Bets\n  - A `3, 70`'],
    ];
    for (const [cls, axis, body] of decks) {
      const src = `<!-- _class: ${cls} -->\n\n${axis}\n\n## H\n\n${body}\n`;
      const hits = core.lintTextWith(src, all).filter((f) => /^label-set-/.test(f.rule));
      assert.deepEqual(hits.map((h) => h.rule), [], cls);
    }
  });
});

describe('lint-core: an empty box whose meaning moved (rule 16, six state marks)', () => {
  const moved = (src) => core.lintTextWith(src, vocab).filter((f) => f.rule === 'moved-empty-box');
  const slide = (cls, body) => `${FM}<!-- _class: ${cls} -->\n\n## Heading\n\n${body}\n`;

  test('verdict-grid: `[ ]` is now "not assessed", and the fix names `[!]`', () => {
    const found = moved(slide('verdict-grid', '- Vendor\n  - [x] Speed\n  - [ ] Audit\n  - [ ] Cost\n  - Why.'));
    assert.equal(found.length, 1, 'one finding per slide, not per box');
    assert.equal(found[0].severity, 'info', 'a legitimate answer is never a warning');
    assert.match(found[0].message, /not assessed/);
    assert.match(found[0].message, /2 on this slide/);
    assert.match(found[0].fix, /`\[!\]`/);
  });

  test('obligation-matrix: `[ ]` is now "undetermined", and the fix names `[/]`', () => {
    const found = moved(slide('obligation-matrix', '| Regime | A |\n| --- | :-: |\n| GDPR | [ ] |'));
    assert.equal(found.length, 1);
    assert.match(found[0].message, /undetermined/);
    assert.match(found[0].fix, /`\[\/\]`/);
  });

  test('says nothing where `[ ]` always meant open, or where the author already migrated', () => {
    assert.equal(moved(slide('checklist', '- [ ] Todo')).length, 0);
    assert.equal(moved(slide('verdict-grid', '- Vendor\n  - [!] Audit\n  - Why.')).length, 0);
    assert.equal(moved(slide('obligation-matrix', '| Regime | A |\n| --- | :-: |\n| GDPR | [/] |')).length, 0);
    // A verdict-grid CARD line (depth 1) is not a criterion.
    assert.equal(moved(slide('verdict-grid', '- [ ] Vendor\n  - [x] Audit')).length, 0);
  });

  test('a label set that names `[ ]` on the slide answers the question — no finding', () => {
    const body = '`[{[x], High exposure}, {[ ], Controlled}]`\n\n| Req | A |\n| --- | :-: |\n| Audit | [ ] |';
    assert.equal(moved(slide('obligation-matrix', body)).length, 0);
  });

  test('a fenced example on the slide is quoted material, not a criterion', () => {
    assert.equal(moved(slide('verdict-grid', '```markdown\n- Vendor\n  - [ ] Audit\n```')).length, 0);
  });
  test('pricing: `[ ]` is now "coming", and the fix offers `[!]` or `[/]`', () => {
    const found = moved(slide('pricing', '- Starter `$0`\n  - [x] Seats\n  - [ ] Audit log\n  - For one team.'));
    assert.equal(found.length, 1);
    assert.match(found[0].message, /"coming"/);
    assert.match(found[0].message, /"missing"/);
    assert.match(found[0].fix, /`\[!\]`/);
    assert.match(found[0].fix, /`\[\/\]`/);
  });

  test('the class counts anywhere in the list, as the engine decodes it', () => {
    assert.equal(moved(slide('dark verdict-grid', '- Vendor\n  - [ ] Audit')).length, 1);
    assert.equal(moved(slide('heat obligation-matrix', '| R | A |\n| --- | :-: |\n| GDPR | [ ] |')).length, 1);
  });

  test('a slide already using `[!]` or `[?]` was written for the six markers — its `[ ]` is meant', () => {
    assert.equal(moved(slide('verdict-grid', '- Vendor\n  - [!] Audit\n  - [ ] Cost\n  - Why.')).length, 0);
    assert.equal(moved(slide('pricing', '- Pro\n  - [?] SSO\n  - [ ] Audit\n  - Why.')).length, 0);
  });

  test('an HTML comment on the slide is not a criterion', () => {
    assert.equal(moved(slide('verdict-grid', '<!--\n- Vendor\n  - [ ] Audit\n-->\n- Vendor\n  - [x] A')).length, 0);
  });

  test('findings carry shapeChange, which the render path prints as a warning', () => {
    const [f] = moved(slide('obligation-matrix', '| R | A |\n| --- | :-: |\n| GDPR | [ ] |'));
    assert.equal(f.shapeChange, true);
    assert.equal(f.autofixable, undefined, 'obligation-matrix has no safe rewrite: exempt, "not required" or open');
    assert.deepEqual(core.findMovedEmptyBoxes(slide('verdict-grid', '- V\n  - [ ] A')).map((x) => x.rule), ['moved-empty-box']);
  });
});

describe('lint-core: `--fix` migrates a moved empty box, and only where the meaning moved', () => {
  const fixed = (src) => core.applyAllFixes(src, vocab);
  const slide = (cls, body) => `<!-- _class: ${cls} -->\n\n## Heading\n\n${body}\n`;

  test('rewrites EVERY `[ ]` on a verdict-grid slide, not just the first', () => {
    // The first `[!]` makes the slide read as six-marker and silences the rule, so a
    // line-at-a-time fix would stop after one line and leave the slide half-migrated.
    const out = fixed(FM + slide('verdict-grid', '- Vendor\n  - [x] Speed\n  - [ ] Audit\n  - [ ] Cost\n  - Why.'));
    assert.match(out, / {2}- \[!\] Audit\n {2}- \[!\] Cost/);
    assert.match(out, / {2}- \[x\] Speed/);
  });

  test('rewrites pricing, and leaves a checklist on the same deck alone', () => {
    const src = FM + slide('pricing', '- Pro\n  - [ ] Audit\n  - Why.') + '\n---\n\n' + slide('checklist', '- [ ] Todo');
    const out = fixed(src);
    assert.match(out, / {2}- \[!\] Audit/);
    assert.match(out, /- \[ \] Todo/);
  });

  test('never rewrites a fenced example on the same slide', () => {
    const out = fixed(FM + slide('verdict-grid', '```markdown\n- V\n  - [ ] Quoted\n```\n\n- Vendor\n  - [ ] Audit'));
    assert.match(out, / {2}- \[ \] Quoted/);
    assert.match(out, / {2}- \[!\] Audit/);
  });

  test('never rewrites inside a multi-line HTML comment, but does beside a one-line one', () => {
    const out = fixed(FM + slide('verdict-grid', '<!--\n- V\n  - [ ] Hidden\n-->\n- Vendor\n  - [ ] Audit <!-- note -->'));
    assert.match(out, / {2}- \[ \] Hidden/);
    assert.match(out, / {2}- \[!\] Audit <!-- note -->/);
  });

  // `split: headings` is the DEFAULT, so one `---` chunk routinely holds several rendered
  // slides. The rewrite must touch only the slide the finding judged.
  const SPLIT_DECK = (fm) => `---\n${fm}---\n\n<!-- _class: verdict-grid -->\n\n# Vendors\n\n`
    + '- Acme\n  - [x] SOC 2\n  - [ ] ISO\n  - Why.\n\n'
    + '<!-- _class: checklist -->\n\n## Launch checklist\n\n- Tasks\n  - [ ] book venue\n';

  test('the default split (no `split:` key) rewrites the verdict-grid slide and not the checklist beside it', () => {
    // The checker's failing input: before, `--fix` rewrote BOTH `[ ]`.
    const out = fixed(SPLIT_DECK('marp: true\n'));
    assert.match(out, / {2}- \[!\] ISO/);
    assert.match(out, / {2}- \[ \] book venue/, 'the checklist on the next rendered slide keeps its open box');
  });

  test('`split: headings` spelled out behaves the same, and so does a quoted value', () => {
    for (const fm of ['split: headings\n', 'split: "headings"\n']) {
      const out = fixed(SPLIT_DECK(fm));
      assert.match(out, / {2}- \[!\] ISO/);
      assert.match(out, / {2}- \[ \] book venue/);
    }
  });

  test('under `split: rule` the chunk is ONE slide, and its governing class decides', () => {
    // No heading split, so the directive scanner's winner governs the whole slide — here
    // the later `_class: checklist`. That slide never renders as a verdict-grid, so the
    // rule says nothing and rewrites nothing.
    const src = SPLIT_DECK('split: rule\n');
    assert.equal(core.findMovedEmptyBoxes(src).length, 0);
    assert.equal(fixed(src), src);
  });

  test('slide numbers count RENDERED slides under heading splits', () => {
    const deck = '---\nmarp: true\n---\n\n# Intro\n\nHello.\n\n<!-- _class: verdict-grid -->\n\n## Vendors\n\n- Acme\n  - [ ] ISO\n  - Why.\n';
    const [f] = core.findMovedEmptyBoxes(deck);
    assert.equal(f.slide, 2, 'the verdict-grid is the second rendered slide, though it shares a chunk with the first');
  });

  test('a comment that closes and reopens on one line keeps the next line hidden', () => {
    const src = FM + slide('verdict-grid', '- Vendor\n  - [ ] Audit\n<!-- note\nold --> x <!-- again\n  - [ ] commented\n-->');
    const out = fixed(src);
    assert.match(out, / {2}- \[!\] Audit/);
    assert.match(out, / {2}- \[ \] commented/, 'text inside the reopened comment is never rewritten');
  });

  test('a criterion AFTER a comment closes on the same line is live and rewritten', () => {
    const src = FM + slide('verdict-grid', '- Vendor\n<!-- a\nb --> x\n  - [ ] tail');
    assert.match(fixed(src), / {2}- \[!\] tail/);
  });

  test('never touches obligation-matrix: its `[ ]` has three honest readings', () => {
    const src = FM + slide('obligation-matrix', '| R | A |\n| --- | :-: |\n| GDPR | [ ] |');
    assert.equal(fixed(src), src);
  });

  test('the CLI `--fix` writes the file and reports it', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { spawnSync } = require('node:child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-fix-'));
    const file = path.join(dir, 'deck.md');
    fs.writeFileSync(file, FM + slide('verdict-grid', '- Vendor\n  - [x] A\n  - [ ] B\n  - Why.'));
    const r = spawnSync(process.execPath, [path.resolve(__dirname, '../../../tools/lint-deck.js'), '--fix', file], { encoding: 'utf8' });
    assert.match(r.stderr, /lint:deck --fix — rewrote/);
    assert.match(r.stderr, /slide 1 · moved-empty-box/, 'each applied fix is named');
    assert.match(fs.readFileSync(file, 'utf8'), / {2}- \[!\] B/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('the CLI `--fix` keeps every line\'s own ending — lone CR and a mixed file too', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { spawnSync } = require('node:child_process');
    const body = FM + slide('verdict-grid', '- Vendor\n  - [x] A\n  - [ ] B\n  - Why.');
    const cases = {
      cr: body.replace(/\n/g, '\r'),
      mixed: body.split('\n').map((l, i, a) => l + (i === a.length - 1 ? '' : i % 2 ? '\r\n' : '\n')).join(''),
    };
    for (const [name, src] of Object.entries(cases)) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-fix-'));
      const file = path.join(dir, 'deck.md');
      fs.writeFileSync(file, src);
      spawnSync(process.execPath, [path.resolve(__dirname, '../../../tools/lint-deck.js'), '--fix', file], { encoding: 'utf8' });
      const out = fs.readFileSync(file, 'utf8');
      const changed = [...out].filter((ch, i) => ch !== src[i]).length;
      assert.equal(out.length, src.length, `${name}: no line ending rewritten`);
      assert.equal(changed, 1, `${name}: the fix is the one character inside \`[ ]\``);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the CLI `--fix` keeps the file\'s BOM and CRLF line endings', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { spawnSync } = require('node:child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-fix-'));
    const file = path.join(dir, 'deck.md');
    const body = FM + slide('verdict-grid', '- Vendor\n  - [x] A\n  - [ ] B\n  - Why.');
    fs.writeFileSync(file, `\uFEFF${body.replace(/\n/g, '\r\n')}`);
    spawnSync(process.execPath, [path.resolve(__dirname, '../../../tools/lint-deck.js'), '--fix', file], { encoding: 'utf8' });
    const out = fs.readFileSync(file, 'utf8');
    assert.ok(out.startsWith('\uFEFF'), 'the BOM survives');
    assert.ok(!/[^\r]\n/.test(out), 'every line still ends in CRLF');
    assert.match(out, / {2}- \[!\] B\r\n/);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('lint-core: typed crosses point at `[!]`, not the open box', () => {
  test('a typed ✗ in a state-cells table is coached toward `[!]` and the six markers', () => {
    const src = `${FM}<!-- _class: table state-cells -->\n\n## H\n\n| A | B |\n| --- | --- |\n| x | ✗ |\n`;
    const f = core.lintTextWith(src, vocab).find((x) => x.rule === 'typed-shape-glyph');
    assert.ok(f);
    assert.match(f.fix, /`\[!\]` no/);
    assert.doesNotMatch(f.fix, /`\[ \]` not met/);
  });
});

describe('lint-core: its heading-split mirror agrees with the engine', () => {
  // lint-core does not parse markdown, so `headingSubSlides` mirrors
  // lib/core/heading-split-core.js on lines. This pins the two together on every committed
  // deck: the rendered slide count from the mirror must equal the count of the engine's
  // own baked split. Measured 334 of 334 when the mirror landed.
  test('every committed deck counts the same rendered slides both ways', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const { execSync } = require('node:child_process');
    const { bakeSplits } = require('../../../lib/core/bake-splits');
    const { splitTopLevel } = require('../../../lib/authoring/slide-split');
    const ROOT = path.resolve(__dirname, '../../..');
    const fmCount = (src) => (/^---\n[\s\S]*?\n---\n/.test(src) ? 2 : 0);
    const decks = execSync("git ls-files '*.md'", { cwd: ROOT, encoding: 'utf8' }).split('\n')
      .filter((f) => /^(examples|exemplars|kit|test\/integration\/baseline-decks|lib\/components)\//.test(f)
        && !/\.docs\.md$|README/.test(f));
    const off = [];
    let checked = 0;
    for (const f of decks) {
      let src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      if (!/^\uFEFF?---\r?\n/.test(src)) continue;
      src = src.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
      const fm = fmCount(src);
      const headings = core.splitsOnHeadings(src);
      let mine = 0;
      splitTopLevel(src).forEach((chunk, i) => { if (i >= fm) mine += headings ? core.headingSubSlides(chunk).length : 1; });
      const baked = bakeSplits(src);
      const theirs = splitTopLevel(baked).length - fmCount(baked);
      checked++;
      if (mine !== theirs) off.push(`${f}: mirror ${mine}, engine ${theirs}`);
    }
    assert.ok(checked > 100, `expected the committed corpus, found ${checked} decks`);
    assert.deepEqual(off, []);
  });
});
