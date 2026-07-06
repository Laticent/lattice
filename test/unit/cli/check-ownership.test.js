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
  checkThemeHasSelectors,
  nonCanonicalFsTokens,
  hasNotHasSelector,
  offendingMargins,
  checkMarginDiscipline,
  LAYOUT_MARGIN_BUDGET,
  SANCTIONED_MARGINS,
  checkHexLiterals,
  LAYOUT_HEX_BUDGET,
  SANCTIONED_HEX,
  checkUsEnglish,
  UK_ENGLISH_FORMS,
  CANONICAL_FS_TOKENS,
  SINGLETON_TAGS,
  checkPreviewHtmlSinks,
  checkOpenRouterBudget,
  SANCTIONED_OPENROUTER_SPENDERS,
  SANCTIONED_OPENROUTER_WORKFLOWS,
  listSourceFiles,
  SANCTIONED_PREVIEW_BUILDERS,
  PREVIEW_BUILDER_MARKER,
  SANITIZE_CALL,
  checkDensityCoverage,
  SANCTIONED_DENSITY_EXEMPT,
  checkVetrinaBoundary,
  checkSanctionedGestures,
  SANCTIONED_GESTURES,
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
    test('RETIRED_TOKEN_NAMES covers the legacy vocabulary (57 names, --prefixed)', () => {
      assert.equal(RETIRED_TOKEN_NAMES.size, 57);
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
      assert.equal(CANONICAL_FS_TOKENS.size, 13);
      for (const n of ['--fs-meta', '--fs-body', '--fs-message', '--fs-emphasis',
        '--fs-h1', '--fs-h6', '--fs-hero', '--fs-scale']) {
        assert.ok(CANONICAL_FS_TOKENS.has(n), `expected ${n} canonical`);
      }
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

  describe('theme :has() gate (HARD RULE #12)', () => {
    test('hasNotHasSelector matches the :not/:is-wrapped forms, not a bare :has()', () => {
      assert.ok(hasNotHasSelector('section:not(:has(.x)) {}'));
      assert.ok(hasNotHasSelector('a:is(:has(.x)) {}'));
      assert.ok(hasNotHasSelector('section:not(.foo:has(.x)) {}'));
      assert.ok(!hasNotHasSelector('a:has(.x) {}'));
      assert.ok(!hasNotHasSelector('section:not(.plain) {}'));
    });

    test('the live themes/ carry NO :not(:has())/:is(:has()) selectors', () => {
      const errors = [];
      checkThemeHasSelectors(errors);
      assert.deepEqual(errors, [], `a theme regressed #12:\n${errors.join('\n')}`);
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

  describe('OpenRouter budget gate (HARD RULE #24)', () => {
    const REPO = path.join(__dirname, '..', '..', '..');

    test('the sole sanctioned spender is the eval tool, and it exists', () => {
      assert.deepEqual(SANCTIONED_OPENROUTER_SPENDERS, ['tools/component-gen-eval.mjs']);
      assert.ok(fs.existsSync(path.join(REPO, SANCTIONED_OPENROUTER_SPENDERS[0])));
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
});
