/**
 * Unit: tools/check-ownership.js — build collision / ownership guard.
 *
 * Covers:
 *   1. The pure selector parser is paren-aware (commas inside :is()/[attr]
 *      don't split; @keyframes bodies are not treated as selectors).
 *   2. classTokens / isScopedTo recognize a component's own class and its
 *      `<name>-*` BEM namespace, token-exact (image != imagery).
 *   3. The live tree passes the guard (the CI-gate invariant).
 *   4. Each check fires on a synthetic collision — proving the guard
 *      would actually catch a regression, not just pass vacuously.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  topLevelSelectors,
  splitTopLevel,
  splitCompounds,
  classTokens,
  isScopedTo,
  cssRootModifierTokens,
  transformModifierTokens,
  parseThemeTokens,
  listBasePalettes,
  REQUIRED_THEME_TOKENS,
  checkTagClustering,
  checkRetiredTokenNames,
  RETIRED_TOKEN_NAMES,
  checkTypographyTokens,
  nonCanonicalFsTokens,
  offendingMargins,
  sectionBoxOffences,
  sectionCqOffences,
  rootOnlyAnchorOffences,
  sectionOwnTokenLeaks,
  targetsSectionElement,
  SECTION_BOX_PROPS,
  checkSectionBoxOwnership,
  SANCTIONED_SECTION_BOXES,
  checkSectionCqAnchoring,
  SECTION_CQ_BUDGET,
  SANCTIONED_SECTION_CQ,
  checkMarginDiscipline,
  LAYOUT_MARGIN_BUDGET,
  SANCTIONED_MARGINS,
  checkFinishChromeExclusions,
  parseFinishChromeExclusions,
  absolutelyPositionedSectionChildHooks,
  layerBlocksIn,
  checkCascadeLayers,
  LAYER_BLOCK_BUDGET,
  SANCTIONED_LAYER_BLOCKS,
  CANONICAL_LAYER_ORDER,
  checkHexLiterals,
  LAYOUT_HEX_BUDGET,
  SANCTIONED_HEX,
  checkUsEnglish,
  UK_ENGLISH_FORMS,
  CANONICAL_FS_TOKENS,
  SINGLETON_TAGS,
  checkPreviewHtmlSinks,
  checkSnapshotHtmlSinks,
  SANCTIONED_SNAPSHOT_SINKS,
  SNAPSHOT_INJECT_MARKER,
  SNAPSHOT_WRITE_MARKER,
  SNAPSHOT_KEY_LITERALS,
  referencesSnapshot,
  checkOpenRouterBudget,
  SANCTIONED_OPENROUTER_SPENDERS,
  SANCTIONED_OPENROUTER_WORKFLOWS,
  checkVoiceSampleAssets,
  listSourceFiles,
  SANCTIONED_PREVIEW_BUILDERS,
  PREVIEW_BUILDER_MARKER,
  SANITIZE_CALL,
  checkDensityCoverage,
  SANCTIONED_DENSITY_EXEMPT,
  checkVetrinaBoundary,
  checkAnimaBoundary,
  ANIMA_DIR,
  ANIMA_ADAPTER_DEPS,
  SUONO_SPEC_PATTERNS,
  stripJsComments,
  checkAudioPlaybackBoundary,
  SANCTIONED_LEGACY_AUDIO,
  RAW_AUDIO_PATTERNS,
  checkSanctionedGestures,
  SANCTIONED_GESTURES,
  checkSkillFreshness,
  skillFreshnessAssertions,
  checkCatContrast,
  catResolve,
  catContrast,
  CAT_TEXT_FLOOR,
  CAT_EDGE_FLOOR,
  VETRINA_DIR,
  VETRINA_IMPORT,
  checkAgentModelPinning,
  declaredModel,
  agentCallPins,
  listWorkflowFiles,
  AGENT_MODELS,
  run,
  checkUniversalTableGuard,
  universalTableDenyEntries,
  subjectIsTableElement,
  classAttrOffences,
  SANCTIONED_CLASS_ATTR_READS,
} = require('../../../tools/check-ownership');
const { loadAll } = require('../../../lib/components');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

describe('check-ownership', () => {
  describe('selector parser', () => {
    test('splitTopLevel ignores commas inside :is() and [attr]', () => {
      assert.deepEqual(
        splitTopLevel('section.x:is(ul, ol) > li, section.x[data-a="b,c"]'),
        ['section.x:is(ul, ol) > li', 'section.x[data-a="b,c"]'],
      );
    });

    test('topLevelSelectors collects rule preludes, skips @keyframes bodies', () => {
      const css = `
        section.demo { color: red; }
        @media (min-width: 10px) { section.demo .x { color: blue; } }
        @keyframes spin { 0% { opacity: 0; } 100% { opacity: 1; } }
      `;
      const sels = topLevelSelectors(css);
      assert.ok(sels.includes('section.demo'));
      assert.ok(sels.includes('section.demo .x'));
      // The 0%/100% keyframe steps must NOT appear as selectors.
      assert.ok(!sels.some((s) => s.includes('%')));
    });

    test('comments do not leak into selectors', () => {
      const sels = topLevelSelectors('/* a, b { x } */ section.demo { y: 1; }');
      assert.deepEqual(sels, ['section.demo']);
    });
  });

  describe('scoping helpers', () => {
    test('classTokens extracts every .class token', () => {
      assert.deepEqual(classTokens('section.gantt .gantt-lane:last-child'), ['gantt', 'gantt-lane']);
    });

    test('isScopedTo matches own class and BEM namespace, token-exact', () => {
      assert.equal(isScopedTo('section.gantt .gantt-chart', 'gantt'), true);
      assert.equal(isScopedTo('.gantt-lane', 'gantt'), true);
      assert.equal(isScopedTo('section.imagery', 'image'), false); // not a prefix match
      assert.equal(isScopedTo('section.image-text', 'image'), true); // BEM namespace
      assert.equal(isScopedTo('.below-note', 'compare-prose'), false);
    });
  });

  describe('theme token parsing', () => {
    test('parseThemeTokens picks up custom property declarations only', () => {
      const t = parseThemeTokens(':root { --bg: #fff; color: var(--x); --accent: red; }');
      assert.ok(t.has('--bg'));
      assert.ok(t.has('--accent'));
      assert.ok(!t.has('--x')); // a var() reference is not a declaration
    });

    test('every base palette defines the required core tokens', () => {
      for (const p of listBasePalettes()) {
        for (const tok of REQUIRED_THEME_TOKENS) {
          assert.ok(p.tokens.has(tok), `theme ${p.name} missing ${tok}`);
        }
      }
    });
  });

  describe('post-flip token-tier lint (canonical flip, ADR §11.5)', () => {
    test('RETIRED_TOKEN_NAMES covers the legacy vocabulary (--prefixed)', () => {
      // Every retired name is a real custom-property token — the `--` prefix is a
      // load-bearing invariant (checkRetiredTokenNames matches on it), unlike the
      // old `.size === 57` magic number, which was a pure change-detector that
      // false-failed on any legitimate retirement. Membership below is the gate.
      for (const n of RETIRED_TOKEN_NAMES) {
        assert.ok(n.startsWith('--'), `retired name ${n} must be a --prefixed token`);
      }
      for (const n of ['--c1-light', '--c12-dark', '--c-stroke', '--c-ink-light',
        '--c-warm-light', '--bg-dark', '--dark-bg', '--scale-500']) {
        assert.ok(RETIRED_TOKEN_NAMES.has(n), `expected ${n} to be retired`);
      }
      // the deliberately-kept names must NOT be retired
      for (const keep of ['--bg', '--bg-alt', '--border', '--pass', '--accent']) {
        assert.ok(!RETIRED_TOKEN_NAMES.has(keep), `${keep} must stay`);
      }
    });

    test('the live engine + themes carry NO retired or tier-suffix token names', () => {
      const errors = [];
      checkRetiredTokenNames(errors);
      assert.deepEqual(errors, [], `the purge regressed:\n${errors.join('\n')}`);
    });
  });

  describe('typography token gate (HARD RULE #4)', () => {
    test('CANONICAL_FS_TOKENS is the closed 12-role set + the scale base', () => {
      // HARD RULE #4: this is a CLOSED set, so pin the exact membership to a
      // literal (not just `.size === 13`, which named a count but not the roles).
      // Adding/removing/renaming a role must edit this list — a 14th `--fs-*`
      // token or a dropped role now fails here, not silently.
      assert.deepEqual([...CANONICAL_FS_TOKENS].sort(), [
        '--fs-body', '--fs-body-compact', '--fs-emphasis', '--fs-h1', '--fs-h2',
        '--fs-h3', '--fs-h4', '--fs-h5', '--fs-h6', '--fs-hero', '--fs-message',
        '--fs-meta', '--fs-scale',
      ].sort());
      // t-shirt sizes and ad-hoc names are NOT canonical
      for (const bad of ['--fs-md', '--fs-lg', '--fs-sm', '--fs-xl', '--fs-base']) {
        assert.ok(!CANONICAL_FS_TOKENS.has(bad), `${bad} must not be canonical`);
      }
    });

    test('nonCanonicalFsTokens flags a t-shirt-size DECLARATION, ignores usages/canonical', () => {
      assert.deepEqual(
        nonCanonicalFsTokens(':root { --fs-md: 1rem; --fs-body: 16px; }'),
        ['--fs-md'],
      );
      // a `var(--fs-h<n>)` usage is not a declaration → not flagged
      assert.deepEqual(nonCanonicalFsTokens('h2 { font-size: var(--fs-h2); }'), []);
    });

    test('the live engine + themes declare ONLY canonical --fs-* tokens', () => {
      const errors = [];
      checkTypographyTokens(errors);
      assert.deepEqual(errors, [], `non-canonical --fs-* leaked:\n${errors.join('\n')}`);
    });
  });

  describe('margin discipline gate (HARD RULE #20)', () => {
    test('offendingMargins flags nonzero margins, exempts all-zero resets', () => {
      // nonzero lengths, auto, and negatives are all offending
      assert.deepEqual(offendingMargins('.a { margin: 8px; }'), ['8px']);
      assert.deepEqual(offendingMargins('.a { margin-top: var(--sp-sm); }'), ['var(--sp-sm)']);
      assert.deepEqual(offendingMargins('.a { margin: 0 auto; }'), ['0 auto']);
      assert.deepEqual(offendingMargins('.a { margin-bottom: -4px; }'), ['-4px']);
      // all-zero resets add no space → exempt
      assert.deepEqual(offendingMargins('.a { margin: 0; }'), []);
      assert.deepEqual(offendingMargins('.a { margin: 0 0 0 0; }'), []);
      // logical + !important still caught; the value is normalized
      assert.deepEqual(offendingMargins('.a { margin-inline: 1rem !important; }'), ['1rem']);
      // scroll-margin / margin-trim must NOT match (lookbehind guard)
      assert.deepEqual(offendingMargins('.a { scroll-margin-top: 8px; }'), []);
    });

    test('the live engine CSS has zero unsanctioned margins (HARD RULE #20)', () => {
      const errors = [];
      checkMarginDiscipline(errors);
      assert.deepEqual(errors, [], `unsanctioned margin(s) or a stale sanction:\n${errors.join('\n')}`);
    });

    test('the margin gate is layout-budget-0 + a small enumerated allowlist', () => {
      assert.equal(LAYOUT_MARGIN_BUDGET, 0);
      // The allowlist is intentionally tiny; each entry carries a justification.
      assert.ok(SANCTIONED_MARGINS.length <= 3, 'sanctioned margins should stay a short, justified list');
      for (const s of SANCTIONED_MARGINS) {
        assert.ok(s.file && s.value && s.why, 'every sanction names a file, value, and reason');
      }
    });
  });

  describe('section-box ownership gate', () => {
    // Regression lock for the shipped bug (#1207): `section.premise { height: 100% }`
    // resolved against div.lattice — whose height the preview's fit() sets to the
    // whole FILMSTRIP — so the slide grew to 2517px instead of clipping at 720 and
    // the runtime mis-stamped data-orientation="portrait". The PDF was correct, so
    // golden-diff could never see it.
    test('flags a box dimension on the section element', () => {
      assert.equal(sectionBoxOffences('section.premise { height: 100%; }').length, 1);
      assert.equal(sectionBoxOffences('section { height: 100%; }').length, 1, 'bare section is the worst case, not an edge case');
      assert.deepEqual(
        sectionBoxOffences('section.a { max-width: 50cqi; }')[0].decl,
        'max-width: 50cqi',
      );
    });

    // The first cut of this gate used a regex anchored on `(^|\})` that CONSUMED
    // the brace, so the rule immediately after any match was never inspected —
    // it missed the very bug it was written for whenever another bare-section
    // rule preceded it. That is the most common way the defect is written.
    test('inspects EVERY bare-section rule, including adjacent ones', () => {
      const css = 'section.a:hover { color: red; }\nsection.a { height: 100%; }';
      assert.equal(sectionBoxOffences(css).length, 1, 'the second adjacent rule must still be seen');
      const three = 'section.a { color: red }\nsection.b { width: 1px }\nsection.c { height: 2px }';
      assert.equal(sectionBoxOffences(three).length, 2);
    });

    test('sees inside at-rules and is case-insensitive', () => {
      assert.equal(sectionBoxOffences('@media print { section.a { height: 100%; } }').length, 1);
      assert.equal(
        sectionBoxOffences('@container lattice (min-width: 10px) { section.a { width: 50%; } }').length, 1,
      );
      assert.equal(sectionBoxOffences('SECTION.premise { HEIGHT: 100%; }').length, 1, 'CSS is case-insensitive');
    });

    test('covers logical-property synonyms and aspect-ratio', () => {
      for (const prop of ['block-size', 'inline-size', 'min-block-size', 'max-inline-size']) {
        assert.equal(sectionBoxOffences(`section.a { ${prop}: 100%; }`).length, 1, `${prop} is a synonym of height/width`);
        assert.ok(SECTION_BOX_PROPS.includes(prop));
      }
      assert.equal(sectionBoxOffences('section.a { aspect-ratio: 16/9; }').length, 1);
    });

    test('a descendant, a pseudo-element, and a custom property are NOT the section box', () => {
      assert.deepEqual(sectionBoxOffences('section.a .card { height: 100%; }'), []);
      assert.deepEqual(sectionBoxOffences('section.a > .card { height: 100%; }'), []);
      assert.deepEqual(sectionBoxOffences('section.a::before { height: 4px; }'), []);
      assert.deepEqual(sectionBoxOffences('section.a { --card-height: 100%; }'), []);
      assert.deepEqual(sectionBoxOffences('section.a { transition: width .2s; }'), []);
      assert.deepEqual(sectionBoxOffences('section.a { padding-block: 2px; }'), []);
    });

    // A naive `:is(`/`:not(` → `,` flattening tore these open and read the leading
    // `section.foo` fragment as a whole selector — 4 false positives on the real tree.
    test('selector parsing respects nested parens in :not()/:has()/:is()', () => {
      assert.deepEqual(
        sectionBoxOffences('section.a:not(:has(.below-note)) > :is(ul, ol) + p::before { height: 1px; }'),
        [],
        'the subject is p::before, not the section',
      );
      assert.equal(sectionBoxOffences('section.a:not(:has(.x)) { height: 100%; }').length, 1);
      assert.equal(sectionBoxOffences(':is(section.a, section.b) { height: 100%; }').length, 1);
      assert.equal(sectionBoxOffences('.pane, section.a { height: 100%; }').length, 1, 'section need not be first');
      assert.equal(sectionBoxOffences('section.a .card, section.b { height: 100%; }').length, 1);
    });

    test('targetsSectionElement judges the LAST compound', () => {
      assert.equal(targetsSectionElement('section.a'), true);
      assert.equal(targetsSectionElement('div.lattice > section'), true);
      assert.equal(targetsSectionElement('section.a .card'), false);
      assert.equal(targetsSectionElement('section.a::after'), false);
      assert.equal(targetsSectionElement('.sectionish'), false, 'must not prefix-match a class');
    });

    test('the live tree is clean, and every sanction is justified and live', () => {
      const errors = [];
      checkSectionBoxOwnership(errors);
      assert.deepEqual(errors, [], 'no unsanctioned section-box declaration in the tree');
      // Each entry is the fluid VIEW MODE deliberately unpinning the deck box; it
      // is gated on :root[data-lattice-view="fluid"], which no export ever sets.
      for (const s of SANCTIONED_SECTION_BOXES) {
        assert.ok(s.file && s.decl, 'every sanction names a file and the exact declaration');
      }
    });
  });

  describe('section-cq anchoring gate', () => {
    // Regression lock for the Playground/Studio overflow disagreement: a
    // `container-type: size` section cannot query itself, so a bare `cqi`/`cqh` in
    // one of its OWN declarations resolves against the ICB — the host viewport in a
    // browser preview. The slide's geometry then tracked the preview pane's width
    // (measured: a 17px swing in stage height between a 900px pane and a 355px one),
    // and the two docs-site surfaces disagreed about which slides overflow.
    test('flags a bare cq unit in a declaration that lands on the section', () => {
      assert.equal(sectionCqOffences('section.divider { padding-left: 9.375cqi; }').length, 1);
      assert.equal(sectionCqOffences('section { padding: 6.875cqi 5cqi; }').length, 1, 'bare section is the worst case');
      assert.equal(sectionCqOffences('section.image { grid-template-rows: 44cqh 1fr; }').length, 1, 'the height axis leaks the same way');
      assert.equal(
        sectionCqOffences('section.a:hover { color: red }\nsection.a { gap: 5cqh }').length,
        1,
        'every rule is inspected, adjacent ones included',
      );
    });

    test('every cq unit counts, not just the two with stamps', () => {
      // The first cut matched `cq[ihb]` only, so `cqw`/`cqmin`/`cqmax` — valid units
      // with the identical self-reference leak — walked past a budget of 0.
      for (const unit of ['cqw', 'cqmin', 'cqmax', 'cqb']) {
        assert.equal(sectionCqOffences(`section.a { padding: 5${unit}; }`).length, 1, unit);
      }
      // …including the form that LOOKS anchored: only `--_sec-1cqi`/`--_sec-1cqh` are
      // ever stamped, so `var(--_sec-1cqb, 1cqb)` is inert and still resolves to the ICB.
      assert.equal(sectionCqOffences('section.a { gap: calc(var(--_sec-1cqb, 1cqb) * 5); }').length, 1);
      // A fallback naming the OTHER axis would measure width on the export path and
      // height in preview — the two paths silently disagreeing, which is this whole bug.
      assert.equal(sectionCqOffences('section.a { gap: calc(var(--_sec-1cqh, 1cqi) * 5); }').length, 1);
    });

    test('units are matched case-insensitively, and url()/strings are not lengths', () => {
      // CSS units are case-insensitive; the sibling section-box gate's header records
      // case-sensitivity as a defect it already fixed once, and this one reintroduced it.
      assert.equal(sectionCqOffences('section.a { padding: 5CQI; }').length, 1);
      assert.deepEqual(sectionCqOffences('section.a { background: url("img-5cqi.png"); }'), []);
      assert.deepEqual(sectionCqOffences('section.a::after { content: "5cqi"; }'), []);
    });

    test('an at-rule NESTED INSIDE a section rule still applies to the section', () => {
      // `section.a { @media print { padding: 5cqi } }` — the at-rule prelude was
      // skipped outright, so the declaration inside it was never attributed.
      assert.equal(sectionCqOffences('section.a { color: red; @media print { padding: 5cqi } }').length, 1);
      assert.equal(sectionCqOffences('@media print { section.a { padding: 5cqi } }').length, 1);
    });

    test('a declaration sitting above a NESTED block is still scanned', () => {
      // The prelude parser used to swallow everything before a nested `{`, so with
      // native nesting the enclosing rule's own declarations became invisible.
      assert.equal(sectionCqOffences('section.a { padding: 5cqi; .b { color: red } }').length, 1);
    });

    test('a bare unit that reaches the section through a TOKEN CHAIN is flagged', () => {
      // #1243's own shape, and the one a literal-unit scan cannot see: neither
      // declaration puts a `cq` unit next to a section selector.
      const chain = ':root { --inset: 1.875cqi }\nsection.form { --reserve: calc(var(--inset) + 4px); padding-bottom: var(--reserve) }';
      const leaks = sectionOwnTokenLeaks([{ file: 'x.css', css: chain }]);
      assert.equal(leaks.length, 1);
      assert.equal(leaks[0].token, '--inset');
      // One hop is not special — the closure follows the chain as far as it goes.
      const deep = 'section.a { --c: var(--b); padding: var(--c) }\n:root { --b: var(--a) }\n:root { --a: 5cqi }';
      assert.equal(sectionOwnTokenLeaks([{ file: 'y.css', css: deep }]).length, 1);
      // Anchored at any point in the chain → clean.
      const fixed = ':root, section { --inset: calc(1.875 * var(--_sec-1cqi, 1cqi)) }\nsection.form { padding-bottom: var(--inset) }';
      assert.deepEqual(sectionOwnTokenLeaks([{ file: 'z.css', css: fixed }]), []);
      // A token read ONLY by a descendant stays bare — its `cq*` already resolves
      // against the section, and anchoring it would move it 11% (border vs content box).
      const descendantOnly = ':root { --gap: 5cqi }\nsection.a .card { gap: var(--gap) }';
      assert.deepEqual(sectionOwnTokenLeaks([{ file: 'w.css', css: descendantOnly }]), []);
    });

    test('an anchored token declared only where the stamp is absent is flagged', () => {
      // The mistake this gate's own first version shipped. `var()` substitutes on the
      // element the declaration applies to; at `:root` that is `html`, where
      // `--_sec-1cqi` does not exist — so the fallback is baked in and the token still
      // resolves against the ICB. It reads as anchored and is not.
      assert.equal(rootOnlyAnchorOffences(':root { --a: calc(var(--_sec-1cqi, 1cqi) * 2); }').length, 1);
      // Declared on both, the section copy re-substitutes per slide — the --sp-* idiom.
      assert.deepEqual(rootOnlyAnchorOffences(':root, section { --a: calc(var(--_sec-1cqi, 1cqi) * 2); }'), []);
      // A second, section-subject declaration of the same token elsewhere also works.
      assert.deepEqual(
        rootOnlyAnchorOffences(':root { --a: calc(var(--_sec-1cqi, 1cqi) * 2) } section { --a: calc(var(--_sec-1cqi, 1cqi) * 2) }'),
        [],
      );
    });

    test('the ANCHORED form is clean, and so is anything below the section', () => {
      assert.deepEqual(sectionCqOffences('section.a { padding: calc(var(--_sec-1cqi, 1cqi) * 6.875); }'), []);
      assert.deepEqual(sectionCqOffences('section.a { gap: calc(var(--_sec-1cqh, 1cqh) * 5); }'), []);
      // A descendant's `cq*` resolves against the SECTION (it is a real ancestor
      // container), and so does a pseudo-element's — verified in a browser, not
      // assumed: only the section's own box falls back to the ICB. A descendant must
      // be LEFT bare: its `1cqi` is 1% of the section's CONTENT box (1152 at HD) while
      // the stamp is `offsetWidth/100` (1280), so "anchoring" one moves it 11% and
      // makes preview and export disagree — measured, after doing exactly that.
      assert.deepEqual(sectionCqOffences('section.a .card { width: 10cqi; }'), []);
      assert.deepEqual(sectionCqOffences('section.a::before { width: 10cqi; }'), []);
      // A custom property is not itself applied to anything — its CONSUMER is, and
      // that consumer is what this gate sees.
      assert.deepEqual(sectionCqOffences('section.a { --tone-rail: inset 0.55cqi 0 0 0 red; }'), []);
    });

    test('the tree is clean at budget 0, with an honest allowlist', () => {
      const errors = [];
      checkSectionCqAnchoring(errors);
      assert.deepEqual(errors, [], 'every section-own cq unit in the engine is slide-anchored');
      assert.equal(SECTION_CQ_BUDGET, 0);
      for (const s of SANCTIONED_SECTION_CQ) {
        assert.ok(s.file && s.decl, 'every sanction names a file and the exact declaration');
      }
    });
  });

  describe('cascade-layer gate (HARD RULE #26)', () => {
    test('layerBlocksIn detects named + anonymous @layer blocks and @import layer()', () => {
      // block openers — the rule-3 footgun, named and anonymous
      assert.deepEqual(layerBlocksIn('@layer components { section.x { color: red } }'), ['@layer components {']);
      assert.deepEqual(layerBlocksIn('@layer { section.x { color: red } }'), ['@layer {']);
      // case-insensitive (CSS at-keywords are)
      assert.deepEqual(layerBlocksIn('@LAYER Components { a{} }'), ['@LAYER Components {']);
      // nested inside @media still counts
      assert.deepEqual(layerBlocksIn('@media print { @layer x { a{} } }'), ['@layer x {']);
      // @import layer() / bare layer keyword (string values blanked to "" in the report)
      assert.deepEqual(layerBlocksIn('@import url("x.css") layer(base);'), ['@import url("") layer(base);']);
      assert.deepEqual(layerBlocksIn('@import "x.css" layer;'), ['@import "" layer;']);
    });

    test('layerBlocksIn ignores the harmless forms', () => {
      // the STATEMENT form (reserves order, layers nothing) is not a block
      assert.deepEqual(layerBlocksIn('@layer base, root, scaffold;'), []);
      // a mention inside a comment is not code
      assert.deepEqual(layerBlocksIn('/* do not write @layer components { } here */ .a{}'), []);
      // a file literally named layer.css in an @import url must not false-positive
      assert.deepEqual(layerBlocksIn('@import "layer.css";'), []);
      assert.deepEqual(layerBlocksIn('@import url(mylayer.css);'), []);
      // an @layer block written inside a string value is not code (string stripped)
      assert.deepEqual(layerBlocksIn('.a::before { content: "@layer x { }"; }'), []);
    });

    test('the live engine CSS + built bundle carry zero layer blocks (HARD RULE #26)', () => {
      const errors = [];
      checkCascadeLayers(errors);
      assert.deepEqual(errors, [], `unsanctioned @layer block, order drift, or missing sentinel:\n${errors.join('\n')}`);
    });

    test('the layer gate is budget-0 with an empty-by-design allowlist + a pinned order', () => {
      assert.equal(LAYER_BLOCK_BUDGET, 0);
      // Empty by design: engine CSS layers nothing. Activation adds justified entries.
      assert.deepEqual(SANCTIONED_LAYER_BLOCKS, []);
      for (const s of SANCTIONED_LAYER_BLOCKS) assert.ok(s.file && s.why, 'every sanction names a file and reason');
      assert.equal(CANONICAL_LAYER_ORDER.length, 7);
    });
  });

  describe('frame-chrome exclusion gate (a finish must not drag chrome into flow)', () => {
    test('the live engine CSS excludes every section-level chrome hook, with no stale entry', () => {
      const errors = [];
      checkFinishChromeExclusions(errors);
      assert.deepEqual(errors, [], `unexcluded or stale frame chrome:\n${errors.join('\n')}`);
    });

    test('the derived hook set finds the chrome the fix was written for', () => {
      // Derived from the CSS, not hardcoded, so the CANDIDATE side of the gate cannot go
      // stale as engine CSS moves: the first cut of the exclusion list was hand-built from a
      // probe deck and missed `.lat-split-rail`, and a derived set does not have that failure
      // mode. The assertion is that derivation actually reaches each one.
      //
      // BE PRECISE ABOUT WHAT THIS DOES NOT DO. `checkFinishChromeExclusions` intersects
      // these derived hooks with the hand-maintained SECTION_LEVEL_CHROME set, so genuinely
      // NEW section-level chrome is skipped until someone adds it there — this gate does not
      // catch chrome nobody has enumerated, and an earlier version of this comment claimed it
      // did. What covers the unenumerated case is the DERIVED SWEEP in
      // test/integration/invariants/frame-chrome-out-of-flow.test.js, which toggles `.finish`
      // on a real render and asserts no direct child of any section changes its computed
      // position — no list at all. The division is deliberate: this gate guards the known
      // cheaply on every `build:check`, the sweep finds the unknown at render cost.
      const hooks = absolutelyPositionedSectionChildHooks();
      for (const hook of ['header', 'footer', '.deck-logo', '.overflow-tab', '.illegible-tab', '.lat-split-rail']) {
        assert.ok(hooks.has(hook), `expected engine CSS to absolutely position ${hook}`);
      }
    });

    test('the gate refuses to parse a malformed exclusion list instead of guessing', () => {
      // An unterminated `:where(` used to make `indexOf(')')` return -1, and slice(start, -1)
      // then handed the check the whole rest of the stylesheet as the "exclusion list".
      // A build gate must fail loudly on input it cannot parse, never report on a list it
      // invented. Both malformed shapes are covered: no `)` at all, and a `)` that only
      // appears in a LATER rule (the declaration block opened first). Caught in PR review.
      const RULE = 'section.finish > *:not(.backdrop, :where(';

      const unterminated = `${RULE}header, footer\n/* no closing paren anywhere */\n`;
      assert.match(parseFinishChromeExclusions(unterminated).error || '', /malformed/);
      assert.equal(parseFinishChromeExclusions(unterminated).excluded, undefined,
        'a malformed list must yield NO exclusion set — a half-parsed one is what caused this');

      const blockFirst = `${RULE}header, footer { position: relative; }\nsection.x { color: red; }`;
      assert.match(parseFinishChromeExclusions(blockFirst).error || '', /malformed/);

      // …and the well-formed shape still parses to exactly the tokens between the parens.
      const ok = `${RULE}header, footer, img.deck-logo) { position: relative; }`;
      assert.deepEqual(parseFinishChromeExclusions(ok).excluded, ['header', 'footer', 'img.deck-logo']);

      // A missing rule is its own, separately-worded failure — not "malformed".
      const gone = 'section.finish > * { position: relative; }';
      assert.match(parseFinishChromeExclusions(gone).error || '', /no longer carries/);
    });

    test('the gate refuses to certify a rule that is no longer there', () => {
      // A gate whose subject vanishes must fail, not pass silently — otherwise removing the
      // fix removes its own guard. Asserted by pointing the check at the real file after the
      // sentinel is gone is not possible without writing to lib/, so assert the sentinel the
      // check keys on is present and load-bearing.
      const css = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '..', '..', '..', 'lib', 'base', 'base.finish.css'), 'utf8');
      assert.ok(
        css.includes('section.finish > *:not(.backdrop, :where('),
        'base.finish.css must carry the exclusion rule the gate keys on; if the stacking fix ' +
        'is ever replaced, retire checkFinishChromeExclusions with it',
      );
    });

    test('.overflow-tab is exempt because it defends itself with !important', () => {
      // It is section-level chrome and IS absolutely positioned, but it asserts
      // `position: absolute !important` at its own rule (base.modifiers.css), which is what
      // makes it the one hook that needs no exclusion. If that `!important` is ever removed,
      // the render gate catches it — but record the reason here so the exemption is not a
      // mystery to the next reader.
      const css = require('node:fs').readFileSync(
        require('node:path').join(__dirname, '..', '..', '..', 'lib', 'base', 'base.modifiers.css'), 'utf8');
      // ONE selector now, `section.clip-marked`, because one class answers the whole
      // marker question. It was briefly TWO rules over two conjunction classes, and the
      // population reachable by only one of them had no `position` rule at all: the tab
      // rendered IN FLOW and took 50px out of the very cell it was reporting on —
      // precisely the defect this exemption records as already fixed once. The PROPERTY
      // this test guards is unchanged.
      assert.match(css, /section\.clip-marked > \.overflow-tab[\s\S]{0,900}?position: absolute !important;/,
        'the tab must defend its own position, or it lands in flow and takes height from the cell');
    });
  });

  describe('hex-literal gate (HARD RULE #3)', () => {
    test('the live engine layout CSS has zero unsanctioned hex literals', () => {
      const errors = [];
      checkHexLiterals(errors);
      assert.deepEqual(errors, [], `unsanctioned hex literal(s) or a stale sanction:\n${errors.join('\n')}`);
    });

    test('the hex gate is layout-budget-0 + a small justified allowlist', () => {
      assert.equal(LAYOUT_HEX_BUDGET, 0);
      assert.ok(SANCTIONED_HEX.length <= 6, 'sanctioned hex should stay a short, justified list');
      for (const s of SANCTIONED_HEX) {
        assert.ok(s.file && s.hex && s.count >= 1 && s.why, 'every sanction names a file, hex, count, and reason');
        assert.match(s.hex, /^#[0-9a-fA-F]{3,8}$/, 'sanction hex is a real literal');
      }
    });
  });

  describe('US-English gate (HARD RULE #21)', () => {
    const re = new RegExp(`\\b(${UK_ENGLISH_FORMS.join('|')})\\b`, 'gi');

    test('flags unambiguous British forms', () => {
      for (const w of ['colour', 'Behaviour', 'centred', 'normalise', 'grey', 'catalogue', 'defence', 'whilst', 'labelled']) {
        assert.ok(re.test(w), `expected "${w}" to be flagged`);
        re.lastIndex = 0;
      }
    });

    test('does NOT flag US spellings or words US keeps in the -ise/-re/-ue form', () => {
      // word boundaries + curated list: these must stay clean (false positives are the risk)
      for (const w of ['color', 'center', 'organize', 'gray', 'license', 'analysis', 'exercise', 'comprise', 'advise', 'surprise', 'dialogue', 'epicentre', 'rise', 'premise']) {
        assert.ok(!re.test(w), `did NOT expect "${w}" to be flagged`);
        re.lastIndex = 0;
      }
    });

    test('the live repo stays within the US-English budget', () => {
      const errors = [];
      checkUsEnglish(errors);
      assert.deepEqual(errors, [], `British spellings exceeded US_ENGLISH_BUDGET:\n${errors.join('\n')}`);
    });
  });

  describe('variant-declaration detection', () => {
    test('splitCompounds splits on combinators, paren-aware', () => {
      assert.deepEqual(
        splitCompounds('section.x.mod > ul:not(:has(.y)) li'),
        ['section.x.mod', 'ul:not(:has(.y))', 'li'],
      );
    });

    test('cssRootModifierTokens finds root modifiers, skips BEM/universal/nested', () => {
      const css = `
        section.radar.target { color: red; }
        section.radar.dark { color: blue; }           /* universal — skip */
        section.radar .radar-poly { fill: none; }      /* BEM descendant — skip */
        section.radar:not(:has(.radar-figure)) { x: 1; } /* presence check — skip */
        section.radar.minimal .radar-grid { opacity: .3; }
      `;
      assert.deepEqual(
        [...cssRootModifierTokens(css, 'radar')].sort(),
        ['minimal', 'target'],
      );
    });

    test('transformModifierTokens reads the dispatch array, drops universals', () => {
      const src = `
        const RADAR_MODIFIERS = ['target', 'delta', 'dark'];
        function buildRadar() {}
      `;
      assert.deepEqual(
        [...transformModifierTokens(src)].sort(),
        ['delta', 'target'], // 'dark' is universal, filtered out
      );
    });
  });

  describe('tag clustering', () => {
    test('flags an un-allow-listed singleton tag', () => {
      const errors = [];
      // 'overview' appears once here and is not in SINGLETON_TAGS.
      checkTagClustering([{ name: 'a', tags: ['overview', 'metric'] }, { name: 'b', tags: ['metric'] }], errors);
      assert.ok(errors.some((e) => /exactly one component/.test(e) && /overview/.test(e)), errors.join('\n'));
    });

    test('does not flag a singleton that is allow-listed', () => {
      const sole = [...SINGLETON_TAGS][0];
      const errors = [];
      // Pair every other used tag so only the allow-listed sole-use remains.
      checkTagClustering([{ name: 'a', tags: [sole, 'metric'] }, { name: 'b', tags: ['metric'] }], errors);
      assert.ok(!errors.some((e) => new RegExp(`exactly one[^]*\\b${sole}\\b`).test(e)), errors.join('\n'));
    });

    test('flags dead vocabulary (a term no component uses)', () => {
      const errors = [];
      checkTagClustering([{ name: 'a', tags: ['metric', 'percentage'] }, { name: 'b', tags: ['metric', 'percentage'] }], errors);
      assert.ok(errors.some((e) => /used by no component/.test(e)), errors.join('\n'));
    });

    test('the live tree clusters cleanly', () => {
      const { errors } = run();
      assert.ok(!errors.some((e) => /tag/.test(e)), errors.filter((e) => /tag/.test(e)).join('\n'));
    });
  });

  // ── HARD-RULE-adjacent: the universal table treatment's deny guard ──────────
  // base.elements.css § UNIVERSAL TABLE gives every slide a default <table>
  // treatment; the deny guard withholds it from components that style their own.
  // Fixture trees, so every assertion drives the REAL gate and reads its ACTUAL
  // errors — a test that re-implements the gate stays green when the gate is
  // deleted (the #1187 lesson, see the model-pinning block below).
  describe('universal-table deny guard (base.elements.css § UNIVERSAL TABLE)', () => {
    // One entry per :not(); a dotted entry ('math.derivation') is ONE compound
    // entry, not two — that distinction is exactly what the gate must respect.
    const GUARD = (denies) =>
      `section:where(${denies.map((d) => `:not(.${d})`).join('')}) > table td { color:red; }`;

    const withFixture = (guardCss, componentCss, assertions) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-utable-'));
      try {
        const lib = path.join(dir, 'lib');
        fs.mkdirSync(lib, { recursive: true });
        const guardPath = path.join(lib, 'base.elements.css');
        fs.writeFileSync(guardPath, guardCss);
        for (const [rel, body] of Object.entries(componentCss)) {
          const abs = path.join(lib, rel);
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, body);
        }
        const errors = [];
        checkUniversalTableGuard(
          [{ name: 'compare-table' }, { name: 'math' }, { name: 'kpi' }],
          errors,
          { libDir: lib, guardCss: guardPath },
        );
        assertions(errors);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    };

    test('the live tree raises no universal-table violations', () => {
      const errors = [];
      checkUniversalTableGuard(loadAll(), errors);
      assert.deepEqual(errors, [], errors.join('\n'));
    });

    test('run() actually invokes the gate — it is wired into build:check', () => {
      // Deleting `checkUniversalTableGuard(manifests, errors)` from run() is
      // invisible to any test that only calls the gate directly.
      const real = fs.readFileSync;
      let errors;
      try {
        fs.readFileSync = (p, ...rest) => (String(p).endsWith(path.join('lib', 'base', 'base.elements.css'))
          ? 'section > table td { color:red; }' // a guard with NO :not() entries
          : real(p, ...rest));
        ({ errors } = run());
      } finally {
        fs.readFileSync = real;
      }
      assert.ok(
        errors.some((e) => e.includes('declares no universal-table deny guard')),
        `run() did not surface the universal-table gate:\n${errors.join('\n')}`,
      );
    });

    test('a component styling a table with no deny entry fails', () => {
      withFixture(GUARD(['math.derivation']), {
        'c/compare-table.styles.css': 'section.compare-table td { padding:1px; }',
      }, (errors) => {
        const hit = errors.filter((e) => e.includes("'compare-table' styles a table element"));
        assert.equal(hit.length, 1, errors.join('\n'));
        assert.match(hit[0], /Add ':not\(\.compare-table\)'/);
      });
    });

    test('an OVER-BROAD entry fails, naming the real granularity', () => {
      // ':not(.math)' when only '.math.derivation' claims a table would withhold
      // the default from a bare `_class: math` slide — the defect the block closes.
      withFixture(GUARD(['math']), {
        'c/math.styles.css': 'section.math.derivation td { padding:1px; }',
      }, (errors) => {
        const hit = errors.filter((e) => e.includes('over-broad universal-table deny entry'));
        assert.equal(hit.length, 1, errors.join('\n'));
        assert.match(hit[0], /:not\(\.derivation\.math\)/);
      });
    });

    test('a variant-scoped entry matching a variant-scoped claim passes', () => {
      withFixture(GUARD(['math.derivation']), {
        'c/math.styles.css': 'section.math.derivation td { padding:1px; }',
      }, (errors) => assert.deepEqual(errors, [], errors.join('\n')));
    });

    test('a broader claim is covered by a narrower entry (modifier stacking)', () => {
      // `section.sketch.compare-table table` must NOT demand its own entry —
      // ':not(.compare-table)' already denies every slide carrying that class.
      withFixture(GUARD(['compare-table']), {
        'c/compare-table.styles.css': 'section.compare-table table { width:100%; }',
        'base.sketch.css': 'section.sketch.compare-table table { filter:none; }',
      }, (errors) => assert.deepEqual(errors, [], errors.join('\n')));
    });

    test('a stale entry fails', () => {
      withFixture(GUARD(['compare-table', 'kpi']), {
        'c/compare-table.styles.css': 'section.compare-table td { padding:1px; }',
      }, (errors) => {
        const hit = errors.filter((e) => e.includes('stale universal-table deny entry'));
        assert.equal(hit.length, 1, errors.join('\n'));
        assert.match(hit[0], /:not\(\.kpi\)/);
      });
    });

    test('a rule that drops ONE entry fails — the guard is per-rule, not unioned', () => {
      // The block repeats the guard on every rule. A union would call
      // '.math.derivation' guarded while the `td` rule alone had lost it — which is
      // exactly the edit that doubles math.derivation's cell borders.
      const guard =
        'section:where(:not(.compare-table):not(.math.derivation)) > table thead th { color:red; }\n' +
        'section:where(:not(.compare-table)) > table td { color:red; }\n';
      withFixture(guard, {
        'c/compare-table.styles.css': 'section.compare-table td { padding:1px; }',
        'c/math.styles.css': 'section.math.derivation td { padding:1px; }',
      }, (errors) => {
        const hit = errors.filter((e) => e.includes('does not carry the full deny guard'));
        assert.equal(hit.length, 1, errors.join('\n'));
        assert.match(hit[0], /:not\(\.derivation\.math\)/);
        assert.match(hit[0], /> table td/);
      });
    });

    test('an UNGUARDED new table rule in the guard file itself fails', () => {
      const guard =
        'section:where(:not(.compare-table)) > table td { color:red; }\n' +
        'section > table caption { color:red; }\n'; // no guard at all
      withFixture(guard, {
        'c/compare-table.styles.css': 'section.compare-table td { padding:1px; }',
      }, (errors) => {
        assert.ok(
          errors.some((e) => e.includes('does not carry the full deny guard') && e.includes('caption')),
          errors.join('\n'),
        );
      });
    });

    test("an `:is(td, th)` subject is a claim — base.focus's resident idiom", () => {
      withFixture(GUARD(['compare-table']), {
        'c/compare-table.styles.css': 'section.compare-table td { padding:1px; }',
        'c/kpi.styles.css': 'section.kpi > .cell-stage > :is(td, th) { border-bottom:1px solid red; }',
      }, (errors) => {
        assert.ok(
          errors.some((e) => e.includes("'kpi' styles a table element")),
          errors.join('\n'),
        );
      });
    });

    test('a non-subject table mention is not a claim', () => {
      // base.modifiers' below-note promotion styles the <p>, not the table.
      withFixture(GUARD(['compare-table']), {
        'c/compare-table.styles.css': 'section.compare-table td { padding:1px; }',
        'base.modifiers.css': 'section.kpi > :is(ul, ol, table) + p { color:red; }',
      }, (errors) => assert.deepEqual(errors, [], errors.join('\n')));
    });

    test('base SUPPORT rules written with :is() are not claims', () => {
      // The dark-bookend ink rebind rebinds colour for the UNIVERSAL treatment;
      // it must not read as those components owning <table>.
      withFixture(GUARD(['compare-table']), {
        'c/compare-table.styles.css': 'section.compare-table td { padding:1px; }',
        'base.modifiers.css': 'section:is(.kpi, .math) > table td { color:white; }',
      }, (errors) => assert.deepEqual(errors, [], errors.join('\n')));
    });

    test('subjectIsTableElement keys on the SUBJECT, not any mention', () => {
      assert.equal(subjectIsTableElement('section.x td'), true);
      assert.equal(subjectIsTableElement('section.x tbody tr:nth-child(odd)'), true);
      assert.equal(subjectIsTableElement('section.x > :is(ul, table) + p'), false);
      assert.equal(subjectIsTableElement('section.x tr.lat-focus > :is(td, th)'), true);
      assert.equal(subjectIsTableElement('section.x table::after'), false);
      assert.equal(subjectIsTableElement('section.x td:not(:first-child) > *'), false);
    });

    test('deny entries are read back out of the real stylesheet, PER rule', () => {
      const perRule = universalTableDenyEntries(
        'section:where(:not(.a):not(.b.c)) > table td { color:red; }\n' +
        'section:where(:not(.a)) > table thead th { color:red; }\n' +
        'section:where(:not(.ignored)) > p { color:red; }\n', // not a table subject
      );
      assert.equal(perRule.length, 2, 'only table-subject rules are read');
      assert.deepEqual([...perRule[0].entries].sort(), ['a', 'b.c']);
      assert.deepEqual([...perRule[1].entries].sort(), ['a'], 'the short rule is reported as-is');
    });
  });

  describe('guard runner', () => {
    test('the live tree has no accidental collisions', () => {
      const { errors } = run();
      assert.deepEqual(errors, [], errors.join('\n'));
    });

    test('reports sane counts', () => {
      const { counts } = run();
      assert.ok(counts.transformers > 0);
      assert.ok(counts.components > 0);
      assert.ok(counts.palettes > 0);
    });
  });

  // The design/skills/*.md files restate countable canon; this gate keeps them fresh.
  describe('skill-freshness gate (design/skills/ sanctioned duplication)', () => {
    const ROOT = path.join(__dirname, '..', '..', '..');

    test('the live tree raises no skill-freshness violations', () => {
      const errors = [];
      checkSkillFreshness(errors);
      assert.deepEqual(errors, [], errors.join('\n'));
    });

    test('every assertion marker actually resolves in its skill, with a matching count', () => {
      for (const a of skillFreshnessAssertions()) {
        const src = fs.readFileSync(path.join(ROOT, 'design', 'skills', a.file), 'utf8');
        const m = src.match(a.marker);
        assert.ok(m, `${a.file}: marker ${a.marker} for ${a.what} must resolve`);
        assert.equal(Number(m[1]), a.actual, `${a.file}: ${a.what} prose (${m[1]}) must equal source (${a.actual})`);
      }
    });

    test('the gate bites: a drifted count is flagged', () => {
      // Re-derive the gate's verdict for a synthetic drift without touching disk:
      // if any real count moved by one, the assertion would fail.
      const drift = skillFreshnessAssertions().map((a) => ({ ...a, claimed: a.actual + 1 }));
      for (const a of drift) {
        assert.notEqual(a.claimed, a.actual, `${a.what}: a +1 drift must not equal the source`);
      }
    });

    test('every skill-freshness source count resolves to a real number (no fail-closed null)', () => {
      // The two source-derived counts (contract-token, chart-cat slot) parse a file
      // and can return null on a structural change; the live tree must never be null.
      for (const a of skillFreshnessAssertions()) {
        assert.notEqual(a.actual, null, `${a.what}: source count must resolve (fail-closed null means the reader broke)`);
        assert.equal(typeof a.actual, 'number', `${a.what}: source count must be a number`);
      }
    });

    const CATEGORICAL_CONCEPT_MARKERS = ['--cat-N-texture', 'three-layer', 'checkCatContrast'];

    test('theme.md teaches the current categorical concept markers', () => {
      const src = fs.readFileSync(path.join(ROOT, 'design', 'skills', 'theme.md'), 'utf8');
      for (const needle of CATEGORICAL_CONCEPT_MARKERS) {
        assert.ok(src.includes(needle), `theme.md must teach the categorical concept "${needle}"`);
      }
    });

    test('the gate bites: dropping a categorical concept marker is flagged', () => {
      // Mirror the gate's substring check in-memory (house pattern — no FS mutation):
      // removing any one marker must make the concept-drift detector see it missing.
      const src = fs.readFileSync(path.join(ROOT, 'design', 'skills', 'theme.md'), 'utf8');
      for (const needle of CATEGORICAL_CONCEPT_MARKERS) {
        const stripped = src.split(needle).join('REDACTED');
        const dropped = CATEGORICAL_CONCEPT_MARKERS.filter((c) => !stripped.includes(c));
        assert.ok(dropped.includes(needle), `removing "${needle}" from theme.md must be detected as a dropped concept`);
      }
    });

    // Both CSS-authoring skills (component + chart) must stay unlayered — a chart is a
    // component and every shipped chart CSS is unlayered (engineering/cascade.md).
    const CSS_AUTHORING_SKILLS = ['component.md', 'chart-component.md'];

    test('the CSS-authoring skills carry no `@layer components {` wrapper and teach "unlayered"', () => {
      for (const skill of CSS_AUTHORING_SKILLS) {
        const src = fs.readFileSync(path.join(ROOT, 'design', 'skills', skill), 'utf8');
        assert.ok(!/@layer\s+components\s*\{/.test(src), `${skill} must not show an \`@layer components {\` wrapper`);
        assert.ok(/unlayered/i.test(src), `${skill} must teach the unlayered CSS convention`);
      }
    });

    test('the gate bites: an `@layer … {` wrapper in a CSS-authoring skill is flagged', () => {
      // Drive the REAL gate, not just its regex: temporarily poison chart-component.md
      // on disk, confirm checkSkillFreshness populates `errors` for it, then restore in
      // a finally. checkSkillFreshness reads SKILLS_DIR directly and exports no pure
      // predicate, so a faithful "the gate bites" test must exercise the file loop.
      const target = path.join(ROOT, 'design', 'skills', 'chart-component.md');
      const original = fs.readFileSync(target, 'utf8');
      for (const wrapper of ['@layer components { section.x { color: red } }', '@layer { section.x { color: red } }']) {
        try {
          fs.writeFileSync(target, `${original}\n\n\`\`\`css\n${wrapper}\n\`\`\`\n`);
          const errors = [];
          checkSkillFreshness(errors);
          assert.ok(
            errors.some((e) => e.includes('chart-component.md') && /@layer/.test(e)),
            `poisoning chart-component.md with "${wrapper}" must make checkSkillFreshness flag it; got:\n${errors.join('\n')}`,
          );
        } finally {
          fs.writeFileSync(target, original);
        }
      }
      // The restored tree is clean again (guards against a botched restore).
      const errors = [];
      checkSkillFreshness(errors);
      assert.deepEqual(errors, [], errors.join('\n'));
    });
  });

  // HARD RULE #22 — every docs-site preview-frame builder sanitizes its slide HTML.
  describe('preview-frame sanitization gate (HARD RULE #22, #616)', () => {
    const ROOT = path.join(__dirname, '..', '..', '..');

    test('the live tree raises no #22 violations', () => {
      const errors = [];
      checkPreviewHtmlSinks(errors);
      assert.deepEqual(errors, [], errors.join('\n'));
    });

    test('the allowlist is truthful: every sanctioned builder exists, builds a frame, and sanitizes', () => {
      for (const s of SANCTIONED_PREVIEW_BUILDERS) {
        const src = fs.readFileSync(path.join(ROOT, s.file), 'utf8');
        assert.ok(PREVIEW_BUILDER_MARKER.test(src), `${s.file} should carry the runtime-script marker`);
        assert.ok(SANITIZE_CALL.test(src), `${s.file} must call sanitizeSlideHtml`);
      }
    });

    test('no preview-frame builder in docs/src is missing from the allowlist', () => {
      const listed = new Set(SANCTIONED_PREVIEW_BUILDERS.map((s) => s.file));
      const builders = listSourceFiles(path.join(ROOT, 'docs', 'src'))
        .filter((f) => !/\.test\.[tj]s$/.test(f))
        .filter((f) => PREVIEW_BUILDER_MARKER.test(fs.readFileSync(f, 'utf8')))
        .map((f) => path.relative(ROOT, f));
      for (const b of builders) {
        assert.ok(listed.has(b), `${b} builds a preview frame but is not in SANCTIONED_PREVIEW_BUILDERS`);
      }
    });

    test('the gate bites: a builder that drops sanitizeSlideHtml is flagged', () => {
      // Simulate the regression in-memory by re-deriving the gate's verdict for a
      // builder whose source no longer calls the sanitizer (no FS mutation).
      const builder = SANCTIONED_PREVIEW_BUILDERS[0];
      const src = fs.readFileSync(path.join(ROOT, builder.file), 'utf8');
      const stripped = src.replace(new RegExp(SANITIZE_CALL.source, 'g'), 'noop(');
      assert.ok(PREVIEW_BUILDER_MARKER.test(stripped), 'still a builder');
      assert.ok(!SANITIZE_CALL.test(stripped), 'sanitize call gone → gate would flag it');
    });
  });

  describe('agent model-pinning gate (HARD RULE #27)', () => {
    const ROOT = path.join(__dirname, '..', '..', '..');
    const AGENTS_DIR = path.join(ROOT, '.claude', 'agents');
    const WORKFLOWS_DIR = path.join(ROOT, '.claude', 'workflows');

    // Fixture trees, so every assertion drives the REAL checkAgentModelPinning and
    // reads its ACTUAL errors. The previous version of these tests asserted against a
    // re-implementation of the gate's logic, which meant deleting the gate's call site
    // in run() left the whole suite green — found by the maker-checker pass on #1187.
    // Anything below that stops failing when a branch of the gate is removed is a bug
    // in the test, not a passing gate.
    const withFixture = (files, assertions) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-hr27-'));
      try {
        for (const [rel, body] of Object.entries(files)) {
          const abs = path.join(dir, rel);
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, body);
        }
        const errors = [];
        checkAgentModelPinning(errors, {
          agents: path.join(dir, 'agents'),
          workflows: path.join(dir, 'workflows'),
        });
        assertions(errors);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    };
    const AGENT = (model) => `---\nname: a\ndescription: d\nmodel: ${model}\n---\nbody\n`;
    const only = (errors, needle) => errors.filter((e) => e.includes(needle));

    test('the live tree raises no #27 violations', () => {
      const errors = [];
      checkAgentModelPinning(errors);
      assert.deepEqual(errors, [], errors.join('\n'));
    });

    test('run() actually invokes the gate — it is wired into build:check', () => {
      // Deleting `checkAgentModelPinning(errors)` from run() is invisible to any test
      // that only calls the gate directly. Drive run() with the roster hidden and
      // assert its #27 error surfaces.
      const realExists = fs.existsSync;
      let errors;
      try {
        fs.existsSync = (p) => (String(p).endsWith(path.join('.claude', 'agents')) ? false : realExists(p));
        ({ errors } = run());
      } finally {
        fs.existsSync = realExists;
      }
      assert.ok(
        errors.some((e) => e.includes('.claude/agents/ does not exist')),
        'run() must surface the HARD RULE #27 gate; if this fails, the gate is not wired in',
      );
    });

    test('a clean fixture roster + workflow raises nothing', () => {
      withFixture(
        {
          'agents/scout.md': AGENT('opus'),
          'workflows/w.js': "agent(p, { label: 'a', model: 'opus' })\n",
        },
        (errors) => assert.deepEqual(errors, [], errors.join('\n')),
      );
    });

    test('roster: missing, empty, no-frontmatter, no model, and bogus model all error', () => {
      withFixture({ 'workflows/.keep': '' }, (e) =>
        assert.equal(only(e, 'does not exist').length, 1, 'missing roster'));
      withFixture({ 'agents/.keep': '', 'workflows/.keep': '' }, (e) =>
        assert.equal(only(e, 'no agent definitions').length, 1, 'empty roster'));
      withFixture({ 'agents/a.md': 'no frontmatter here\n' }, (e) =>
        assert.equal(only(e, 'has no YAML frontmatter').length, 1, 'missing frontmatter'));
      withFixture({ 'agents/a.md': '---\nname: a\n---\nbody\n' }, (e) =>
        assert.equal(only(e, 'declares no `model:`').length, 1, 'no model field'));
      withFixture({ 'agents/a.md': AGENT('opus-5') }, (e) =>
        assert.equal(only(e, 'This repo runs every agent on `opus`').length, 1, 'bogus model name'));
    });

    test('roster: valid YAML shapes are accepted, and a README is not an agent', () => {
      for (const form of ["'opus'", '"opus"', 'opus   ', 'opus # the only tier']) {
        withFixture({ 'agents/a.md': AGENT(form) }, (e) =>
          assert.deepEqual(e, [], `model: ${form} must be accepted, got: ${e.join('; ')}`));
      }
      withFixture({ 'agents/a.md': AGENT('opus').replace(/\n/g, '\r\n') }, (e) =>
        assert.deepEqual(e, [], 'CRLF frontmatter is still frontmatter'));
      withFixture({ 'agents/README.md': '# The roster\n', 'agents/a.md': AGENT('opus') }, (e) =>
        assert.deepEqual(e, [], 'README documents the roster; it is not an agent definition'));
    });

    test('workflows: an unpinned stage is flagged, and named by its label', () => {
      withFixture(
        { 'agents/a.md': AGENT('opus'), 'workflows/w.js': "agent(p, { label: 'fact-check' })\n" },
        (e) => {
          assert.equal(e.length, 1, e.join('; '));
          assert.match(e[0], /`fact-check` passes no `model:`/);
        },
      );
    });

    test('workflows: .mjs, .cjs and subdirectories are all scanned', () => {
      for (const rel of ['workflows/w.mjs', 'workflows/w.cjs', 'workflows/sub/w.js']) {
        withFixture({ 'agents/a.md': AGENT('opus'), [rel]: "agent(p, { label: 'x' })\n" }, (e) =>
          assert.equal(only(e, 'passes no `model:`').length, 1, `${rel} must be scanned`));
      }
    });

    test('workflows: an unparseable file is reported, never treated as compliant', () => {
      withFixture({ 'agents/a.md': AGENT('opus'), 'workflows/w.js': 'const = (((\n' }, (e) =>
        assert.equal(only(e, 'does not parse').length, 1, 'a broken workflow must fail loudly'));
    });

    test('workflows: each way of failing to pin gets its OWN diagnosis', () => {
      // Collapsing these into one "passes no model:" message sends someone hunting for a
      // missing field when the value is the real problem — found in review on #1187.
      const cases = [
        ["agent(p, { label: 'a' })", 'passes no `model:`'],
        ["agent(p, { label: 'a', model: 'opus-5' })", "pins `model: 'opus-5'` (HARD RULE #27)"],
        ["agent(p, { label: 'a', model: MODEL })", 'computes its `model:` rather than naming one'],
        ['agent(p, buildOpts())', 'cannot resolve statically'],
      ];
      for (const [body, expected] of cases) {
        withFixture({ 'agents/a.md': AGENT('opus'), 'workflows/w.js': `${body}\n` }, (e) => {
          assert.equal(e.length, 1, `${body} → ${e.join('; ')}`);
          assert.ok(e[0].includes(expected), `${body}\n  expected: ${expected}\n  got: ${e[0]}`);
        });
      }
    });

    // The AST is what makes these sound. Three successive TEXT-based versions of this
    // check accepted every "must be flagged" case below and rejected every "must be
    // accepted" one — see the maker-checker findings on #1187.
    test('a pin the runtime would OVERRIDE does not count as pinned', () => {
      // Object-literal semantics are last-wins, and a spread after the key replaces it.
      // Reading the FIRST `model` (or ignoring spreads) certified these as pinned while
      // they ran on a cheaper model — a false PASS through the only machine enforcement
      // #27 has. `.claude/` is lint-excluded, so Biome's noDuplicateObjectKeys never
      // sees the duplicate either. Found by the red-team pass on #1240.
      const overridden = {
        'duplicate key, cheaper one last': "agent(p, { label: 'a', model: 'opus', model: 'sonnet' })",
        'spread of a module const after the pin': "const OVERRIDE = { model: 'sonnet' }\nagent(p, { label: 'a', model: 'opus', ...OVERRIDE })",
        'inline spread after the pin': "agent(p, { label: 'a', model: 'opus', ...{ model: 'sonnet' } })",
        'conditional spread after the pin': "agent(p, { label: 'a', model: 'opus', ...(cheap ? { model: 'haiku' } : {}) })",
      };
      for (const [name, body] of Object.entries(overridden)) {
        const { error, calls } = agentCallPins(body);
        assert.equal(error, null, `${name}: fixture should parse`);
        assert.ok(calls.length > 0 && calls.every((c) => !c.pinned), `${name}: must NOT count as pinned`);
      }
      // …and the gate must actually SAY so, with its own diagnosis.
      withFixture(
        { 'agents/a.md': AGENT('opus'), 'workflows/w.js': "agent(p, { label: 'a', model: 'opus', ...OVERRIDE })\n" },
        (e) => assert.equal(only(e, 'spreads into its options AFTER').length, 1, e.join('; ')),
      );
      withFixture(
        { 'agents/a.md': AGENT('opus'), 'workflows/w.js': "agent(p, { label: 'a', model: 'opus', model: 'sonnet' })\n" },
        (e) => assert.equal(only(e, "pins `model: 'sonnet'`").length, 1, e.join('; ')),
      );
      // A spread BEFORE the pin is harmless — the later literal wins at runtime too.
      const before = agentCallPins("agent(p, { ...DEFAULTS, label: 'a', model: 'opus' })");
      assert.ok(before.calls.every((c) => c.pinned), 'a spread before the pin must still be accepted');
    });

    test('roster scanning is recursive and survives a directory named *.md', () => {
      // Both probed by the red-team pass on #1240. A subdirectory agent was invisible
      // (while the workflow half already recursed), and a directory named `x.md` threw
      // an uncaught EISDIR that killed build:check with a stack trace, not a gate error.
      withFixture({ 'agents/sub/deep.md': AGENT('sonnet') }, (e) =>
        assert.equal(only(e, 'This repo runs every agent on `opus`').length, 1, 'a nested agent must be scanned'));
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-hr27-eisdir-'));
      try {
        fs.mkdirSync(path.join(dir, 'agents', 'trap.md'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'agents', 'real.md'), AGENT('opus'));
        const errors = [];
        assert.doesNotThrow(
          () => checkAgentModelPinning(errors, { agents: path.join(dir, 'agents'), workflows: path.join(dir, 'workflows') }),
          'a directory named *.md must not crash the gate',
        );
        assert.deepEqual(errors, [], errors.join('\n'));
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    test('a model: that only LOOKS like a pin cannot satisfy the gate', () => {
      const bypasses = {
        'pin quoted inside the prompt text': "agent(`Return { label: 'x', model: 'opus' }`, { label: 'a' })",
        'pin in a nested object': "agent(p, { label: 'a', defaults: { label: 'b', model: 'opus' } })",
        'pin belonging to an inner call': "agent(await agent(q, { label: 'in', model: 'opus' }), { label: 'out' })",
        'call through an alias': "const spawn = agent; spawn(p, { label: 'a' })",
        'optional call': "agent?.(p, { label: 'a' })",
        'meta.phases entry, not an options object': "const meta = { phases: [{ title: 'T', model: 'opus' }] }\nagent(p, { label: 'a' })",
      };
      for (const [name, body] of Object.entries(bypasses)) {
        const { error, calls } = agentCallPins(body);
        assert.equal(error, null, `${name}: fixture should parse`);
        assert.ok(calls.some((c) => !c.pinned), `${name}: must NOT count as pinned`);
      }
    });

    test('valid pinned calls are accepted, whatever the surrounding syntax', () => {
      const valid = {
        'inline nested object in options': "agent(p, { label: 'a', schema: { type: 'object' }, model: 'opus' })",
        'callback in options': "agent(p, { label: 'a', model: 'opus', onDone: () => { log() } })",
        'hoisted module-level options': "const o = { label: 'a', model: 'opus' }\nagent(p, o)",
        'pinned but unlabeled': "agent(p, { model: 'opus' })",
        'regex containing a paren': "agent(p.replace(/\\)/g, ''), { label: 'a', model: 'opus' })",
        'a URL in the prompt': "agent('see https://platform.claude.com/docs', { label: 'a', model: 'opus' })",
        'agent( written inside a string': "agent(`call agent(x) please`, { label: 'a', model: 'opus' })",
        'a comment mentioning agent(': "// call agent(x) here\nagent(p, { label: 'a', model: 'opus' })",
      };
      for (const [name, body] of Object.entries(valid)) {
        const { error, calls } = agentCallPins(body);
        assert.equal(error, null, `${name}: fixture should parse`);
        assert.ok(calls.length > 0 && calls.every((c) => c.pinned), `${name}: must be accepted, got ${JSON.stringify(calls)}`);
      }
    });

    test('ONE tier exists — every model but opus is rejected by name', () => {
      // Model tiering was tried and retired (2026-07-28). Re-widening this list is the
      // exact regression the gate now exists to prevent, so it is asserted directly.
      assert.deepEqual([...AGENT_MODELS], ['opus'], 'the tier list is closed at opus');
      for (const retired of ['sonnet', 'haiku', 'fable']) {
        withFixture({ 'agents/a.md': AGENT(retired) }, (e) =>
          assert.equal(only(e, 'This repo runs every agent on `opus`').length, 1, `roster must reject ${retired}`));
        withFixture(
          { 'agents/a.md': AGENT('opus'), 'workflows/w.js': `agent(p, { label: 'a', model: '${retired}' })\n` },
          (e) => assert.equal(only(e, `pins \`model: '${retired}'\``).length, 1, `workflow must reject ${retired}`),
        );
      }
    });

    test('option resolution accepts ONLY a module-level const, but aliases from any scope', () => {
      // Opposite failure directions, so opposite breadth. A block-scoped or reassigned
      // binding must NOT satisfy a call (that would certify an unpinned stage); a
      // function-scoped alias must still be SEEN (narrowing it just hides the call).
      // Both found in review on #1187.
      const unresolvable = [
        "function h() { const opts = { label: 'x', model: 'opus' } }\nagent(p, opts)",
        "let opts = { label: 'a', model: 'opus' }\nopts = build()\nagent(p, opts)",
        "if (x) { const opts = { label: 'a', model: 'opus' } }\nagent(p, opts)",
      ];
      for (const body of unresolvable) {
        const { calls } = agentCallPins(body);
        assert.equal(calls.length, 1, body);
        assert.equal(calls[0].pinned, false, `must not resolve: ${body}`);
        assert.equal(calls[0].reason, 'options-unresolved', body);
      }
      const aliasedInFunction = agentCallPins("function h() { const spawn = agent\n spawn(p, { label: 'a' }) }");
      assert.equal(aliasedInFunction.calls.length, 1, 'a function-scoped alias must still be seen');
      assert.equal(aliasedInFunction.calls[0].reason, 'missing', 'and reported as unpinned, not skipped');
      for (const body of ["const opts = { label: 'a', model: 'opus' }\nagent(p, opts)", "const spawn = agent\nspawn(p, { label: 'a', model: 'opus' })"]) {
        assert.ok(agentCallPins(body).calls.every((c) => c.pinned), `module-level form must resolve: ${body}`);
      }
    });

    test('every shipped agent and workflow stage is pinned to opus, and listed in the policy doc', () => {
      const roster = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md');
      assert.ok(roster.length > 0, '.claude/agents/ must not be empty — it IS the #27 enforcement surface');
      const doc = fs.readFileSync(path.join(ROOT, 'engineering', 'model-policy.md'), 'utf8');
      // A TABLE ROW, not a mention anywhere in the prose. The pre-#1240 version of this
      // assertion was a regex so over-escaped (`\\|` = escaped-backslash then an empty
      // alternation) that it matched EVERY string, including agent names that do not
      // exist — it was vacuous on main. A substring check has real teeth but would
      // still be satisfied by a name appearing in a paragraph, so anchor on the row.
      const rows = doc.split('\n').filter((l) => l.trimStart().startsWith('|'));
      for (const file of roster) {
        const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(fs.readFileSync(path.join(AGENTS_DIR, file), 'utf8'));
        const model = declaredModel(fm[1]);
        assert.equal(model, 'opus', `${file} pins "${model}" — every agent runs on opus (HARD RULE #27)`);
        const name = file.replace(/\.md$/, '');
        assert.ok(
          rows.some((r) => r.includes(`\`${name}\``)),
          `${name} has no row in engineering/model-policy.md's roster table`,
        );
      }
      // …and the assertion must be capable of failing (the old one was not).
      assert.ok(!rows.some((r) => r.includes('`ghostwriter`')), 'guard: a nonexistent agent must not match');
      for (const file of listWorkflowFiles(WORKFLOWS_DIR)) {
        const src = fs.readFileSync(file, 'utf8');
        const { error, calls } = agentCallPins(src);
        assert.equal(error, null, `${file} should parse`);
        assert.ok(calls.length > 0, `${file} has no agent() calls — is it still a workflow?`);
        calls.forEach((c, i) => {
          assert.ok(c.pinned, `${path.basename(file)} stage #${i + 1} is unpinned`);
        });
        // `meta.phases[].model` is DESCRIPTIVE — the gate deliberately ignores it (a
        // phases entry must not be able to satisfy a real pin). That leaves it free to
        // drift out of sync with the pins it describes, so assert it here instead.
        for (const m of src.matchAll(/\btitle:\s*['"][^'"]+['"][^}]*?\bmodel:\s*'([^']+)'/g)) {
          assert.equal(m[1], 'opus', `${path.basename(file)}: a meta.phases entry claims model '${m[1]}'`);
        }
      }
    });
  });
  describe('audio-playback boundary gate (Suono is the only WebAudio player)', () => {
    const ROOT = path.join(__dirname, '..', '..', '..');

    test('the live tree raises no audio-boundary violations', () => {
      const errors = [];
      checkAudioPlaybackBoundary(errors);
      assert.deepEqual(errors, [], errors.join('\n'));
    });

    test('the allowlist is truthful: every sanctioned file exists and still trips a pattern (not stale)', () => {
      for (const s of SANCTIONED_LEGACY_AUDIO) {
        const src = fs.readFileSync(path.join(ROOT, s.file), 'utf8');
        assert.ok(RAW_AUDIO_PATTERNS.some((re) => re.test(src)), `${s.file} should still create a raw context or call voice-model playback`);
      }
    });

    test('the gate bites raw audio / voice-model playback, but not speechSynthesis or a Suono sequence', () => {
      const hit = (s) => RAW_AUDIO_PATTERNS.some((re) => re.test(s));
      // Flagged — non-Suono playback:
      assert.ok(hit('const ctx = new AudioContext();'), 'raw AudioContext');
      assert.ok(hit('const AC = window.AudioContext || window.webkitAudioContext;'), 'webkit fallback');
      assert.ok(hit('voice.speak({ text: t });'), "voice-model's object-arg speak");
      assert.ok(hit('await voice.playBlob(blob);'), 'playBlob');
      // NOT flagged — the browser-voice rung (utterance-arg) and the Suono path:
      assert.ok(!hit('speechSynthesis.speak(u);'), 'speechSynthesis.speak(utterance) is allowed');
      assert.ok(!hit('synth.speak(new SpeechSynthesisUtterance(t));'), 'browser synth utterance speak is allowed');
      assert.ok(!hit('seq = stage.sequence({ produce });'), 'a Suono sequence is not raw audio');
      assert.ok(!hit('voice.synthOne({ text: s });'), 'the Suono byte producer is allowed');
    });
  });

  // HARD RULE #22 part 2 — the returning-visitor SNAPSHOT (a MAIN-document injection path).
  describe('snapshot-sink sanitization gate (HARD RULE #22, #616)', () => {
    const ROOT = path.join(__dirname, '..', '..', '..');

    test('the live tree raises no snapshot #22 violations', () => {
      const errors = [];
      checkSnapshotHtmlSinks(errors);
      assert.deepEqual(errors, [], errors.join('\n'));
    });

    test('the allowlist is truthful: producer sanitizes, every sanctioned file references the snapshot', () => {
      const producer = SANCTIONED_SNAPSHOT_SINKS.find((s) => s.role === 'producer');
      const psrc = fs.readFileSync(path.join(ROOT, producer.file), 'utf8');
      assert.ok(SANITIZE_CALL.test(psrc), `${producer.file} (sole writer) must call sanitizeSlideHtml`);
      for (const s of SANCTIONED_SNAPSHOT_SINKS) {
        assert.ok(referencesSnapshot(fs.readFileSync(path.join(ROOT, s.file), 'utf8')), `${s.file} should reference the snapshot`);
      }
    });

    test('the React injection sink (PlaygroundApp) is on-path via the capture/save API, not just key literals', () => {
      // The sink reads the HTML INDIRECTLY (window.__pgShellHtml), so it names no key
      // literal and no loader — only the capture/save import. referencesSnapshot must still
      // see it (else its dangerouslySetInnerHTML snapshot sink is invisible to #22).
      const indirectSink = "import { captureFirstSectionFromFrame, savePlaygroundSnapshot } from '@/playground/snapshot-cache.js';\nreturn <div dangerouslySetInnerHTML={{ __html: window.__pgShellHtml }} />;";
      assert.ok(!SNAPSHOT_KEY_LITERALS.some((k) => indirectSink.includes(k)), 'names no raw key');
      assert.ok(referencesSnapshot(indirectSink), 'still on the snapshot path via the capture/save API');
      assert.ok(SNAPSHOT_INJECT_MARKER.test(indirectSink), 'dangerouslySetInnerHTML detected → an unsanctioned sink would be flagged');
      // And the Studio writer (captureFromFrame/saveSnapshot, no inject) stays OFF-path, so
      // its unrelated localStorage.setItem calls never false-positive the write marker.
      const studioWriter = "import { captureFromFrame, saveSnapshot } from '@/playground/snapshot-cache.js';\nlocalStorage.setItem('lattice-studio-palette', p);";
      assert.ok(!referencesSnapshot(studioWriter), 'the Studio capture/save importer is not roped in');
    });

    test('the gate bites: producer dropping sanitize is flagged', () => {
      const producer = SANCTIONED_SNAPSHOT_SINKS.find((s) => s.role === 'producer');
      const src = fs.readFileSync(path.join(ROOT, producer.file), 'utf8');
      const stripped = src.replace(new RegExp(SANITIZE_CALL.source, 'g'), 'noop(');
      assert.ok(referencesSnapshot(stripped), 'still the producer');
      assert.ok(!SANITIZE_CALL.test(stripped), 'sanitize gone → gate would flag it');
    });

    test('the gate bites: a NEW writer of EITHER key (setItem) is on the snapshot path + write-marked', () => {
      // A poisoned second writer — the actual trust-boundary attack — for BOTH the Studio
      // and the Playground key (each an independent main-document injection sink).
      for (const key of SNAPSHOT_KEY_LITERALS) {
        const evil = `export function poison(html) { localStorage.setItem('${key}', JSON.stringify({ v: 1, html })); }`;
        assert.ok(referencesSnapshot(evil), `writer of ${key} is on the snapshot path (raw key)`);
        assert.ok(SNAPSHOT_WRITE_MARKER.test(evil), 'setItem write is detected → an unsanctioned writer would be flagged');
      }
    });

    test('the gate bites: a reader via the imported loader API (no literal) is still seen + inject-marked', () => {
      // The idiomatic evasion the literal-only check missed — for both surfaces' loaders.
      for (const loader of ['loadSnapshot', 'loadPlaygroundSnapshot']) {
        const evil = `import { ${loader} } from '../playground/snapshot-cache.js';\nel.innerHTML = ${loader}().html;`;
        assert.ok(!SNAPSHOT_KEY_LITERALS.some((k) => evil.includes(k)), 'never names a raw key');
        assert.ok(referencesSnapshot(evil), `still on the snapshot path via the imported ${loader} API`);
        assert.ok(SNAPSHOT_INJECT_MARKER.test(evil), 'innerHTML inject detected → an unsanctioned sink would be flagged');
      }
    });

    test('the injection marker covers the non-innerHTML idioms too', () => {
      for (const idiom of ['el.outerHTML = x', 'el.insertAdjacentHTML("beforeend", x)', 'document.write(x)', 'r.createContextualFragment(x)', 'dangerouslySetInnerHTML={{__html:x}}', '<Fragment set:html={x} />']) {
        assert.ok(SNAPSHOT_INJECT_MARKER.test(idiom), `should match: ${idiom}`);
      }
    });
  });

  describe('OpenRouter budget gate (HARD RULE #24)', () => {
    const REPO = path.join(__dirname, '..', '..', '..');

    test('every sanctioned spender is on the allowlist and exists', () => {
      assert.deepEqual(SANCTIONED_OPENROUTER_SPENDERS, [
        'tools/component-gen-eval.mjs',
        'tools/generate-voice-samples.mjs',
        'tools/intent-bakeoff/judge-eval.mjs',
      ]);
      for (const rel of SANCTIONED_OPENROUTER_SPENDERS) assert.ok(fs.existsSync(path.join(REPO, rel)), `${rel} is sanctioned but missing`);
      // A sanctioned spender must actually CARRY the opt-in guard, not merely be listed.
      // The allowlist is what lets a file read our key; a listed file without the guard
      // would spend it on any run, which is the hole HARD RULE #24 exists to close.
      for (const rel of SANCTIONED_OPENROUTER_SPENDERS) {
        const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
        assert.ok(/OPENROUTER_ALLOW_SPEND/.test(src), `${rel} is sanctioned but has no OPENROUTER_ALLOW_SPEND opt-in`);
      }
    });

    test('every sanctioned workflow exists and still references the key (no stale sanction)', () => {
      for (const rel of SANCTIONED_OPENROUTER_WORKFLOWS) {
        const p = path.join(REPO, rel);
        assert.ok(fs.existsSync(p), `${rel} is sanctioned but missing`);
        assert.ok(/OPEN_ROUTER_KEY/.test(fs.readFileSync(p, 'utf8')), `${rel} no longer uses the key — stale sanction`);
      }
    });

    test('the live repo neither exposes the key to the site nor spends it in tests', () => {
      const errors = [];
      checkOpenRouterBudget(errors);
      assert.deepEqual(errors, [], `OpenRouter budget invariant broken:\n${errors.join('\n')}`);
    });

    test('fires on a site exposure AND on a test-suite spend', () => {
      // A .astro probe (build-time frontmatter → inlined into the static bundle) locks in
      // the .astro scan coverage — a plain .ts probe would pass even if the walk regressed.
      const siteLeak = path.join(REPO, 'docs/src/pages/__or_probe__.astro');
      const testSpend = path.join(REPO, 'test/unit/__or_probe__.probe.js'); // not *.test.js — never collected as a test
      // Build the forbidden strings by concatenation so this SOURCE file doesn't itself
      // trip the gate; the WRITTEN probes get the real joined strings. The test-spend probe
      // uses BRACKET notation to lock in that the bare-name scan catches it (not just dot form).
      const keyRead = 'process.env.' + 'OPEN_ROUTER_KEY';
      const keyReadBracket = "process.env['" + 'OPEN_ROUTER' + "_KEY']";
      try {
        fs.mkdirSync(path.dirname(siteLeak), { recursive: true });
        fs.writeFileSync(siteLeak, `---\nconst k = ${keyRead};\n---\n<div>{k}</div>\n`);
        fs.writeFileSync(testSpend, `const k = ${keyReadBracket};\n`);
        const errors = [];
        checkOpenRouterBudget(errors);
        assert.ok(errors.some((e) => /must NEVER reach the site/.test(e)), 'expected a site-exposure error');
        assert.ok(errors.some((e) => /never spend our budget/.test(e)), 'expected a test-spend error');
      } finally {
        fs.rmSync(siteLeak, { force: true });
        fs.rmSync(testSpend, { force: true });
      }
    });
  });

  describe('voice-sample asset gate (HARD RULE #24 §OpenRouter budget — TTS preview cache)', () => {
    const REPO = path.join(__dirname, '..', '..', '..');
    const SAMPLES_DIR = path.join(REPO, 'docs/public/voice-samples');
    const BACKUP_DIR = `${SAMPLES_DIR}.test-backup`;

    // These tests write synthetic fixtures directly under the REAL
    // docs/public/voice-samples path (checkVoiceSampleAssets hard-codes it, same
    // as the OpenRouter budget tests above write real probe files under the repo).
    // That path can hold real, paid-for, committed audio generated by
    // tools/generate-voice-samples.mjs — a bare `rmSync(SAMPLES_DIR)` in a `finally`
    // would silently destroy it. This helper moves any PRE-EXISTING real directory
    // aside before the test body runs and restores it afterward, so the test can
    // freely create/delete under the real path without ever being able to touch
    // content that was there before it ran.
    function withSandboxedSamplesDir(fn) {
      const hadReal = fs.existsSync(SAMPLES_DIR);
      if (hadReal) fs.renameSync(SAMPLES_DIR, BACKUP_DIR);
      try {
        fn();
      } finally {
        fs.rmSync(SAMPLES_DIR, { recursive: true, force: true });
        if (hadReal) fs.renameSync(BACKUP_DIR, SAMPLES_DIR);
      }
    }

    test('an absent dir is not an error (most checkouts have no funded OpenRouter key to generate with)', () => {
      withSandboxedSamplesDir(() => {
        assert.ok(!fs.existsSync(SAMPLES_DIR));
        const errors = [];
        checkVoiceSampleAssets(errors);
        assert.deepEqual(errors, []);
      });
    });

    test('fires when a requiresAsset engine is missing its directory entirely', () => {
      withSandboxedSamplesDir(() => {
        fs.mkdirSync(SAMPLES_DIR, { recursive: true }); // present but empty — every requiresAsset engine's dir is "missing"
        const errors = [];
        checkVoiceSampleAssets(errors);
        assert.ok(errors.some((e) => /grok\/ is missing/.test(e)));
      });
    });

    test('fires on a missing voice file and a stale/orphaned one, once the directory exists', () => {
      withSandboxedSamplesDir(() => {
        // grok's cachedVoices is eve, ara, rex, sal, leo — write all but leo, plus a bogus extra.
        const dir = path.join(SAMPLES_DIR, 'grok');
        fs.mkdirSync(dir, { recursive: true });
        for (const v of ['eve', 'ara', 'rex', 'sal']) fs.writeFileSync(path.join(dir, `${v}.mp3`), 'x');
        fs.writeFileSync(path.join(dir, 'not-a-real-voice.mp3'), 'x');
        const errors = [];
        checkVoiceSampleAssets(errors);
        assert.ok(errors.some((e) => /grok\/leo\.mp3 is missing/.test(e)));
        assert.ok(errors.some((e) => /grok\/not-a-real-voice\.mp3 is a stale\/orphaned sample/.test(e)));
      });
    });

    test('expects the sanitized (":" -> "_") filename for a voice id a Windows filesystem can\'t hold', () => {
      withSandboxedSamplesDir(() => {
        // mai-voice-2's cachedVoices carry a literal ":" (e.g. "en-US-Harper:MAI-Voice-2");
        // both the generator and this gate must sanitize it the SAME way.
        const dir = path.join(SAMPLES_DIR, 'mai-voice-2');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'en-US-Harper:MAI-Voice-2.mp3'), 'x'); // the UNSANITIZED name — wrong
        const errors = [];
        checkVoiceSampleAssets(errors);
        assert.ok(errors.some((e) => /mai-voice-2\/en-US-Harper:MAI-Voice-2\.mp3 is a stale\/orphaned sample/.test(e)));
        assert.ok(errors.some((e) => /mai-voice-2\/en-US-Harper_MAI-Voice-2\.mp3 is missing/.test(e)));
      });
    });

    test('fires on a directory for an engine that no longer exists in the catalog', () => {
      withSandboxedSamplesDir(() => {
        fs.mkdirSync(path.join(SAMPLES_DIR, 'not-a-real-engine'), { recursive: true });
        const errors = [];
        checkVoiceSampleAssets(errors);
        assert.ok(errors.some((e) => /not-a-real-engine\/ has no matching engine/.test(e)));
      });
    });

    test('fires on a missing sample for kokoro — hosted (requiresAsset:true) now caches its full roster', () => {
      // Kokoro flipped to requiresAsset:true 2026-07-13 (hosted hexgrad/kokoro-82m,
      // full 54-voice roster committed). It's now the SAME requiresAsset:true branch
      // as every other cloud engine: an empty directory means every roster voice is
      // a missing file, not a "requiresAsset is false" stale-directory error.
      withSandboxedSamplesDir(() => {
        fs.mkdirSync(path.join(SAMPLES_DIR, 'kokoro'), { recursive: true }); // present but empty
        const errors = [];
        checkVoiceSampleAssets(errors);
        assert.ok(errors.some((e) => /kokoro\/af_heart\.mp3 is missing/.test(e)));
      });
    });

    test('fires on a leftover .wav — every committed sample is mp3, whatever the wire returned', () => {
      withSandboxedSamplesDir(() => {
        // gemini declares audioFormat:"wav", but that names THE WIRE (its endpoint answers in raw
        // PCM), not the file: the generator encodes that PCM to mp3 before committing it. So a
        // .wav in this directory is a leftover from before the samples were compressed, and is as
        // orphaned as a retired voice id — which is what keeps 3.8 MB of WAV from creeping back.
        const dir = path.join(SAMPLES_DIR, 'gemini');
        fs.mkdirSync(dir, { recursive: true });
        for (const v of ['Puck', 'Charon', 'Kore', 'Aoede', 'Fenrir', 'Leda', 'Orus', 'Zephyr', 'Umbriel', 'Autonoe']) {
          fs.writeFileSync(path.join(dir, `${v}.mp3`), 'x');
        }
        fs.writeFileSync(path.join(dir, 'Puck.wav'), 'x'); // the uncompressed leftover
        const errors = [];
        checkVoiceSampleAssets(errors);
        assert.ok(errors.some((e) => /gemini\/Puck\.wav is a stale\/orphaned sample/.test(e)));
        assert.ok(!errors.some((e) => /gemini\/Puck\.mp3 is missing/.test(e))); // the correctly-named file still satisfies the roster
      });
    });
  });

  describe('density coverage (2026-06-30 — every prose layout budgeted or exempt)', () => {
    const manifests = loadAll();

    test('the live tree is clean — every component has density or an exempt entry', () => {
      const errors = [];
      checkDensityCoverage(manifests, errors);
      assert.deepEqual(errors, [], errors.join('\n'));
    });

    test('the allowlist is truthful: every exempt name exists and lacks a density block', () => {
      const byName = new Map(manifests.map((m) => [m.name, m]));
      for (const name of Object.keys(SANCTIONED_DENSITY_EXEMPT)) {
        const m = byName.get(name);
        assert.ok(m, `exempt '${name}' is not a real component`);
        assert.ok(!m.density, `exempt '${name}' now has a density block — stale entry`);
      }
    });

    test('the gate bites: a new unbudgeted layout fails', () => {
      const errors = [];
      checkDensityCoverage([...manifests, { name: 'brand-new-prose' }], errors);
      assert.ok(errors.some((e) => /brand-new-prose: no `density`/.test(e)));
    });

    test('the gate bites: a stale exemption (now has density) fails', () => {
      const exemptName = Object.keys(SANCTIONED_DENSITY_EXEMPT)[0];
      const mutated = manifests.map((m) => (m.name === exemptName ? { ...m, density: { axis: 'item', soft: 5, hard: 8 } } : m));
      const errors = [];
      checkDensityCoverage(mutated, errors);
      assert.ok(errors.some((e) => new RegExp(`'${exemptName}', but it now HAS a density block`).test(e)));
    });
  });

  // The Vetrina walkthrough library's two structural antibodies
  // (engineering/decisions/2026-07-05-vetrina-walkthrough-library.md §13, §6.1).
  describe('Vetrina import-boundary gate (§13 — open-sourceable, zero host deps)', () => {
    const scan = (src) => [...src.matchAll(new RegExp(VETRINA_IMPORT.source, 'g'))].map((m) => m[1]);

    test('the live tree is clean — the core imports nothing outside the folder', () => {
      const errors = [];
      checkVetrinaBoundary(errors);
      assert.deepEqual(errors, [], errors.join('\n'));
    });

    test('every core (non-test) file imports only in-folder `./` specifiers', () => {
      for (const file of listSourceFiles(VETRINA_DIR)) {
        if (/\.test\.[tj]s$/.test(file)) continue;
        if (path.basename(file) === 'react.ts') continue; // the sanctioned peer-dep adapter
        for (const spec of scan(fs.readFileSync(file, 'utf8'))) {
          assert.ok(spec.startsWith('./') || spec.startsWith('node:'), `${path.relative(VETRINA_DIR, file)} imports '${spec}' — must be in-folder`);
        }
      }
    });

    test('the gate bites: a `../` host escape is a non-`./` specifier', () => {
      const specs = scan("import { foo } from '../../lib/host';\nimport { bar } from './stage';");
      assert.ok(specs.includes('../../lib/host'), 'the escape is detected');
      assert.ok(!'../../lib/host'.startsWith('./'), 'and would fail the in-folder rule');
      assert.ok('./stage'.startsWith('./'), 'the in-folder import passes');
    });

    test('the gate bites: a bare npm specifier (e.g. lodash) is caught', () => {
      const specs = scan("import _ from 'lodash';");
      assert.deepEqual(specs, ['lodash']);
      assert.ok(!'lodash'.startsWith('./') && !'lodash'.startsWith('node:'), 'bare dep would fail');
    });
  });

  // The Anima animation core's self-containment antibody
  // (engineering/decisions/2026-07-17-anima-animation-library.md §11 — spin-off-able, zero host deps).
  describe('Anima import-boundary gate (§11 — zero-dependency, spin-off-able)', () => {
    // Anima reuses the hardened multi-form Suono specifier patterns (side-effect /
    // dynamic import() / require() / multi-line), so scan with those.
    const scan = (src) => {
      const clean = stripJsComments(src);
      const out = [];
      for (const pattern of SUONO_SPEC_PATTERNS) for (const m of clean.matchAll(pattern)) out.push(m[1]);
      return out;
    };

    test('the live tree is clean — the core imports nothing outside the folder', () => {
      const errors = [];
      checkAnimaBoundary(errors);
      assert.deepEqual(errors, [], errors.join('\n'));
    });

    test('every file resolves in-folder or node:; a backend adds only its sanctioned engine dep', () => {
      for (const file of listSourceFiles(ANIMA_DIR)) {
        if (/\.test\.[tj]s$/.test(file)) continue;
        const relInLib = path.relative(ANIMA_DIR, file).split(path.sep).join('/');
        const allowed = ANIMA_ADAPTER_DEPS[relInLib] || [];
        for (const spec of scan(fs.readFileSync(file, 'utf8'))) {
          if (spec.startsWith('.')) {
            const resolved = path.resolve(path.dirname(file), spec);
            assert.ok(resolved === ANIMA_DIR || resolved.startsWith(ANIMA_DIR + path.sep), `${relInLib} imports '${spec}', which escapes the folder`);
          } else if (!spec.startsWith('node:')) {
            assert.ok(allowed.includes(spec), `${relInLib} imports bare '${spec}' not in its adapter allowlist`);
          }
        }
      }
    });

    test('the containment check rejects escapes + a sibling-prefix dir, allows intra-lib', () => {
      // Mirrors checkAnimaBoundary's real resolution: a relative import is allowed only if it
      // resolves INSIDE ANIMA_DIR. Guards the `+ path.sep` that stops the anima/anima-evil
      // sibling-prefix false-allow, and the backend→core `../` reach.
      const from = path.join(ANIMA_DIR, 'backends');
      const inside = (spec) => {
        const r = path.resolve(from, spec);
        return r === ANIMA_DIR || r.startsWith(ANIMA_DIR + path.sep);
      };
      assert.ok(inside('../types'), 'backend → core (../types) allowed');
      assert.ok(inside('./paint'), 'in-folder (./paint) allowed');
      assert.ok(!inside('../../lib/host'), 'a ../../lib/host escape rejected');
      assert.ok(!inside('../../anima-evil/x'), 'a sibling-prefix dir (anima-evil) rejected');
    });

    test('the gate bites on EVERY escape form a lazy backend might use', () => {
      // The checker MED: the weak single-line regex missed all of these. Assert the
      // hardened pattern set catches a side-effect import, a dynamic import(), a require(),
      // and a multi-line `{ … } from` escape — while `./` and `node:` pass.
      const specs = scan(
        [
          "import 'three';", // side-effect
          "const t = await import('three');", // dynamic
          "const host = require('../../lib/host');", // require escape
          "import {\n  Mesh,\n} from '../../vendor/three';", // multi-line wrap
          "const z=0;import Zdog from 'zdog';", // H1: import after a `;` on the same line
          "import { compile } from './compile';", // in-folder — OK
          "import { readFileSync } from 'node:fs';", // node built-in — OK
        ].join('\n'),
      );
      for (const bad of ['three', '../../lib/host', '../../vendor/three', 'zdog']) {
        assert.ok(specs.includes(bad), `escape '${bad}' is detected`);
        assert.ok(!bad.startsWith('./') && !bad.startsWith('node:'), `escape '${bad}' fails the in-folder rule`);
      }
      assert.ok('./compile'.startsWith('./') && 'node:fs'.startsWith('node:'), 'the in-folder + node: imports pass');
    });
  });

  describe('SANCTIONED_GESTURES gate (§6.1 — the frozen alphabet)', () => {
    const stageSrc = () => fs.readFileSync(path.join(VETRINA_DIR, 'stage.ts'), 'utf8');
    const declaredGestures = (src) => {
      const decl = src.match(/export\s+type\s+Gesture\s*=\s*([^;]+);/);
      return new Set((decl[1].match(/'([a-z]+)'/g) || []).map((s) => s.replace(/'/g, '')));
    };

    test('the live tree is clean — the Gesture union matches the registry exactly', () => {
      const errors = [];
      checkSanctionedGestures(errors);
      assert.deepEqual(errors, [], errors.join('\n'));
    });

    // Two families, and the count is deliberately spelled out rather than derived: the point of
    // this assertion is that ADDING one has to be a decision someone edits a test to make. The
    // first five report the TOUR's own state; the four deictic members name a piece of the
    // HOST's content, which is the meaning none of the first five could carry.
    test('the alphabet is a closed set, each member carrying a meaning', () => {
      const keys = Object.keys(SANCTIONED_GESTURES);
      assert.equal(keys.length, 9, 'exactly nine gestures');
      assert.deepEqual(keys.sort(), ['bracket', 'check', 'circle', 'cross', 'shake', 'tap', 'underline', 'wash', 'wave']);
      for (const [g, meaning] of Object.entries(SANCTIONED_GESTURES)) {
        assert.ok(typeof meaning === 'string' && meaning.length > 0, `${g} declares a meaning`);
      }
    });

    test('the registry and the stage.ts union are isomorphic', () => {
      assert.deepEqual(declaredGestures(stageSrc()), new Set(Object.keys(SANCTIONED_GESTURES)));
    });

    test('the gate bites: a new unsanctioned member (spin) in the union is flagged', () => {
      const declared = declaredGestures("export type Gesture = 'wave' | 'circle' | 'check' | 'cross' | 'shake' | 'underline' | 'wash' | 'bracket' | 'tap' | 'spin';");
      const sanctioned = new Set(Object.keys(SANCTIONED_GESTURES));
      const orphans = [...declared].filter((g) => !sanctioned.has(g));
      assert.deepEqual(orphans, ['spin'], 'spin has no sanctioned meaning → gate flags it');
    });

    test('the gate bites: a stale registry entry the union dropped is flagged', () => {
      const declared = declaredGestures("export type Gesture = 'wave' | 'circle' | 'check' | 'cross' | 'underline' | 'wash' | 'bracket' | 'tap';"); // shake removed
      const stale = Object.keys(SANCTIONED_GESTURES).filter((g) => !declared.has(g));
      assert.deepEqual(stale, ['shake'], 'the registry keeps shake the type no longer declares → gate flags it');
    });
  });

  describe('categorical three-layer contrast gate', () => {
    test('every shipped hue-based theme passes all three layers', () => {
      const errors = [];
      checkCatContrast(errors);
      assert.deepEqual(errors, [], `cat-contrast gate should pass on shipped themes; got:\n${errors.join('\n')}`);
    });

    test('catResolve follows light-dark() arms and var() chains to a hex', () => {
      const map = new Map([
        ['--cat-1-fill', 'light-dark(#bee0e5, #0e5a63)'],
        ['--cat-on-fill', 'var(--text-heading)'],
        ['--text-heading', 'light-dark(#0E2F33, var(--scheme-dark-text-heading))'],
        ['--scheme-dark-text-heading', '#EFE8D7'],
      ]);
      assert.equal(catResolve(map, '--cat-1-fill', 'light'), '#bee0e5');
      assert.equal(catResolve(map, '--cat-1-fill', 'dark'), '#0e5a63');
      assert.equal(catResolve(map, '--cat-on-fill', 'light'), '#0e2f33'); // through var → light-dark
      assert.equal(catResolve(map, '--cat-on-fill', 'dark'), '#efe8d7');  // through var → var → hex
    });

    test('catResolve splits light-dark on the TOP-LEVEL comma, not one nested in an arm', () => {
      // Regression for the checker's HIGH finding: a naive regex split broke here.
      const map = new Map([
        ['--x', 'light-dark(color-mix(in oklab, #aabbcc 50%, #ddeeff), #123456)'],
      ]);
      // The light arm is a color-mix() whose own commas sit INSIDE the arm. It must
      // resolve to the real 50/50 oklab blend of #aabbcc and #ddeeff — not to a hex
      // silently harvested from inside the mix (#aabbcc, what the naive split gave),
      // and no longer to null: since --cat-N-ink the resolver evaluates color-mix().
      assert.equal(catResolve(map, '--x', 'light'), '#c3d4e5');
      // dark arm is a plain hex and must resolve correctly despite the commas in the light arm.
      assert.equal(catResolve(map, '--x', 'dark'), '#123456');
    });

    test('catResolve stays FAIL-CLOSED on a value that is not a color', () => {
      // The evaluator it delegates to returns unresolvable input verbatim, which is
      // right for a renderer and wrong for a gate: a non-color must read as "cannot
      // verify" (null), so the caller raises it instead of silently skipping a slot.
      const map = new Map([
        ['--a', 'var(--never-declared)'],
        ['--b', 'currentColor'],
        ['--c', 'color-mix(in oklab, currentColor 65%, #123456)'],
        ['--d', 'light-dark(#111111)'], // a one-armed light-dark() is malformed
      ]);
      for (const t of ['--a', '--b', '--c', '--d']) {
        assert.equal(catResolve(map, t, 'light'), null, `${t} must fail closed`);
      }
    });

    test('the ink gate bites: an undiluted mark used as on-canvas ink is below AA', () => {
      // The #1263 defect, in miniature — `atelier` light, --cat-4-mark painted raw
      // as `color:` on the `math.theorem` blockquote's --bg-alt. The whole point of
      // --cat-N-ink is that this pair clears 4.5:1 instead.
      assert.ok(catContrast('#478400', '#e5e0d2') < CAT_TEXT_FLOOR, 'the raw mark fails AA on --bg-alt');
      const map = new Map([['--cat-4-ink', 'light-dark(#3C6A1A, #B6D98A)']]);
      assert.ok(catContrast(catResolve(map, '--cat-4-ink', 'light'), '#e5e0d2') >= CAT_TEXT_FLOOR,
        'the curated ink clears AA on the same surface');
    });

    test('the curated ink keeps the mark hue — that is what makes it on brand', () => {
      // The recipe moves LIGHTNESS only. A mix toward --text-heading (the shipped
      // first cut) dragged the hue up to 14.9 degrees on chromatic-heading palettes;
      // holding hue is the whole reason the values are generated instead of mixed.
      const { solveInk } = require('../../../tools/derive-cat-ink.js');
      const { hexToOklch, contrastRatio } = require('../../../lib/theme/color.js');
      const mark = '#478400'; // atelier cat-4, the worst measured slot
      const ink = solveInk(mark, '#f2efe6', '#e5e0d2');
      const hueOf = (h) => hexToOklch(h).h;
      let drift = Math.abs(hueOf(mark) - hueOf(ink)) % 360;
      if (drift > 180) drift = 360 - drift;
      assert.ok(drift < 2, `curated ink drifted ${drift.toFixed(1)}deg off the mark hue`);
      assert.ok(Math.min(contrastRatio(ink, '#f2efe6'), contrastRatio(ink, '#e5e0d2')) >= CAT_TEXT_FLOOR,
        'and it still clears AA on both surfaces');
    });

    // THESE THREE ARE BITE-TESTS, NOT SMOKE TESTS. The first cut of this block
    // asserted `deepEqual(errors, [])` after running each arm over the REAL shipped
    // palettes, which passes whether the arm inspects anything, is dead, or is
    // deleted outright — the ink collapse arm shipped with zero effective coverage
    // that way. Each test below constructs the violation and asserts the arm names
    // it, then asserts the clean case stays silent.

    test('checkCatInkDeclared BITES: a palette owning a mark cycle but no ink cycle is named', () => {
      const { checkCatInkDeclared } = require('../../../tools/check-ownership.js');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-ink-declared-'));
      try {
        const cycle = Array.from({ length: 12 }, (_, i) => `  --cat-${i + 1}-mark: #123456;`).join('\n');
        fs.writeFileSync(path.join(dir, 'noink.css'), `:root{\n${cycle}\n}`);
        const errors = [];
        checkCatInkDeclared(errors, dir);
        assert.equal(errors.length, 1, 'the arm should name the palette');
        assert.match(errors[0], /"noink"/);
        assert.match(errors[0], /missing 12 of its 12 on-canvas ink slots/);

        // …and stays silent once the cycle is there.
        const inks = Array.from({ length: 12 }, (_, i) => `  --cat-${i + 1}-ink: #123456;`).join('\n');
        fs.writeFileSync(path.join(dir, 'noink.css'), `:root{\n${cycle}\n${inks}\n}`);
        const clean = [];
        checkCatInkDeclared(clean, dir);
        assert.deepEqual(clean, []);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    test('the ink collapse arm BITES: inks that coincide where their marks do not', () => {
      const { catInkCollapsePairs } = require('../../../tools/check-ownership.js');
      // Twelve well-separated marks…
      const marks = ['#B03030', '#30B030', '#3030B0', '#B0B030', '#B030B0', '#30B0B0',
                     '#8A4520', '#20458A', '#458A20', '#8A2045', '#208A45', '#452080'];
      // …whose solve left every slot on one value: the a11y-dark failure exactly.
      assert.ok(catInkCollapsePairs(marks.map(() => '#848484'), marks).length >= 60,
        'a fully collapsed arm should report a pair for (almost) every combination');
      // A single collapsed PAIR is caught too, and named.
      const oneBad = marks.map((m, i) => (i === 4 ? '#30B030' : m));
      const pairs = catInkCollapsePairs(oneBad, marks);
      assert.equal(pairs.length, 1);
      assert.match(pairs[0], /--cat-2-ink\/--cat-5-ink/);
      // Inks that simply ARE the marks are never a collapse.
      assert.deepEqual(catInkCollapsePairs(marks, marks), []);
      // And an inherited near-tie is exempt: concrete dark ships two marks ~2/255
      // apart, so its inks being that close is a palette fact, not a solve failure.
      const tied = ['#DFDDDD', '#DFDEDD', ...marks.slice(2)];
      assert.deepEqual(catInkCollapsePairs(tied, tied), []);
    });

    test('checkCatInkFallback BITES: a bare read, and a mismatched slot number', () => {
      const { checkCatInkFallback } = require('../../../tools/check-ownership.js');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cat-ink-fallback-'));
      try {
        const at = path.join(dir, 'x.styles.css');
        fs.writeFileSync(at, 'a { color: var(--cat-3-ink); }');
        const bare = [];
        checkCatInkFallback(bare, dir);
        assert.equal(bare.length, 1, 'a bare read must be flagged');
        assert.match(bare[0], /x\.styles\.css:1/);

        // The slot numbers have to agree — this typo would paint category 3 in 7's hue.
        fs.writeFileSync(at, 'a { color: var(--cat-3-ink, var(--cat-7-mark)); }');
        const mismatched = [];
        checkCatInkFallback(mismatched, dir);
        assert.equal(mismatched.length, 1, 'a mismatched slot number must be flagged');

        // The correct spelling passes, including a deeper nested fallback.
        fs.writeFileSync(at, 'a { color: var(--cat-3-ink, var(--cat-3-mark)); }\n' +
                             'b { color: var(--cat-4-ink, var(--cat-4-mark, var(--accent))); }');
        const clean = [];
        checkCatInkFallback(clean, dir);
        assert.deepEqual(clean, []);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    test('solveInk returns the mark UNCHANGED when it already clears', () => {
      // Most slots need no repair at all; repainting them would move a curated
      // value for nothing. Regression for the binary search whose inverted
      // invariant collapsed every slot to the pole (#000001 for a teal mark).
      const { solveInk } = require('../../../tools/derive-cat-ink.js');
      assert.equal(solveInk('#2E608A', '#F2F5FA', '#FFFFFF'), '#2E608A');
    });

    test('catResolve honors a var() fallback that itself contains commas', () => {
      const map = new Map([['--y', 'var(--missing, light-dark(#111111, #222222))']]);
      assert.equal(catResolve(map, '--y', 'light'), '#111111');
      assert.equal(catResolve(map, '--y', 'dark'), '#222222');
    });

    test('catParseTokens takes the LAST declaration (CSS cascade), not the first', () => {
      const map = new Map();
      // emulate what catParseTokens builds; verify resolve reads the override
      map.set('--z', '#000000');
      map.set('--z', '#ffffff'); // later declaration wins
      assert.equal(catResolve(map, '--z', 'light'), '#ffffff');
    });

    test('catContrast matches known WCAG pairs', () => {
      assert.ok(Math.abs(catContrast('#000000', '#ffffff') - 21) < 0.01);
      assert.ok(catContrast('#767676', '#ffffff') >= 4.5); // canonical AA gray
    });

    test('the gate bites: fill == mark (the original collapse bug) is flagged', () => {
      // Simulate one theme's slot where fill and mark are identical.
      const fill = '#888888', mark = '#888888';
      assert.equal(catContrast(fill, mark), 1, 'identical fill/mark are exactly 1:1');
      assert.ok(1 < 1.25, 'a 1:1 fill/mark falls below the collapse floor → gate flags it');
    });

    test('the gate bites: sub-AA label text on a fill is below the text floor', () => {
      // light ink on a pale-ish fill that is too light → fails AA
      assert.ok(catContrast('#f0e5c8', '#f5efd8') < CAT_TEXT_FLOOR);
      // deep jewel fill vs light ink → clears AA
      assert.ok(catContrast('#f0e5c8', '#1a1206') >= CAT_TEXT_FLOOR);
    });

    test('the edge floor is the WCAG graphical-object threshold', () => {
      assert.equal(CAT_EDGE_FLOOR, 3.0);
    });
  });

  describe('class-attribute read gate (#1358)', () => {
    // A `<section>` carries `data-class="<raw _class:>"` BEFORE `class="<resolved>"`, so an
    // unguarded regex reads the directive payload. The gate's whole value is that it fails on
    // the SPELLINGS a developer actually reaches for — the first cut passed four of them and
    // rejected two correct guards, which an adversarial review found before merge. Both lists
    // below are that review's fixtures, pinned so the hole cannot reopen.
    const write = (name, lines) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-classattr-'));
      const p = path.join(dir, name);
      fs.writeFileSync(p, `${lines.join('\n')}\n`);
      return p;
    };
    const offencesFor = (lines) => classAttrOffences({ roots: [], files: [write('probe.js', lines)] });

    // Every one of these READS `data-class` on a real section tag. `\s*` and `\s?` are
    // zero-width, i.e. not guards at all — and they are the likeliest thing to write after
    // being told "add a leading \s".
    const UNGUARDED = [
      `const a = /class="([^"]*)"/.exec(t);`,
      `const b = /class="[^"]*"/.exec(t);`,
      `const c = /class="([^"]+)"/.exec(t);`,
      `const d = /class="(.*?)"/.exec(t);`,
      String.raw`const e = /class="([\w -]*)"/.exec(t);`,
      String.raw`const f = /class\s*=\s*"([^"]*)"/.exec(t);`,
      `const g = new RegExp('class="([^"]*)"');`,
      String.raw`const h = /\s*class="([^"]*)"/.exec(t);`,
      String.raw`const i = /\s?class="([^"]*)"/.exec(t);`,
      String.raw`const j = /[\s]*class="([^"]*)"/.exec(t);`,
    ];

    // Every one of these reads the RESOLVED list, or is not a matcher at all.
    const GUARDED = [
      String.raw`const a = /(?:^|\s)class="([^"]*)"/.exec(t);`,
      String.raw`const b = /(^|\s)class="([^"]*)"/.exec(t);`,
      String.raw`const c = /(?:\s|^)class="([^"]*)"/.exec(t);`,
      `const d = /(?<!-)class="([^"]*)"/.exec(t);`,
      String.raw`const e = /(?<![-\w])class="([^"]*)"/.exec(t);`,
      String.raw`const f = /(?<![\w-])class="([^"]*)"/.exec(t);`,
      String.raw`const g = /\sclass="([^"]*)"/.exec(t);`,
      String.raw`const h = /\s+class="([^"]*)"/.exec(t);`,
      String.raw`const i = /[\s>]class="([^"]*)"/.exec(t);`,
      `const j = /data-class="([^"]*)"/.exec(t);`,
      String.raw`const k = /(?:^|\s)class\s*=\s*"([^"]*)"/.exec(t);`,
      `const l = ` + '`<div class="below-note"><p>x</p></div>`;',
    ];

    test('every unguarded spelling is caught — including the zero-width quantifiers', () => {
      const got = offencesFor(UNGUARDED).map((o) => o.line);
      assert.deepStrictEqual(got, UNGUARDED.map((_, i) => i + 1),
        'a spelling walked past the gate; it reads data-class and renders plausibly');
    });

    test('every correct guard passes, and literal markup is not a matcher', () => {
      assert.deepStrictEqual(offencesFor(GUARDED), [],
        'a false positive forces the author to weaken a correct guard or exempt the whole file');
    });

    test('prose may write the bad pattern down — in either comment style', () => {
      assert.deepStrictEqual(offencesFor([
        `// a bare /class="([^"]*)"/ reads data-class`,
        '/* and so does',
        ` * /class="[^"]+"/ — explained here`,
        ' */',
      ]), [], 'the gate must not flag the docs that explain it');
    });

    test('a matcher parked after a comment-shaped continuation line is still caught', () => {
      // The line-based first cut skipped any line whose leading text began `*`, which the
      // continuation of a multi-line expression also does.
      const got = offencesFor([
        'const n = someValue',
        `  * factor; const PARKED = /class="([^"]*)"/.exec(t);`,
      ]);
      assert.strictEqual(got.length, 1, 'a live matcher hid behind a `*` line start');
    });

    test('the repo is clean and the allowlist is empty', () => {
      assert.deepStrictEqual(classAttrOffences(), []);
      assert.deepStrictEqual(SANCTIONED_CLASS_ATTR_READS, [],
        'an entry here blanket-exempts a whole file — prefer readClassAttr');
    });
  });
});

// ── checkCommittedPdfs — every committed PDF names a producer AND a watcher ────
// The gate landed with its canaries run by hand and no artifact (#1279). That is the
// shape HARD RULE #23 rejects: a claim of verification whose evidence does not survive
// the session it was made in. Pinned here, in all three directions the canaries covered.
describe('check-ownership: checkCommittedPdfs (#1279)', () => {
  const { checkCommittedPdfs, auditPdfOwnership, PDF_OWNERSHIP } = require('../../../tools/check-ownership');
  const { EXTRA_NAMES } = require('../../../tools/build-bucket-galleries');

  // THE TWO FAILURE BRANCHES, DRIVEN. Everything below this pair used to assert either
  // that the real tree is clean or that the table's fields are populated -- so inverting
  // the orphan condition, or deleting the stale-rule loop outright, left the suite green
  // while the CHANGELOG claimed the gate was "proven with deliberately-broken canaries in
  // all three directions". It was, by hand, once; a hand-run canary leaves no artifact and
  // is not a test. `auditPdfOwnership` is the same logic as a pure function of a file list
  // so the canaries can live here permanently.
  test('CANARY — an unowned PDF is named as an orphan', () => {
    const real = 'examples/auto-split.pdf';
    const { orphans } = auditPdfOwnership([real, 'somewhere/nobody-owns-this.pdf']);
    assert.deepEqual(orphans, ['somewhere/nobody-owns-this.pdf'],
      'a path no rule claims must surface, and a real one must not');
  });

  test('CANARY — a rule matching nothing is named as stale', () => {
    // One real file, so exactly one rule hits and every OTHER rule reports stale.
    const { staleRules } = auditPdfOwnership(['examples/auto-split.pdf']);
    assert.equal(staleRules.length, PDF_OWNERSHIP.length - 1,
      'every rule but the one that matched must be reported stale');
    assert.ok(!staleRules.includes('per-feature demo decks (HARD RULE #9) and the token-contrast set'),
      'the rule that DID match must not be called stale');
  });

  test('CANARY — a rule that names a producer must be true OF THE FILE, not of the path shape', () => {
    // Each of these has the exact shape its rule matches and NO source deck behind it, so
    // nothing would ever write it. Nine of the ten rules certified files like these as
    // owned, with a named producer, until round 3 (only the lib/base arm had been fixed).
    const phantoms = [
      'lib/components/anchor/_bogus/bogus.gallery.light.pdf',
      'examples/hand-dropped-orphan.pdf',
      'exemplars/fake/fake.pdf',
      'design/bogus.gallery.pdf',
      'test/integration/baseline-decks/bogus.pdf',
    ];
    const { orphans } = auditPdfOwnership(phantoms);
    assert.deepEqual(orphans.sort(), [...phantoms].sort(),
      'a producer claim with no input behind it is not ownership');
  });

  test('the real tree is fully owned — no orphan, no stale rule', () => {
    const errors = [];
    checkCommittedPdfs(errors);
    assert.deepEqual(errors, [], errors.join('\n'));
  });

  test('every rule names a producer, and says so explicitly when it has no watcher', () => {
    for (const r of PDF_OWNERSHIP) {
      assert.equal(typeof r.what, 'string');
      assert.ok(r.producer && r.producer.length > 0, `${r.what}: a rule must name how the PDF is produced`);
      // `watcher: null` is a deliberate, reviewable statement — but it must be the
      // literal null, never simply absent, or "nobody checked" and "nothing watches
      // this, here is why" become indistinguishable.
      assert.ok(Object.hasOwn(r, 'watcher'), `${r.what}: state the watcher, or state null`);
    }
  });

  test('a lib/base gallery with no BUILDER is an orphan, not a free pass', () => {
    // The first cut matched all of `lib/base/**` on the strength of EXTRA_GALLERIES
    // existing at all, so a second hand-authored gallery would have passed the
    // "it has a producer" check with no producer — #1279's own defect, recurring
    // under a green gate.
    const rule = PDF_OWNERSHIP[0];
    const known = EXTRA_NAMES[0];
    assert.ok(rule.test(`lib/base/_${known}/${known}.gallery.light.pdf`), 'the known gallery is claimed');
    assert.equal(rule.test('lib/base/_foo/foo.gallery.light.pdf'), false,
      'an unbuilt lib/base gallery must fall through to the orphan check');
    assert.ok(rule.test('lib/components/chart/kanban/kanban.gallery.dark.pdf'), 'components are claimed');
  });

  test('the examples rule does not silently claim the chart-theme reviewer decks', () => {
    // They have their own rule, with `watcher: null` and the reason. If the broad
    // examples rule swallowed them, that honesty would be unreachable.
    const byExamples = PDF_OWNERSHIP.findIndex((r) => r.test('examples/chart-theme-gallery/chart-onyx-light.pdf'));
    const own = PDF_OWNERSHIP.findIndex((r) => r.what.includes('curated chart palettes'));
    assert.equal(byExamples, own);
  });
});

// ── Theme manifests: scope is DECLARED, and the declaration is proved ────────
//
// BITE-TESTS, not smoke tests. Asserting `deepEqual(errors, [])` over the shipped
// themes would pass whether these gates inspect anything or are deleted outright —
// which is exactly how the two holes below shipped in the first cut: nothing
// validated a manifest against its own schema, and the light-dark() arm split broke
// on any arm containing a paren. Each test constructs the violation and asserts the
// gate names it, then asserts the clean case stays silent.
describe('theme manifest gates', () => {
  const fixture = (files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-manifest-'));
    for (const [name, body] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), typeof body === 'string' ? body : `${JSON.stringify(body, null, 2)}\n`);
    }
    return dir;
  };
  const BASE_CSS = ":root{\n  --bg: light-dark(#FFFFFF, #101010);\n}\n@import 'lattice';\n:where(:root) { color-scheme: light; }\n";
  const baseManifest = (over = {}) => ({
    name: 'probe', role: 'base', family: 'brand', tier: 'more',
    modes: ['light', 'dark'], darkCounterpart: null, order: 0, swatch: '#123456', ...over,
  });

  test('checkThemeManifestCoverage BITES: a theme with no manifest, and a manifest with no theme', () => {
    const { checkThemeManifestCoverage } = require('../../../tools/check-ownership.js');
    const dir = fixture({ 'probe.css': BASE_CSS, 'ghost.manifest.json': baseManifest({ name: 'ghost' }) });
    try {
      const errors = [];
      checkThemeManifestCoverage(errors, dir);
      assert.equal(errors.length, 2);
      assert.ok(errors.some((e) => /probe\.css has no manifest/.test(e)));
      assert.ok(errors.some((e) => /ghost\.manifest\.json has no themes\/ghost\.css/.test(e)));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('checkThemeManifestCoverage BITES: a manifest whose name disagrees with its filename', () => {
    const { checkThemeManifestCoverage } = require('../../../tools/check-ownership.js');
    const dir = fixture({ 'probe.css': BASE_CSS, 'probe.manifest.json': baseManifest({ name: 'other' }) });
    try {
      const errors = [];
      checkThemeManifestCoverage(errors, dir);
      assert.equal(errors.length, 1);
      assert.match(errors[0], /declares name "other" but its filename says "probe"/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  // The hole an independent checker found: `tier` is required by the schema and was
  // enforced by nothing, so deleting it from indaco.manifest.json dropped the DEFAULT
  // palette out of the Studio picker with every gate green.
  test('checkThemeManifestShape BITES: a missing required field, a bad enum, and an unknown key', () => {
    const { checkThemeManifestShape } = require('../../../tools/check-ownership.js');
    const noTier = baseManifest(); delete noTier.tier;
    for (const [label, manifest, pattern] of [
      ['missing tier', noTier, /missing required field `tier`/],
      ['bad enum', baseManifest({ tier: 'Curated' }), /is not one of "curated" \| "more"/],
      ['unknown field', baseManifest({ nonsense: 1 }), /unknown field `nonsense`/],
      ['bad swatch', baseManifest({ swatch: 'rebeccapurple' }), /does not match/],
      ['bad mode', baseManifest({ modes: ['sepia'] }), /which is not one of "light" \| "dark"/],
    ]) {
      const dir = fixture({ 'probe.css': BASE_CSS, 'probe.manifest.json': manifest });
      try {
        const errors = [];
        checkThemeManifestShape(errors, dir);
        assert.ok(errors.some((e) => pattern.test(e)), `${label}: expected ${pattern}, got ${JSON.stringify(errors)}`);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
    const clean = fixture({ 'probe.css': BASE_CSS, 'probe.manifest.json': baseManifest() });
    try {
      const errors = [];
      checkThemeManifestShape(errors, clean);
      assert.deepEqual(errors, []);
    } finally { fs.rmSync(clean, { recursive: true, force: true }); }
  });

  test('checkThemeRoles BITES: a lying role, a second @import, and a base with no tokens', () => {
    const { checkThemeRoles } = require('../../../tools/check-ownership.js');
    const cases = [
      ['variant-dark that declares tokens',
        { 'probe.css': ":root{--bg:#fff;}\n@import 'other';\n", 'probe.manifest.json': baseManifest({ role: 'variant-dark', extends: 'other', tier: undefined, darkCounterpart: undefined, order: undefined, swatch: undefined }) },
        /declares role "variant-dark" but declares 1 token\(s\) of its own/],
      ['derived-variant that declares none',
        { 'probe.css': "@import 'other';\n", 'probe.manifest.json': baseManifest({ role: 'derived-variant', extends: 'other', tier: undefined, darkCounterpart: undefined, order: undefined, swatch: undefined }) },
        /declares role "derived-variant" but overrides no tokens/],
      // The second hole: only the first @import was read, so a theme could inherit an
      // entirely different palette on line two with the declaration still "true".
      ['a smuggled second import',
        { 'probe.css': ":root{--bg:#fff;}\n@import 'lattice';\n@import 'carbone';\n", 'probe.manifest.json': baseManifest() },
        /@imports 'lattice' \+ 'carbone'\. A theme extends exactly one thing/],
      ['extends that disagrees with the file',
        { 'probe.css': "@import 'lattice';\n", 'probe.manifest.json': baseManifest({ role: 'variant-dark', extends: 'other', tier: undefined, darkCounterpart: undefined, order: undefined, swatch: undefined }) },
        /declares `extends: "other"` but @imports 'lattice'/],
      ['a listed palette with no swatch',
        { 'probe.css': BASE_CSS, 'probe.manifest.json': baseManifest({ swatch: undefined }) },
        /listed in the palette picker but declares no `swatch`/],
    ];
    for (const [label, files, pattern] of cases) {
      const dir = fixture(files);
      try {
        const errors = [];
        checkThemeRoles(errors, dir);
        assert.ok(errors.some((e) => pattern.test(e)), `${label}: expected ${pattern}, got ${JSON.stringify(errors)}`);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
  });

  test('checkThemeModes BITES: a declared face the CSS does not provide, and a phantom counterpart', () => {
    const { checkThemeModes } = require('../../../tools/check-ownership.js');
    const flat = ":root{\n  --bg: #1A1A1C;\n}\n@import 'lattice';\n:where(:root) { color-scheme: dark; }\n";
    const dir = fixture({ 'probe.css': flat, 'probe.manifest.json': baseManifest({ modes: ['light', 'dark'] }) });
    try {
      const errors = [];
      checkThemeModes(errors, dir);
      assert.equal(errors.length, 1);
      assert.match(errors[0], /declares modes \[dark, light\] but its CSS provides \[dark\]/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }

    const phantom = fixture({ 'probe.css': BASE_CSS, 'probe.manifest.json': baseManifest({ darkCounterpart: 'probe-dark' }) });
    try {
      const errors = [];
      checkThemeModes(errors, phantom);
      assert.ok(errors.some((e) => /themes\/probe-dark\.css does not exist/.test(e)));
    } finally { fs.rmSync(phantom, { recursive: true, force: true }); }
  });

  // The arm split is the whole basis of the `modes` claim. A naive
  // /light-dark\(([^,]+),([^)]+)\)/ truncates the second arm at the first `)`, so
  // `light-dark(var(--x), var(--x))` reads as TWO DIFFERENT arms and a palette that
  // lost its second face keeps its declared one with the gate green.
  test('splitLightDark handles nested parens and commas — the degenerate-arm false negative', () => {
    const { splitLightDark, themeArmsDiffer } = require('../../../tools/check-ownership.js');
    assert.deepEqual(splitLightDark('light-dark(#FFF, #000)'), ['#FFF', '#000']);
    assert.deepEqual(splitLightDark('light-dark(var(--x), var(--x))'), ['var(--x)', 'var(--x)']);
    assert.deepEqual(
      splitLightDark('light-dark(color-mix(in oklab, #fff 50%, #000), color-mix(in oklab, #fff 50%, #000))'),
      ['color-mix(in oklab, #fff 50%, #000)', 'color-mix(in oklab, #fff 50%, #000)'],
    );
    assert.equal(splitLightDark('#FFFFFF'), null);

    assert.equal(themeArmsDiffer(':root{--bg: light-dark(var(--x), var(--x));}'), false,
      'identical var() arms are degenerate — the naive regex called this two faces');
    assert.equal(themeArmsDiffer(':root{--bg: light-dark(#FFF, #000);}'), true);
    // …and a longer token name must never be read as a shorter one.
    assert.equal(themeArmsDiffer(':root{--panel-bg: light-dark(#FFF, #000);}'), false,
      '--panel-bg is not --bg');
  });

  test('themeRootScheme distinguishes a zero-specificity default from a pin', () => {
    const { themeRootScheme } = require('../../../tools/check-ownership.js');
    assert.deepEqual(themeRootScheme(':where(:root) { color-scheme: light; }'), { mode: 'light', pinned: false });
    assert.deepEqual(themeRootScheme(':root { color-scheme: dark; }'), { mode: 'dark', pinned: true });
    assert.deepEqual(themeRootScheme(':root:root { color-scheme: light; }'), { mode: 'light', pinned: true });
    assert.equal(themeRootScheme(':root { color: red; }'), null);
  });

  test('listThemeManifests refuses a non-object manifest by name, not by TypeError', () => {
    const { listThemeManifests } = require('../../../tools/check-ownership.js');
    for (const [body, shape] of [['null', 'null'], ['[]', 'an array'], ['42', 'number']]) {
      const dir = fixture({ 'probe.manifest.json': body });
      try {
        assert.throws(() => listThemeManifests(dir), new RegExp(`probe\\.manifest\\.json must be a JSON object \\(got ${shape}`));
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
  });
});

describe('no-safe-default token gate (#1457)', () => {
  const {
    noSafeDefaultTokens, rootScopedTokens, slideScopedTokens, isUnconditionalRoot, isSlideRoot,
    bareVarReads, mermaidMapTokenReads,
  } = require('../../../tools/check-ownership.js');

  // BITE-TESTS, not smoke tests. The arm this replaces would have passed while the
  // Studio shipped themes that painted solid black Mermaid clusters, so each test
  // below constructs the violation and asserts the arm names it — then asserts each
  // of the two legitimate exits (derive it, or give the read a fallback) silences it.
  const cssRead = (where, over = {}) => [{ where, kind: 'css', rootRead: false, chain: [], ...over }];
  const mapRead = (where) => [{ where, kind: 'map', chain: [] }];
  const inputs = (over = {}) => ({
    themeTokens: new Set(['c-container', 'bg']),
    rootDefaults: new Set(['bg']),
    slideDefaults: new Set(['bg']),
    mapDefaults: new Set(['bg']),
    bareReads: new Map([['c-container', cssRead('lib/x.css:1')], ['bg', cssRead('lib/x.css:2')]]),
    contract: new Set(['bg']),
    ...over,
  });

  test('BITES: a theme token with no engine default, read with no fallback, absent from the contract', () => {
    assert.deepEqual(noSafeDefaultTokens(inputs()), ['c-container']);
  });

  test('exit 1 — deriving the token (adding the contract row) silences it', () => {
    assert.deepEqual(noSafeDefaultTokens(inputs({ contract: new Set(['bg', 'c-container']) })), []);
  });

  test('exit 2 — giving every read a var() fallback silences it', () => {
    // A read WITH a fallback never enters `bareReads` at all; that is the mechanism
    // by which --cat-N-ink (no :root default anywhere, gated by checkCatInkFallback)
    // is correctly absent from this gate's findings.
    assert.deepEqual(noSafeDefaultTokens(inputs({ bareReads: new Map([['bg', cssRead('lib/x.css:2')]]) })), []);
  });

  test('an ENGINE :root default is a safe default — not reported', () => {
    assert.deepEqual(noSafeDefaultTokens(inputs({
      rootDefaults: new Set(['bg', 'c-container']),
      slideDefaults: new Set(['bg', 'c-container']),
      mapDefaults: new Set(['bg', 'c-container']),
    })), []);
  });

  // The false positive a `:root`-only model would produce: `--spectrum-quiet` is defaulted
  // on the bare `section` slide root, so it IS defaulted for every CSS read — but a model
  // that only counted `:root` would demand a contract row for it, and neither of the gate's
  // two exits would be correct. (base.variants.css used to invite a theme to override the
  // token; that invitation was false and was corrected in #1546 — `section` is a descendant
  // of `:root`, so the engine's declaration wins. The distinction below is unaffected.)
  test('a `section` slide-root default satisfies a CSS read, but NOT a Mermaid-map read', () => {
    const sectionOnly = { rootDefaults: new Set(['bg']), slideDefaults: new Set(['bg', 'c-container']), mapDefaults: new Set(['bg']) };
    assert.deepEqual(noSafeDefaultTokens(inputs(sectionOnly)), [],
      'a bare `section` declaration is a real default for a CSS var() read');
    assert.deepEqual(
      noSafeDefaultTokens(inputs({ ...sectionOnly, bareReads: new Map([['c-container', mapRead('map.js')]]) })),
      ['c-container'],
      'the Mermaid reader parses :root blocks out of the palette TEXT — a `section` rule is invisible to it',
    );
  });

  // Custom properties resolve on the element that USES them, and `:root` is `html` —
  // an ANCESTOR of `section`. So a `section { --x }` default cannot reach a
  // `var(--x)` written inside a `:root` rule, which is exactly where --spectrum and
  // --spectrum-vertical are read (base.variants.css's --sp-fill-rainbow-*). Deciding
  // per TOKEN rather than per READ would let one `section` declaration excuse the
  // very tokens whose absence loses the canvas.
  test('a `section` default does NOT satisfy a read made inside a :root block', () => {
    const sectionOnly = { rootDefaults: new Set(['bg']), slideDefaults: new Set(['bg', 'c-container']), mapDefaults: new Set(['bg']) };
    assert.deepEqual(
      noSafeDefaultTokens(inputs({ ...sectionOnly, bareReads: new Map([['c-container', cssRead('lib/x.css:1', { rootRead: true })]]) })),
      ['c-container'],
    );
  });

  // A fallback is only as safe as what it RESOLVES to. `var(--x, var(--cat-1-fill))`
  // is safe because the chain lands on a contract token; `var(--x, )` and
  // `var(--x, var(--never-declared))` are both invalid at computed-value time.
  test('a fallback CHAIN is rescued only when it lands on something that resolves', () => {
    const chained = (chain) => new Map([['c-container', cssRead('lib/x.css:1', { chain })]]);
    assert.deepEqual(noSafeDefaultTokens(inputs({ bareReads: chained(['bg']) })), [],
      'a chain landing on a contract token resolves');
    assert.deepEqual(noSafeDefaultTokens(inputs({ bareReads: chained(['never-declared']) })), ['c-container'],
      'a chain landing on an undefined token is invalid at computed-value time');
    assert.deepEqual(noSafeDefaultTokens(inputs({ bareReads: chained([]) })), ['c-container'],
      'an empty fallback is not a fallback');
  });

  // #1545 — the gate's SECOND exit, made auditable.
  //
  // Exit 2 (give the read a var() fallback) is HARD-RULE-#3-legal, costs ten seconds, and
  // permanently removes the token from the gate's view. That is the exact construction
  // that produced the defect the gate exists to prevent: --cat-N-ink had a fallback at
  // every read and was STILL missing from the generator for a year. These pin the ledger
  // that makes taking the exit a recorded decision — and, like every allowlist in this
  // file, that it fails on a STALE entry as well as an unlisted one.
  describe('fallbackOnlyTokens — the ledger for the cheap exit', () => {
    const { fallbackOnlyTokens, SANCTIONED_FALLBACK_READS } = require('../../../tools/check-ownership.js');
    const chainRead = (where, chain) => [{ where, kind: 'css', rootRead: false, chain }];

    test('REPORTS a theme token whose only rescue is a fallback chain', () => {
      const found = fallbackOnlyTokens(inputs({ bareReads: new Map([['c-container', chainRead('lib/x.css:1', ['bg'])]]) }));
      assert.deepEqual(found.map((f) => f.token), ['c-container']);
      assert.deepEqual(found[0].chain, ['bg'], 'it reports what the fallback lands on, which is the thing to justify');
    });

    test('does NOT report a token the ENGINE defaults — that is not taking the cheap exit', () => {
      const found = fallbackOnlyTokens(inputs({
        slideDefaults: new Set(['bg', 'c-container']),
        bareReads: new Map([['c-container', chainRead('lib/x.css:1', ['bg'])]]),
      }));
      assert.deepEqual(found, [], 'an engine default rescues the read on its own; the fallback is incidental');
    });

    test('does NOT report a token the gate itself already fires on', () => {
      // An UNrescued read is the loud path. Reporting it here too would ask for a
      // justification for a token that is failing the gate outright.
      const found = fallbackOnlyTokens(inputs({ bareReads: new Map([['c-container', chainRead('lib/x.css:1', ['never-declared'])]]) }));
      assert.deepEqual(found, [], 'an unresolvable chain is a gate failure, not a ledger entry');
    });

    test('does NOT report a token already in the contract', () => {
      const found = fallbackOnlyTokens(inputs({
        contract: new Set(['bg', 'c-container']),
        bareReads: new Map([['c-container', chainRead('lib/x.css:1', ['bg'])]]),
      }));
      assert.deepEqual(found, [], 'deriving the token is exit 1 — nothing to justify');
    });

    test('the SANCTIONED entry\'s `fallback` is enforced against the real tree, not just recorded', () => {
      // The finding that made this arm exist: re-point one read at a different-contract
      // token and every OTHER arm stays green — the chain still resolves, the token is
      // still fallback-only, the sanction is still live — while the recorded justification
      // silently becomes false. That is the --cat-N-ink construction.
      const { checkNoSafeDefaultTokens, SANCTIONED_FALLBACK_READS } = require('../../../tools/check-ownership.js');
      const entry = SANCTIONED_FALLBACK_READS.find((e) => e.token === 'cat-1-texture');
      assert.ok(entry, 'expected a --cat-1-texture sanction to mutate');
      const real = entry.fallback;
      entry.fallback = 'cat-1-mark';
      try {
        const errors = [];
        checkNoSafeDefaultTokens(errors);
        assert.ok(
          errors.some((e) => /falls back to --cat-1-mark, but/.test(e)),
          `a sanction naming the wrong fallback must fail; got: ${errors.join(' | ') || '(no errors)'}`,
        );
      } finally {
        entry.fallback = real;
      }
    });

    // The evasion the red team found: `bareVarReads` used to SKIP any chain bottoming out in
    // a literal, so `var(--cat-1-texture, var(--cat-1-mark, transparent))` re-pointed the read
    // at a different-contract token and every arm stayed green — while the committed
    // justification, which says it lands on the same-role fill and NOT on a mark, went false.
    // That is the --cat-N-ink construction, inside the change built to surface it. And it is
    // the form `checkNoSafeDefaultTokens`'s own remediation text recommends.
    test('a literal-TAILED fallback chain is still compared against the sanction', () => {
      const litRead = (where, chain) => [{ where, kind: 'css', rootRead: false, chain, endsLiteral: true }];
      const found = fallbackOnlyTokens(inputs({ bareReads: new Map([['c-container', litRead('lib/x.css:1', ['other'])]]) }));
      assert.equal(found.length, 1, 'a literal-tailed chain is still taking the cheap exit');
      assert.deepEqual(found[0].reads[0].chain, ['other'], 'and the ledger must see what it points at');
    });

    test('a literal-terminated read is RESCUED for the main gate — behavior unchanged', () => {
      // Recording these reads must not make the gate itself start reporting them: a chain
      // ending in a literal always resolves, which is why they were skipped in the first place.
      const litOnly = new Map([['c-container', [{ where: 'lib/x.css:1', kind: 'css', rootRead: false, chain: [], endsLiteral: true }]]]);
      assert.deepEqual(noSafeDefaultTokens(inputs({ bareReads: litOnly })), [],
        'a literal fallback resolves, so the no-safe-default gate must stay silent');
    });

    // The line between the two literal-terminated shapes. `var(--x, var(--y, transparent))`
    // HOPS THROUGH a token, and that hop is what can silently drift onto a different
    // contract — the --cat-N-ink defect. `var(--x, color-mix(… var(--text-heading)))` has no
    // hop: the fallback is the value, written at the read, with no second token to drift
    // onto. Requiring a ledger row for the second would tax the safest form of the pattern.
    // Live example of the second: --chart-catN-ink (chart-family.css).
    test('an inline-EXPRESSION fallback with no token hop is not ledger population', () => {
      const expr = new Map([['c-container', [{ where: 'lib/x.css:1', kind: 'css', rootRead: false, chain: [], endsLiteral: true }]]]);
      assert.deepEqual(fallbackOnlyTokens(inputs({ bareReads: expr })), [],
        'no second token to drift onto — nothing a ledger row could say');
    });

    test('a synthetic themesDir does not drag the global ledger in with it', () => {
      // The seam exists so the gate can be bitten with synthetic input. Comparing a
      // repo-wide constant against a made-up palette would emit one stale error per row.
      const { checkNoSafeDefaultTokens } = require('../../../tools/check-ownership.js');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-seam-'));
      fs.writeFileSync(path.join(dir, 'synthetic.css'), ':root { --accent: red; --bg: white; }\n');
      const errors = [];
      checkNoSafeDefaultTokens(errors, { themesDir: dir });
      assert.equal(errors.filter((e) => /stale fallback sanction/.test(e)).length, 0,
        'the ledger must not fire against a themes dir it was never written for');
    });

    test('every sanctioned entry carries the two things that make it a record', () => {
      assert.ok(SANCTIONED_FALLBACK_READS.length, 'the ledger must not be empty while the population is');
      for (const s of SANCTIONED_FALLBACK_READS) {
        assert.ok(s.token && !s.token.startsWith('--'), `${s.token}: bare token name, no leading --`);
        assert.ok(s.fallback, `--${s.token}: must name what the fallback LANDS ON`);
        assert.ok(s.why && s.why.length > 80, `--${s.token}: must say why that value carries the read's contract`);
      }
    });

    // NO end-to-end "the ledger matches the live tree" test here: the suite already runs
    // `checkNoSafeDefaultTokens(errors)` over the real repo further down this file, and that
    // call fails on an unlisted token, a stale sanction AND a diverged fallback alike. A
    // second identical call would be documentation, not coverage (HARD RULE #15).
    test('every read is carried, not just the first — a divergent chain on read N is the point', () => {
      const two = new Map([['c-container', [
        { where: 'lib/a.css:1', kind: 'css', rootRead: false, chain: ['bg'] },
        { where: 'lib/b.css:9', kind: 'css', rootRead: false, chain: ['other'] },
      ]]]);
      const found = fallbackOnlyTokens(inputs({ contract: new Set(['bg', 'other']), bareReads: two }));
      assert.equal(found.length, 1);
      assert.deepEqual(found[0].reads.map((r) => r.chain[0]), ['bg', 'other'],
        'the gate compares the sanctioned fallback against EVERY read; reporting only the first would hide drift');
    });
  });

  test('parseVarChain reads the chain, and a literal terminal ends it', () => {
    const { parseVarChain } = require('../../../tools/check-ownership.js');
    assert.deepEqual(parseVarChain('--x'), { token: 'x', chain: [], endsLiteral: false });
    assert.deepEqual(parseVarChain('--x, '), { token: 'x', chain: [], endsLiteral: false });
    assert.deepEqual(parseVarChain('--x, red'), { token: 'x', chain: [], endsLiteral: true });
    assert.deepEqual(parseVarChain('--x, var(--y)'), { token: 'x', chain: ['y'], endsLiteral: false });
    assert.deepEqual(parseVarChain('--x, var(--y, #000)'), { token: 'x', chain: ['y'], endsLiteral: true });
  });

  // A :root default wrapped in an at-rule is still a default. HARD RULE #26
  // anticipates a coordinated @layer activation pass; the first cut of this arm read
  // only top-level rules, so wrapping base.tokens.css in `@layer tokens { … }`
  // produced 15 false positives on a gate that has no allowlist.
  test('at-rule bodies are recursed, and :is(:root) counts, but @keyframes does not', () => {
    assert.deepEqual([...rootScopedTokens('@layer tokens { :root { --a: 1 } }')], ['a']);
    assert.deepEqual([...rootScopedTokens('@media (min-width: 1px) { :root { --b: 1 } }')], ['b']);
    assert.deepEqual([...rootScopedTokens('@supports (color: red) { :root { --c: 1 } }')], ['c']);
    assert.deepEqual([...rootScopedTokens('@keyframes k { from { --d: 1 } }')], []);
    assert.ok(isUnconditionalRoot(':is(:root)'));
  });

  test('a declaration in a NESTED rule is not harvested as the outer block\'s', () => {
    assert.deepEqual([...rootScopedTokens(':root { --a: 1; .x { --b: 2 } }')], ['a']);
    assert.deepEqual([...slideScopedTokens('section { --a: 1; &.dark { --b: 2 } }')], ['a']);
  });

  // The gate's :root model must not be MORE permissive than the export reader it
  // models: parsePaletteVars matches /:root\s*\{/, so :root must sit immediately
  // before the brace.
  test('isExportParsedRoot matches what the export path actually parses', () => {
    const { isExportParsedRoot } = require('../../../tools/check-ownership.js');
    const parsed = (sel) => new RegExp(`${sel}\\s*\\{`).source && /:root\s*\{/.test(`${sel} {`);
    for (const sel of [':root', ':root:root', 'section, :root']) {
      assert.equal(isExportParsedRoot(sel), true, sel);
      assert.equal(parsed(sel), true, `${sel} must also match the emulator's own regex`);
    }
    for (const sel of [':root, section', ':where(:root)', 'section']) {
      assert.equal(isExportParsedRoot(sel), false, sel);
      assert.equal(parsed(sel), false, `${sel} must also miss the emulator's own regex`);
    }
  });

  test('a token no palette declares is not the theme contract\'s business', () => {
    // Per-element locals the transformer writes as inline style (--actor-color,
    // --pct) are read bare and defaulted nowhere; they are engine internals, and
    // the theme-vocabulary filter is what keeps them out of a theme gate.
    assert.deepEqual(noSafeDefaultTokens(inputs({ themeTokens: new Set(['bg']) })), []);
  });

  // A literal-terminated read is RECORDED and FLAGGED rather than skipped (#1545). It is
  // still not a no-safe-default hit — `noSafeDefaultTokens` treats `endsLiteral` as rescued,
  // because a chain bottoming out in a literal always resolves — but the fallback LEDGER has
  // to see it: `var(--x, var(--y, transparent))` is a cheap-exit fallback pointing at --y,
  // and skipping it let a sanctioned token be silently re-pointed at a different-contract
  // token with the gate green.
  test('bareVarReads flags a literal-terminated read rather than dropping it', () => {
    const reads = bareVarReads('a{color:var(--one)}\nb{color:var(--two, red)}\nc{color:var( --three )}', 'f.css');
    assert.deepEqual([...reads.keys()].sort(), ['one', 'three', 'two']);
    assert.equal(reads.get('one')[0].where, 'f.css:1');
    assert.equal(reads.get('one')[0].kind, 'css');
    assert.equal(reads.get('one')[0].rootRead, false);
    assert.equal(reads.get('one')[0].endsLiteral, false, 'a bare read is not literal-terminated');
    assert.equal(reads.get('two')[0].endsLiteral, true, 'a literal fallback is flagged, not dropped');
  });

  // The first cut stripped comments by DELETING them, newlines included, so every
  // reported line was shifted by the comment volume above it — and a wrong number was
  // copied straight out of the gate into a decision record.
  test('bareVarReads reports the line in the REAL file, not the comment-stripped one', () => {
    const css = '/* one\n * two\n * three\n */\na { color: var(--x) }';
    assert.equal(bareVarReads(css, 'f.css').get('x')[0].where, 'f.css:5');
  });

  test('bareVarReads records WHERE a read sits, so the per-read rule can be applied', () => {
    const reads = bareVarReads(':root { --a: var(--x) }\nsection { --b: var(--y) }', 'f.css');
    assert.equal(reads.get('x')[0].rootRead, true);
    assert.equal(reads.get('y')[0].rootRead, false);
  });

  test('the Mermaid map counts as a fallback-free reader, joinVars included', () => {
    // Sourced from the map's own diagramThemeTokens(), so a `joinVars` entry — which
    // travels through the same readToken and the same black sentinel — cannot be
    // missed the way a `{ var: '…' }` regex missed it.
    const { diagramThemeTokens } = require('../../../lib/core/mermaid-theme-map.js');
    const tokens = diagramThemeTokens();
    assert.ok(tokens.includes('c-container'), 'the map must still read the containment fill');
    assert.ok(tokens.includes('cat-1-mark'), 'and a joinVars-only token must be present');
    const reads = mermaidMapTokenReads(['c-container'], 'map.js');
    assert.deepEqual([...reads.keys()], ['c-container']);
    assert.equal(reads.get('c-container')[0].kind, 'map');
  });

  test('isUnconditionalRoot: a specificity pin and a :where() default both count; a class-gated root does not', () => {
    assert.ok(isUnconditionalRoot(':root'));
    assert.ok(isUnconditionalRoot(':root:root'));            // a11y-base's hard pin
    assert.ok(isUnconditionalRoot(':where(:root)'));         // zero-specificity default
    assert.ok(isUnconditionalRoot(':root, section'));        // one part is enough
    assert.ok(!isUnconditionalRoot(':root.print'));          // waits for a class
    assert.ok(!isUnconditionalRoot('section.print'));
  });

  test('isSlideRoot additionally accepts the bare `section`, but never a banded one', () => {
    assert.ok(isSlideRoot(':root'));
    assert.ok(isSlideRoot('section'));
    assert.ok(isSlideRoot(':where(section)'));
    assert.ok(!isSlideRoot('section.print'));
    assert.ok(!isSlideRoot('section .card'));
    assert.ok(!isUnconditionalRoot('section'), 'and `section` is NOT a :root default');
  });

  test('rootScopedTokens / slideScopedTokens read the blocks they claim to', () => {
    const css = ':root{--a:1}\nsection.print{--b:2}\n:where(:root){--c:3}\n:root.x{--d:4}\nsection{--e:5}';
    assert.deepEqual([...rootScopedTokens(css)].sort(), ['a', 'c']);
    assert.deepEqual([...slideScopedTokens(css)].sort(), ['a', 'c', 'e']);
  });

  // Every input is an intersection term, so an empty one makes the gate report clean.
  // A gate that cannot fail is also a claim.
  test('the assembled gate FAILS LOUD when a scan comes back empty', () => {
    const { checkNoSafeDefaultTokens } = require('../../../tools/check-ownership.js');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-safe-default-'));
    try {
      // A themes dir whose only palette declares nothing at :root.
      fs.writeFileSync(path.join(dir, 'empty.css'), 'section.print { --x: red; }\n');
      const errors = [];
      checkNoSafeDefaultTokens(errors, { themesDir: dir });
      assert.equal(errors.length, 1);
      assert.match(errors[0], /empty input set/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('the shipped tree is clean — REQUIRED_TOKENS covers every no-safe-default token', () => {
    const { checkNoSafeDefaultTokens } = require('../../../tools/check-ownership.js');
    const errors = [];
    checkNoSafeDefaultTokens(errors);
    assert.deepEqual(errors, []);
  });
});

// ── e2e fixed-sleep ratchet (#1575) ───────────────────────────────────────────────
// A gate only proves something if you can watch it fail, so every direction is driven
// against a synthetic tree rather than only asserting the shipped one is clean.
describe('check-ownership: checkE2ESleeps (#1575)', () => {
  const { checkE2ESleeps, e2eSleepCensus, SANCTIONED_E2E_SLEEPS } = require('../../../tools/check-ownership.js');
  const mkTree = (files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-sleeps-'));
    for (const [name, body] of Object.entries(files)) {
      const full = path.join(dir, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, body);
    }
    return dir;
  };

  test('the live tree is fully sanctioned', () => {
    const errors = [];
    checkE2ESleeps(errors);
    assert.deepEqual(errors, [], 'every fixed e2e sleep must carry a SANCTIONED_E2E_SLEEPS entry');
  });

  test('counts a helper sleep at its CALL SITES, not once textually', () => {
    // The whole reason this gate exists rather than a grep: #1526 recorded back-gesture as
    // "14" while 23 fixed waits sat behind one `settle`.
    const dir = mkTree({
      'a.spec.ts': [
        'const settle = (page) => page.waitForTimeout(650);',
        'test("x", async ({ page }) => {',
        '  await settle(page);',
        '  await settle(page);',
        '  await settle(page);',
        '});',
      ].join('\n'),
    });
    const census = e2eSleepCensus(dir);
    assert.equal(census.length, 1, 'one (file, duration) row');
    assert.equal(census[0].count, 3, 'weighted by call sites, not by the single declaration');
    assert.equal(census[0].via, 'settle', 'and it names the helper it counted through');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('CANARY — an UNLISTED sleep fails the gate', () => {
    const dir = mkTree({ 'new.spec.ts': 'await page.waitForTimeout(1234);' });
    const errors = [];
    checkE2ESleeps(errors, dir, []);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /unsanctioned fixed wait/);
    assert.match(errors[0], /1234ms/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('CANARY — a STALE entry whose sleep is gone fails the gate', () => {
    const dir = mkTree({ 'a.spec.ts': 'const x = 1;' });
    const errors = [];
    checkE2ESleeps(errors, dir, [{ file: 'gone.spec.ts', ms: 500, count: 1, why: 'x' }]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /stale e2e-sleep sanction/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('CANARY — a DRIFTED count fails, which is the case a text grep cannot see', () => {
    // Same file, same duration, one extra call of the helper. Nothing textual changed about
    // the `waitForTimeout(` line itself.
    const body = (n) => [
      'const settle = (page) => page.waitForTimeout(650);',
      ...Array.from({ length: n }, () => '  await settle(page);'),
    ].join('\n');
    const dir = mkTree({ 'a.spec.ts': body(4) });
    const rel = path.relative(process.cwd(), path.join(dir, 'a.spec.ts')).replace(/\\/g, '/');
    const errors = [];
    checkE2ESleeps(errors, dir, [{ file: rel, ms: 650, count: 3, why: 'x' }]);
    assert.equal(errors.length, 1, 'the extra call site must be reported');
    assert.match(errors[0], /now has 4 fixed wait\(s\) of 650ms, but SANCTIONED_E2E_SLEEPS records 3/);
    assert.match(errors[0], /settle/, 'and it names the helper so the reader can find them');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('run() actually invokes the gate — it is wired into build:check', () => {
    // The repo has been bitten by a gate that existed and was never called (noted at the
    // checkAgentModelPinning wiring test, found by the maker-checker pass on #1187). Assert
    // the wiring, not just the function.
    const src = fs.readFileSync(path.join(__dirname, '../../../tools/check-ownership.js'), 'utf8');
    assert.match(src, /^\s*checkE2ESleeps\(errors\);$/m, 'checkE2ESleeps must be called from run()');
  });

  test('a NON-LITERAL duration is still counted — the one-token bypass is closed', () => {
    // `waitForTimeout(SETTLE_STEP_MS)` in studio-header-fit escaped both #1526's census and
    // this gate's own first regex. Renaming a literal to a constant must not leave the ledger.
    const dir = mkTree({ 'a.spec.ts': 'const MS = 500;\nawait page.waitForTimeout(MS);' });
    const census = e2eSleepCensus(dir);
    assert.equal(census.length, 1);
    assert.equal(census[0].ms, 'MS', 'keyed by the expression text, not dropped');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a `function` helper counts at its call sites too, not just an arrow', () => {
    // studio-fixture.ts writes every shared helper as `export function`, so an arrow-only
    // rule would count the house style as 1.
    const dir = mkTree({
      'a.spec.ts': [
        'async function settle(page) { await page.waitForTimeout(650); }',
        'await settle(p); await settle(p); await settle(p);',
      ].join('\n'),
    });
    const census = e2eSleepCensus(dir);
    assert.equal(census[0].count, 3);
    assert.equal(census[0].via, 'settle');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('a body that merely CONTAINS a sleep is not a helper — no false multiplication', () => {
    // The regex version attributed a sleep to any nearby declaration, inflating unrelated
    // counts. Only a function whose ENTIRE body is the sleep is a sleep helper.
    const dir = mkTree({
      'a.spec.ts': [
        'async function readSettled(page) {',
        '  await page.waitForTimeout(100);',
        '  return read(page);',
        '}',
        'await readSettled(p); await readSettled(p);',
      ].join('\n'),
    });
    const census = e2eSleepCensus(dir);
    assert.equal(census[0].count, 1, 'counted once — the function does more than sleep');
    assert.equal(census[0].via, undefined);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('comments and strings are not code — and a regex literal does not swallow the file', () => {
    // Both directions of a hand-rolled lexer's failure. The backtick-bearing regex is the
    // real shape from studio-preview-perf.spec.ts:72 that hid four sleeps behind a
    // blanker that read it as a template literal.
    const dir = mkTree({
      'a.spec.ts': [
        '// await page.waitForTimeout(9999);',
        "const s = 'page.waitForTimeout(8888)';",
        'if (/^\\s*(```|~~~)/.test(line)) fence = !fence;',
        'await page.waitForTimeout(700);',
      ].join('\n'),
    });
    const census = e2eSleepCensus(dir);
    assert.deepEqual(census.map((r) => r.ms), [700], 'only the real call counts, and it is still seen');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('an EXPORTED sleep helper is counted across the whole directory', () => {
    const dir = mkTree({
      'fixture.ts': 'export const settle = (page) => page.waitForTimeout(650);',
      'a.spec.ts': "import { settle } from './fixture';\nawait settle(p); await settle(p);",
      'b.spec.ts': "import { settle } from './fixture';\nawait settle(p);",
    });
    const census = e2eSleepCensus(dir);
    assert.equal(census.length, 1);
    assert.equal(census[0].count, 3, 'three call sites across two importing specs');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('.mts / .cts / .jsx specs are walked — Playwright testMatch admits them', () => {
    const dir = mkTree({
      'a.spec.mts': 'await page.waitForTimeout(111);',
      'b.spec.cts': 'await page.waitForTimeout(222);',
      'c.spec.jsx': 'await page.waitForTimeout(333);',
    });
    assert.deepEqual(e2eSleepCensus(dir).map((r) => r.ms).sort((x, y) => x - y), [111, 222, 333]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('CANARY — an UNPARSABLE file fails loudly instead of shrinking the census', () => {
    // `ts.createSourceFile` is error-TOLERANT: it recovers and returns a partial tree without
    // throwing, so before the sentinel a malformed spec contributed zero sleeps and the ledger
    // quietly got smaller. Third time this census could miss a sleep silently — hence a test.
    const dir = mkTree({
      'valid.spec.ts': 'await page.waitForTimeout(1234);',
      'broken.spec.ts': 'export function oops( {\nawait page.waitForTimeout(4321);',
    });
    assert.throws(() => e2eSleepCensus(dir), /could not parse 1 e2e file\(s\)/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('KNOWN LIMIT — runtime multiplicity is not modelled', () => {
    // A sleep in a loop executes N times and counts once. Pinned so the limit is recorded
    // rather than discovered later and mistaken for a bug.
    const dir = mkTree({ 'a.spec.ts': 'for (let i = 0; i < 40; i++) await page.waitForTimeout(100);' });
    assert.equal(e2eSleepCensus(dir)[0].count, 1);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('every sanction carries a justification, and UNJUDGED ones say so', () => {
    for (const s of SANCTIONED_E2E_SLEEPS) {
      assert.ok(s.why && s.why.length > 20, `${s.file} ${s.ms}ms needs a real justification`);
      assert.ok(typeof s.count === 'number' && s.count > 0, `${s.file} ${s.ms}ms needs a count`);
    }
    // The seeding is honest about what nobody has examined — that ambiguity is the thing
    // this gate exists to remove, so it must be visible rather than implied by silence.
    assert.ok(
      SANCTIONED_E2E_SLEEPS.some((s) => s.why.startsWith('UNJUDGED')),
      'inherited-but-unexamined sleeps must be labelled, not quietly blessed',
    );
  });
});
