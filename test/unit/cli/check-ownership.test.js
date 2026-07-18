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
  checkMarginDiscipline,
  LAYOUT_MARGIN_BUDGET,
  SANCTIONED_MARGINS,
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
  run,
} = require('../../../tools/check-ownership');
const { loadAll } = require('../../../lib/components');
const fs = require('node:fs');
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
      assert.deepEqual(SANCTIONED_OPENROUTER_SPENDERS, ['tools/component-gen-eval.mjs', 'tools/generate-voice-samples.mjs']);
      for (const rel of SANCTIONED_OPENROUTER_SPENDERS) assert.ok(fs.existsSync(path.join(REPO, rel)), `${rel} is sanctioned but missing`);
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

    test('fires on a file with the wrong extension for the engine\'s declared audioFormat', () => {
      withSandboxedSamplesDir(() => {
        // gemini declares audioFormat: "wav" — a stray .mp3 there is as orphaned as a retired voice id.
        const dir = path.join(SAMPLES_DIR, 'gemini');
        fs.mkdirSync(dir, { recursive: true });
        for (const v of ['Puck', 'Charon', 'Kore', 'Aoede', 'Fenrir', 'Leda', 'Orus', 'Zephyr', 'Umbriel', 'Autonoe']) {
          fs.writeFileSync(path.join(dir, `${v}.wav`), 'x');
        }
        fs.writeFileSync(path.join(dir, 'Puck.mp3'), 'x'); // wrong extension
        const errors = [];
        checkVoiceSampleAssets(errors);
        assert.ok(errors.some((e) => /gemini\/Puck\.mp3 is a stale\/orphaned sample/.test(e)));
        assert.ok(!errors.some((e) => /gemini\/Puck\.wav is missing/.test(e))); // the correctly-named file still satisfies the roster
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

    test('every core (non-test) file imports only in-folder `./` or `node:` specifiers', () => {
      for (const file of listSourceFiles(ANIMA_DIR)) {
        if (/\.test\.[tj]s$/.test(file)) continue;
        for (const spec of scan(fs.readFileSync(file, 'utf8'))) {
          assert.ok(spec.startsWith('./') || spec.startsWith('node:'), `${path.relative(ANIMA_DIR, file)} imports '${spec}' — must be in-folder`);
        }
      }
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

    test('the alphabet is frozen at five, each carrying a meaning', () => {
      const keys = Object.keys(SANCTIONED_GESTURES);
      assert.equal(keys.length, 5, 'exactly five gestures');
      assert.deepEqual(keys.sort(), ['check', 'circle', 'cross', 'shake', 'wave']);
      for (const [g, meaning] of Object.entries(SANCTIONED_GESTURES)) {
        assert.ok(typeof meaning === 'string' && meaning.length > 0, `${g} declares a meaning`);
      }
    });

    test('the registry and the stage.ts union are isomorphic', () => {
      assert.deepEqual(declaredGestures(stageSrc()), new Set(Object.keys(SANCTIONED_GESTURES)));
    });

    test('the gate bites: a new unsanctioned member (spin) in the union is flagged', () => {
      const declared = declaredGestures("export type Gesture = 'wave' | 'circle' | 'check' | 'cross' | 'shake' | 'spin';");
      const sanctioned = new Set(Object.keys(SANCTIONED_GESTURES));
      const orphans = [...declared].filter((g) => !sanctioned.has(g));
      assert.deepEqual(orphans, ['spin'], 'spin has no sanctioned meaning → gate flags it');
    });

    test('the gate bites: a stale registry entry the union dropped is flagged', () => {
      const declared = declaredGestures("export type Gesture = 'wave' | 'circle' | 'check' | 'cross';"); // shake removed
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
      // light arm is a color-mix() this static resolver can't evaluate → null (fail-closed),
      // NOT a wrong hex silently harvested from inside the color-mix.
      assert.equal(catResolve(map, '--x', 'light'), null);
      // dark arm is a plain hex and must resolve correctly despite the commas in the light arm.
      assert.equal(catResolve(map, '--x', 'dark'), '#123456');
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
});
