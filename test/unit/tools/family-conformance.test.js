/**
 * Unit: the two pieces of the family-tier sweep that decide WHAT gets measured, and are pure
 * enough to pin without a browser — the ROSTER builders (`clipDeck`, `conformanceDeck`) and
 * `descopeFamily`.
 *
 * `tools/check-family-tiers.js` derives two committed records: `family-overflow.json` (does
 * each component's gallery slide clip at each @size) and `family-conformance.json` (does each
 * `[data-family]` rule actually do anything). Both are only as honest as the slides they are
 * derived from, so the slide choice is not an implementation detail — it is the assumption
 * every cell in both records rests on.
 *
 * WHY EACH ONE IS PINNED, since a test whose reason is forgotten gets deleted:
 *
 *  - The two records want DIFFERENT rosters, and a cut that made them share one cost real
 *    accuracy in both directions. The clip record wants the slide an author is most likely to
 *    write, held stable; the conformance record wants every slide a rule could reach. Pointing
 *    the clip roster at "the slide that exercises the reflow" moved seven components off the
 *    HARD RULE #8-protected baseline deck onto galleries ordinary feature work edits, dropped
 *    four verified clips from the record, and blessed four new ones.
 *  - Picking ONE slide per component for conformance cannot answer the conformance question.
 *    `q-and-a`'s family rules are scoped `.grid` and its first slide is plain; `list-steps`'
 *    are scoped `:not(.timeline)` and its first slide IS the timeline one. With one slide those
 *    rules read as facts about the component when they were gaps in the instrument.
 *  - `descopeFamily` is the baseline half of the effect test. The first cut of the pass had no
 *    de-scoping and compared the family-scoped selector's matches at `tall` against its matches
 *    at `wide` — where the section carries no `data-family` at all, so it matched NOTHING, every
 *    property read as "different from a baseline that does not exist", and all 33 components
 *    reported `fires`. A green that could not have gone red.
 *
 * The tool is required directly: its CLI entry points are guarded by `require.main === module`,
 * so importing it costs a parse and starts no browser. An earlier version of this file lifted
 * the function out of the source with `new Function`, which would have gone on passing against
 * nothing the day it was renamed.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  classTokens, galleryCandidates, clipDeck, conformanceDeck, descopeFamily, SPLIT_ONLY_MARKER,
} = require('../../../tools/check-family-tiers.js');

const sig = (x) => [...x.tokens].sort().join('.');

describe('tools: the sweep rosters — what the two records are derived from', () => {
  test('classTokens reads `_class:` by VALUE, so `list` cannot claim a `list-tabular` slide', () => {
    const t = classTokens('<!-- _class: list-tabular compact -->\n\n# x');
    assert.deepEqual([...t].sort(), ['compact', 'list-tabular']);
    assert.ok(!t.has('list'), 'a substring match would let `list` claim this slide');
  });

  test('clipDeck takes the FIRST candidate — one slide per component, baseline deck first', () => {
    const comps = ['decision', 'premise'];
    const deck = clipDeck('portrait', comps);
    assert.equal(deck.slides.length, comps.length, 'exactly one slide per component');
    deck.slides.forEach((s, i) => { assert.deepEqual(s.comps, [comps[i]], 'in roster order, one component each'); });
    for (const c of comps) {
      const first = galleryCandidates(c)[0];
      const mine = deck.slides.find((s) => s.comps[0] === c);
      assert.equal(mine.body, first.body,
        `${c}'s clip slide must be its first candidate. galleryCandidates orders the shared baseline `
        + 'deck first because HARD RULE #8 keeps feature work out of it, which is what makes the clip '
        + 'record stable across unrelated edits. Scoring a "better" slide here re-breaks that.');
    }
  });

  test('clipDeck fails loudly for a component with no gallery slide anywhere', () => {
    // Silently skipping is how the record came to claim 34 components while rendering 31.
    assert.throws(() => clipDeck('portrait', ['no-such-component-xyz']), /no slide to render/);
  });

  test('conformanceDeck carries EVERY candidate, not one — the variant the rule is scoped to', () => {
    // The two cases that were live defects. `q-and-a` needs a `.grid` slide AND a plain one;
    // `list-steps` needs a non-`.timeline` slide even though its FIRST slide is the timeline.
    const deck = conformanceDeck('portrait', ['q-and-a', 'list-steps']);
    const sigsOf = (c) => deck.slides.filter((s) => s.comps.includes(c))
      .map((s) => sig({ tokens: classTokens(s.body) }));

    const qa = sigsOf('q-and-a');
    assert.ok(qa.some((s) => s.split('.').includes('grid')),
      'q-and-a family rules are scoped `.grid`; without a `.grid` slide they cannot be exercised');
    assert.ok(qa.some((s) => !s.split('.').includes('grid')), 'and the plain form must still be swept');

    const ls = sigsOf('list-steps');
    assert.ok(ls.some((s) => !s.split('.').includes('timeline')),
      'list-steps family rules are scoped `:not(.timeline)`, and its FIRST gallery slide IS the '
      + 'timeline one — so a one-slide roster tests the single slide the rule excludes');

    for (const c of ['q-and-a', 'list-steps']) {
      assert.equal(deck.slides.filter((s) => s.comps.includes(c)).length, galleryCandidates(c).length,
        `every one of ${c}'s gallery slides must be in the conformance sweep`);
    }
  });

  test('conformanceDeck renders a shared slide ONCE and attributes it to both components', () => {
    // The baseline deck's `_class: compare-prose decision` slide is one page serving two
    // components. Rendering it twice would measure the same pixels twice and inflate the deck.
    const deck = conformanceDeck('portrait', ['compare-prose', 'decision']);
    assert.equal(new Set(deck.slides.map((s) => s.body)).size, deck.slides.length, 'no duplicate bodies');
    const shared = deck.slides.filter((s) => s.comps.length > 1);
    assert.ok(shared.length, 'the compare-prose/decision slide should be attributed to both');
    for (const s of shared) assert.deepEqual([...s.comps].sort(), ['compare-prose', 'decision']);
  });

  test('both decks declare the requested @size, and neither opts into splitting', () => {
    // The sweeps measure the UN-SPLIT terminal of the Fit Ladder on purpose; splitting is
    // suppressed with the emulator's `--no-split` flag at the call site, so a split directive
    // creeping into the deck source would silently start measuring something else.
    for (const deck of [clipDeck('story', ['decision']), conformanceDeck('story', ['decision'])]) {
      assert.match(deck.src, /^---\nmarp: true\ntheme: indaco\nsize: story\npaginate: true\n---\n/);
      assert.ok(!/autosplit/i.test(deck.src), 'the sweep deck must not carry a split directive');
    }
  });

  test('SPLIT_ONLY_MARKER recognizes the markers only the splitter emits', () => {
    // Four of kanban's seven tall rules are scoped `.lat-split-native`, which `lib/core/auto-split.js`
    // adds — and these decks render `--no-split`. That is a REACH limit of the instrument, not a
    // gap in the galleries, and the report must not describe it with the same words.
    assert.ok(SPLIT_ONLY_MARKER.test('section.kanban.lat-split-native:where([data-family="tall"]) .kanban-board'));
    assert.ok(SPLIT_ONLY_MARKER.test('section[data-split-role="body"]:where([data-family="tall"])'));
    assert.ok(!SPLIT_ONLY_MARKER.test('section.q-and-a.grid:where([data-family="tall"]) > .cell-stage'));
  });
});

describe('tools: descopeFamily — the wide-baseline selector', () => {
  test('strips the house `:where([data-family=…])` idiom, including a multi-family list', () => {
    // The real selector from inventory's family reflow, and the shape most components use.
    assert.equal(
      descopeFamily('section.inventory.editorial:where([data-family="tall"], [data-family="strip"]) > .cell-stage'),
      'section.inventory.editorial > .cell-stage',
    );
  });

  test('strips a bare inline `[data-family="…"]`', () => {
    assert.equal(descopeFamily('section[data-family="tall"] .inv-pairs'), 'section .inv-pairs');
  });

  test('handles single quotes, no quotes, and the bare attribute', () => {
    for (const s of ['[data-family=\'tall\']', '[data-family=tall]', '[data-family]']) {
      assert.equal(descopeFamily(`section.x${s} > ul`), 'section.x > ul');
    }
  });

  test('leaves a selector with no family predicate untouched', () => {
    // The pass filters to family-scoped rules before calling this, but a caller that
    // stopped filtering must not get a silently mangled selector back.
    assert.equal(descopeFamily('section.stats > .cell-stage > ol'), 'section.stats > .cell-stage > ol');
  });

  test('returns null when the selector was ONLY the family predicate', () => {
    // There is no element to compare against, so the effect test has to be SKIPPED rather
    // than answered with a guess. Returning a bare `> .x` or an empty string would make
    // querySelectorAll throw, or worse, match something unrelated.
    assert.equal(descopeFamily('[data-family="tall"]'), null);
    assert.equal(descopeFamily(':where([data-family="tall"], [data-family="strip"])'), null);
  });

  test('returns null rather than a selector starting with a combinator', () => {
    // `[data-family="tall"] > .cell-stage` de-scopes to `> .cell-stage`, which is not a
    // valid standalone selector — querySelectorAll would throw inside the page and the
    // whole sweep would report nothing for that rule.
    assert.equal(descopeFamily('[data-family="tall"] > .cell-stage'), null);
  });

  test('the house scope is zero-specificity, so removing it cannot change the baseline cascade', () => {
    // This is the assumption the whole effect test rests on: `:where()` contributes no
    // specificity, so the de-scoped selector reads the SAME cascade the component gets at
    // `wide`. If components started scoping with `:is()` (which DOES carry specificity),
    // stripping it could change which rule wins and the baseline would silently measure a
    // different declaration than the one under test.
    //
    // So assert the real stylesheets still use `:where`, over the actual component CSS
    // rather than over a fixture — a doc comment cannot fail, and this must.
    const cssDir = path.join(__dirname, '..', '..', '..', 'lib', 'components');
    const offenders = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) { walk(f); continue; }
        if (!f.endsWith('.css')) continue;
        const css = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        if (/:is\(\s*\[data-family/.test(css)) offenders.push(path.relative(cssDir, f));
      }
    };
    walk(cssDir);
    assert.deepEqual(offenders, [],
      'a component scopes a family rule with `:is([data-family…])`, which carries specificity — '
      + 'descopeFamily strips it and the conformance baseline would then read a different cascade. '
      + 'Use `:where(…)` (zero specificity), or teach descopeFamily to account for it.');

    assert.equal(descopeFamily('a:where([data-family="tall"]) b'), 'a b');
  });
});
