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
      assert.match(f.fix, /no overflow marker/, 'and does not promise a ring the export strips');
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

  // The advisory is CONDITIONAL and bounded from below, because the count no longer forces
  // anything: the splitter fires on measured overflow only (2026-07-29), and when it does fire
  // it paces at the tighter of the authored target and the measured ratio — so the real run can
  // be longer than the number here, and a slide that fits is not divided at all.
  test('the advisory promises neither that a split happens nor exactly how long it is', () => {
    const f = core.lintTextWith(overflowDeck('size: portrait\n'), capVocab)
      .find((x) => x.rule === 'capacity-autosplit');
    assert.match(f.message, /if it does not fit/, 'the split is conditional on fit, not on the count');
    assert.match(f.message, /or more pages/, 'and the page count is a floor, not a promise');
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

  test('applyAllFixes clears every autofixable finding across passes', () => {
    // Two inline-bold items on one slide: the rule flags the first per pass, so
    // applyAllFixes must loop (re-lint after each fix) to clear both.
    const src = `${FM}<!-- _class: cards-grid -->\n\n## H\n\n- **A.** one\n- **B.** two\n`;
    const fixed = core.applyAllFixes(src, vocab);
    assert.ok(fixed.includes('- A\n  - one'));
    assert.ok(fixed.includes('- B\n  - two'));
    assert.equal(core.lintTextWith(fixed, vocab).some((x) => x.autofixable), false);
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
    names: new Set(['cards-grid', 'compare-table']),
    modifiers: new Set(),
    capacity: {
      'cards-grid': { axis: 'item', min: 2, sweet: 3, soft: 4, hard: 5, escalateTo: ['list-tabular', 'split across slides'], note: 'the grid loses scannability past four cards' },
      'compare-table': { axis: 'row', sweet: 4, soft: 6, hard: 8, escalateTo: ['split across slides'] },
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
    assert.match(f.message, /auto-split divides it/);
    assert.equal(capRule(portrait, 'capacity-crowd'), undefined);
  });
  test('table layout counts the row axis', () => {
    const rows = (n) => `${FM}<!-- _class: compare-table -->\n\n## H\n\n| A | B |\n|---|---|\n` + Array.from({ length: n }, (_, i) => `| ${i} | x |\n`).join('');
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
    names: new Set(['compare-table', 'big-number']),
    modifiers: new Set(['claim-bleed', 'claim-hero', 'claim-quiet', 'claim-framed']),
    claimExcludes: { 'compare-table': ['claim-bleed'] },
    claimNames: ['framed', 'quiet', 'hero', 'bleed'],
  };
  const table = (cls) => `${FM}<!-- _class: ${cls} -->\n\n## H\n\n| a | b |\n| - | - |\n| 1 | 2 |\n`;
  const has = (src, rule) => core.lintTextWith(src, cvocab).some((f) => f.rule === rule);

  test('per-slide claim-bleed on an excluding component warns', () => {
    assert.ok(has(table('compare-table claim-bleed'), 'claim-bleed-unsafe'));
  });
  test('claim-bleed on a non-excluding component is silent', () => {
    assert.equal(has(`${FM}<!-- _class: big-number claim-bleed -->\n\n- 42\n  - x\n`, 'claim-bleed-unsafe'), false);
  });
  test('deck-wide claim: bleed warns on an excluding component (no per-slide token)', () => {
    assert.ok(has('---\nmarp: true\nclaim: bleed\n---\n\n<!-- _class: compare-table -->\n\n## H\n\n| a | b |\n| - | - |\n| 1 | 2 |\n', 'claim-bleed-unsafe'));
  });
  test('a per-slide claim-framed opts a slide out of a deck-wide bleed → no warning', () => {
    assert.equal(has('---\nmarp: true\nclaim: bleed\n---\n\n<!-- _class: compare-table claim-framed -->\n\n## H\n\n| a | b |\n| - | - |\n| 1 | 2 |\n', 'claim-bleed-unsafe'), false);
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
  // A deck-wide `finish:` paints a backdrop over title/closing bookends, whose
  // inverse display text washes out on a light canvas. The house pattern is
  // `finish-none` on bookends (examples/finish-backdrops.md).
  const beVocab = {
    names: new Set(['title', 'closing', 'content']),
    modifiers: new Set(['silent']),
    // Only a registered finish paints a backdrop; the rule gates on this vocab.
    finishNames: ['none', 'atrium', 'meridian', 'strata', 'halo', 'ledger', 'nimbus', 'loom', 'savile', 'gallery'],
  };
  const FMF = (fin) => `---\nmarp: true\ntheme: indaco\n${fin ? `finish: ${fin}\n` : ''}---\n\n`;
  const be = (fin, cls) => core.lintTextWith(`${FMF(fin)}<!-- _class: ${cls} -->\n\n# H\n`, beVocab)
    .find((f) => f.rule === 'bookend-finish-contrast');

  test('warns on a title bookend under a deck finish with no opt-out', () => {
    const f = be('atrium', 'title silent');
    assert.ok(f, 'title under a deck finish should warn');
    assert.equal(f.severity, 'warning');
    assert.equal(f.classToken, 'title');
  });

  test('warns on a closing bookend too', () => {
    assert.ok(be('ledger', 'closing silent'), 'closing under a deck finish should warn');
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
