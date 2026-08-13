/**
 * Unit: the `%%{init}%%` reconciliation kernel (#1311).
 *
 * The bug: any author `%%{init}%%` in a fence made the PDF path skip the
 * engine's `themeVariables` entirely, so a directive that touched nothing but
 * curve style dropped the whole palette and the figure rendered in Mermaid's
 * stock colors — silently, because the diagram still rendered.
 *
 * These tests pin the merge CONTRACT (what goes in the source, and in what
 * order). The behavioral proof that Mermaid then resolves the merged source to
 * theme tokens lives in test/integration/mermaid/mermaid-init-merge.test.js,
 * which renders through mmdc and reads the emitted `.cluster rect` fill.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');

const {
  DIRECTIVE_VALUE_OK,
  DIAGRAM_FONT_STACK,
  readAuthorInit,
  authorPinsTheme,
  engineInitConfig,
  engineInitDirective,
  withEngineInit,
} = require('../../../lib/integrations/mermaid/init-directive');

const VARS = { primaryColor: 'rgb(1, 2, 3)', clusterBkg: '#F2F5FA' };
const ENGINE = engineInitConfig(VARS);

// The payload of the FIRST `%%{init: …}%%` in a string, parsed.
function firstPayload(src) {
  const m = /%%\{\s*init:\s*([\s\S]*?)\}%%/.exec(src);
  assert.ok(m, `expected an init directive in:\n${src}`);
  return JSON.parse(m[1]);
}

describe('mermaid init-directive: readAuthorInit', () => {
  test('reports absent when the source has no directive', () => {
    assert.deepEqual(readAuthorInit('flowchart TB\n  A --> B'), { present: false, config: null });
  });

  test('a plain `%%` comment is not an init directive', () => {
    assert.equal(readAuthorInit('%% just a comment\nflowchart TB').present, false);
  });

  test('parses a JSON payload', () => {
    const { present, config } = readAuthorInit('%%{init: {"flowchart": {"curve": "linear"}}}%%\nflowchart TB');
    assert.equal(present, true);
    assert.deepEqual(config, { flowchart: { curve: 'linear' } });
  });

  test("parses mermaid's single-quoted payload form", () => {
    // `{'theme':'forest'}` is valid mermaid: detectDirective swaps ' for " before JSON.parse.
    assert.deepEqual(readAuthorInit("%%{init: {'theme':'forest'}}%%\nflowchart TB").config, { theme: 'forest' });
  });

  test('accepts the `initialize` spelling', () => {
    assert.deepEqual(readAuthorInit('%%{initialize: {"theme":"dark"}}%%\nflowchart TB').config, { theme: 'dark' });
  });

  test('merges multiple directives in document order, later winning', () => {
    const src = '%%{init: {"theme":"base","flowchart":{"curve":"linear","padding":8}}}%%\n'
      + '%%{init: {"flowchart":{"padding":20}}}%%\nflowchart TB';
    assert.deepEqual(readAuthorInit(src).config, {
      theme: 'base', flowchart: { curve: 'linear', padding: 20 },
    });
  });

  test('parses a MULTI-LINE payload — the shape the old §5.3 doc taught', () => {
    // engineering/mermaid.md §5.3 used to print a pretty-printed, single-quoted,
    // multi-line `theme: base` + `themeVariables` block as THE way to theme a
    // diagram. Authors following that doc are the population this fix exists
    // for, so their exact spelling has to parse.
    const src = "%%{init: {'theme': 'base', 'themeVariables': {\n"
      + "  'primaryColor': '#F2F5FA',\n"
      + "  'lineColor': '#1A1A1A'\n"
      + '}}}%%\nflowchart TB\n  A --> B';
    assert.deepEqual(readAuthorInit(src).config, {
      theme: 'base',
      themeVariables: { primaryColor: '#F2F5FA', lineColor: '#1A1A1A' },
    });
    // `theme: base` is the engine's own theme, so this is a partial override,
    // not an opt-out: the engine still fills every key the author didn't list.
    assert.equal(authorPinsTheme(src), false);
  });

  test('an unparseable payload reports present-but-unknown, not absent', () => {
    const { present, config } = readAuthorInit('%%{init: {not json at all}}%%\nflowchart TB');
    assert.equal(present, true);
    assert.equal(config, null);
  });

  test('a __proto__ key in a payload cannot touch the merged config\'s prototype', () => {
    // JSON.parse is one of the few things that creates a real OWN `__proto__`
    // property, and a plain `out[k] = v` would hit Object.prototype's setter and
    // swap the config's prototype for author-controlled data — so `config.theme`
    // would read `forest` off an inherited object and stand the engine down.
    const src = '%%{init: {"__proto__": {"theme": "forest"}}}%%\nflowchart TB';
    const { config } = readAuthorInit(src);
    assert.equal(Object.getPrototypeOf(config), Object.prototype, 'prototype untouched');
    assert.deepEqual(config, {}, 'the unsafe key is dropped, not merged');
    assert.equal(authorPinsTheme(src), false, 'no theme was actually pinned');
    assert.equal({}.theme, undefined, 'Object.prototype is clean');
  });

  test('`constructor` and `prototype` payload keys are dropped too', () => {
    assert.deepEqual(readAuthorInit('%%{init: {"constructor": {"x": 1}, "theme": "base"}}%%').config,
      { theme: 'base' });
  });

  test('every hostile-input class scans in linear time', () => {
    // Locating directives is an indexOf walk, not a regex, because EVERY regex
    // of the shape `%%\{…:(payload-until-`}%%`)\}%%` is polynomial on author
    // text: with no terminator, the engine rescans to end-of-string from every
    // candidate start. Measured before the rewrite: 20 000 repeated `%%{init:`
    // prefixes took 5.9 s, on the build path, from deck source.
    const N = 50000;
    const hostile = {
      'repeated opener':   '%%{init:'.repeat(N),
      'whitespace run':    `%%{init: ${' '.repeat(N)}X`,
      'brace run':         `%%{init:${'}'.repeat(N)}`,
      'bare openers':      '%%{'.repeat(N),
      'openers + payload': `${'%%{init:'.repeat(N)}{"theme":"forest"}}%%`,
    };
    for (const [name, input] of Object.entries(hostile)) {
      const started = Date.now();
      readAuthorInit(input);
      const elapsed = Date.now() - started;
      assert.ok(elapsed < 1000, `${name}: expected a linear scan, took ${elapsed}ms`);
    }
  });

  test('a deeply nested payload degrades instead of exhausting the call stack', () => {
    // deepMerge recurses, and this runs on author deck content (including
    // untrusted Playground input) — so an uncaught RangeError is a crash, not a
    // bad diagram. TWO deep directives are needed to make it recurse at all: with
    // one, the first assignment short-circuits because the destination key is
    // absent. Reported by Copilot on #1314.
    const D = 40000;
    const deep = `${'{"a":'.repeat(D)}1${'}'.repeat(D)}`;
    const src = `%%{init: ${deep}}%%\n%%{init: ${deep}}%%\nflowchart TB`;
    assert.deepEqual(readAuthorInit(src), { present: true, config: null });
    assert.doesNotThrow(() => authorPinsTheme(src));
    assert.doesNotThrow(() => withEngineInit(src, ENGINE));
  });

  test('`initfoo:` is not an init directive', () => {
    // We require the keyword to stand alone. Mermaid's own type test is an
    // UNANCHORED /init\b/, so it is looser here — being stricter is the safe
    // direction: an undetected directive means we inject ours FIRST and mermaid
    // still lets the author's win, so the palette lands either way.
    assert.equal(readAuthorInit('%%{initfoo: {"theme":"forest"}}%%').present, false);
    assert.match(withEngineInit('%%{initfoo: {"theme":"forest"}}%%', ENGINE), /^%%\{init: /);
  });

  test('payload whitespace is trimmed in code, since the regex no longer does it', () => {
    assert.deepEqual(readAuthorInit('%%{init:   {"theme":"forest"}   }%%').config, { theme: 'forest' });
    assert.deepEqual(readAuthorInit('%%{init:\n  {"theme":"dark"}\n}%%').config, { theme: 'dark' });
  });

  test('an unterminated directive still counts as present', () => {
    assert.deepEqual(readAuthorInit('%%{init: {"theme":"forest"\nflowchart TB'), { present: true, config: null });
  });
});

describe('mermaid init-directive: authorPinsTheme', () => {
  test('false with no directive', () => {
    assert.equal(authorPinsTheme('flowchart TB\n  A --> B'), false);
  });

  test('false for a color-neutral directive — this is the #1311 case', () => {
    assert.equal(authorPinsTheme('%%{init: {"flowchart": {"curve": "linear"}}}%%\nflowchart TB'), false);
    assert.equal(authorPinsTheme('%%{init: {"layout": "elk"}}%%\nflowchart TB'), false);
  });

  test('false when the author only overrides individual themeVariables', () => {
    // A partial override is not an opt-out: the engine still owns every key the
    // author did not name.
    assert.equal(authorPinsTheme('%%{init: {"themeVariables": {"lineColor": "#f0f"}}}%%\nflowchart TB'), false);
  });

  test('false for an explicit `theme: base` (that IS the engine theme)', () => {
    assert.equal(authorPinsTheme('%%{init: {"theme":"base"}}%%\nflowchart TB'), false);
    assert.equal(authorPinsTheme('%%{init: {"theme":"BASE"}}%%\nflowchart TB'), false);
  });

  test('true for any other Mermaid theme', () => {
    assert.equal(authorPinsTheme("%%{init: {'theme':'forest'}}%%\nflowchart TB"), true);
    assert.equal(authorPinsTheme('%%{init: {"theme":"dark"}}%%\nflowchart TB'), true);
  });

  test('a theme name Mermaid cannot resolve is NOT a pin — it would strand the diagram', () => {
    // Mermaid re-derives themeVariables only for `theme in themes_default`, an
    // exact case-sensitive lookup. Treating an unresolvable name as an opt-out
    // meant the engine stood down, Mermaid resolved no theme either, and the
    // figure rendered in stock #ffffde — the #1311 symptom, reachable from a
    // typo. It also made the export re-bake report "kept their own colors" about
    // a diagram whose author kept nothing.
    for (const bogus of ['', 'Forest', 'FOREST', 'nonsense', 'Dark']) {
      assert.equal(authorPinsTheme(`%%{init: {"theme":"${bogus}"}}%%\nflowchart TB`), false,
        `theme:"${bogus}" is not resolvable by Mermaid, so it must not stand the engine down`);
      assert.match(withEngineInit(`%%{init: {"theme":"${bogus}"}}%%\nflowchart TB`, ENGINE),
        /^%%\{init: /, 'the engine directive still goes in');
    }
  });

  test('every theme name Mermaid DOES resolve pins, and only `base` does not', () => {
    for (const real of ['dark', 'forest', 'neutral', 'default', 'neo', 'neo-dark', 'redux']) {
      assert.equal(authorPinsTheme(`%%{init: {"theme":"${real}"}}%%\nflowchart TB`), true, real);
    }
    assert.equal(authorPinsTheme('%%{init: {"theme":"base"}}%%\nflowchart TB'), false);
  });

  test('true when the directive is unparseable — unknown contents, hands off', () => {
    assert.equal(authorPinsTheme('%%{init: {broken}}%%\nflowchart TB'), true);
  });

  test('an UPPERCASE %%{INIT}%% is not an init directive — mermaid ignores it, so do we', () => {
    // mermaid's outer directiveRegex is /gi, but detectInit filters types with
    // /(?:init\b)|(?:initialize\b)/ — no `i`. So mermaid applies NOTHING from
    // `%%{INIT: …}%%`. Reading it case-insensitively would make us see an author
    // theme pin, stand down, and leave the diagram with no palette from anyone.
    assert.equal(authorPinsTheme("%%{INIT: {'theme':'forest'}}%%\nflowchart TB"), false);
    assert.equal(readAuthorInit("%%{INIT: {'theme':'forest'}}%%\nflowchart TB").present, false);
    assert.equal(authorPinsTheme("%%{Init: {'theme':'forest'}}%%\nflowchart TB"), false);
    // …and the engine directive still goes in, so the palette lands.
    assert.match(withEngineInit("%%{INIT: {'theme':'forest'}}%%\nflowchart TB", ENGINE), /^%%\{init: /);
  });
});

describe('mermaid init-directive: engineInitDirective', () => {
  test('emits no single quotes — one would break mermaid\'s JSON.parse of the payload', () => {
    // detectDirective swaps EVERY ' for " across the text before parsing, so a
    // quoted font name inside a value invalidates the payload and mermaid drops
    // every directive in the diagram — palette included. (Hyphen-free stack, so
    // the charset filter isn't what's under test here.)
    const out = engineInitDirective(engineInitConfig({
      fontFamily: "'JetBrains Mono', monospace",
    }));
    assert.equal(out.includes("'"), false, 'no apostrophe survives into the directive');
    assert.equal(firstPayload(out).themeVariables.fontFamily, 'JetBrains Mono, monospace');
  });

  test('the emitted payload survives mermaid\'s quote-swap + JSON.parse round trip', () => {
    const out = engineInitDirective(engineInitConfig({
      fontFamily: "'JetBrains Mono', monospace", clusterBkg: '#E8F0F7',
    }));
    const payload = /%%\{\s*init:\s*([\s\S]*?)\}%%/.exec(out)[1];
    assert.doesNotThrow(() => JSON.parse(payload.replace(/'/g, '"')));
  });

  test('drops empty values so Mermaid falls back to its own default, not to ""', () => {
    const payload = firstPayload(engineInitDirective(engineInitConfig({
      primaryColor: 'rgb(1, 2, 3)', lineColor: '', textColor: '   ',
    })));
    assert.deepEqual(payload.themeVariables, { primaryColor: 'rgb(1, 2, 3)' });
  });

  test("drops a value mermaid's sanitizeDirective would blank — a hyphenated font stack", () => {
    // /^[\d "#%(),.;A-Za-z]+$/ has no hyphen, so `Outfit, system-ui, sans-serif`
    // becomes "" inside mermaid. A blank fontFamily is worse than none: mermaid
    // MEASURES labels in the host default font while the page RENDERS them in the
    // inherited one, so nodes come out too narrow and labels clip mid-word.
    const payload = firstPayload(engineInitDirective(engineInitConfig({
      fontFamily: "'Outfit', system-ui, sans-serif",
      clusterBkg: '#E8F0F7',
    })));
    assert.equal('fontFamily' in payload.themeVariables, false,
      'the hyphenated stack is dropped, not shipped to be blanked');
    assert.equal(payload.themeVariables.clusterBkg, '#E8F0F7', 'clean values still ship');
  });

  test('the shared diagram font stack DOES survive the directive charset', () => {
    // The reason diagrams are monospace is partly this: quotes, spaces and
    // letters are allowed, hyphens are not.
    assert.match(DIAGRAM_FONT_STACK, DIRECTIVE_VALUE_OK);
    const payload = firstPayload(engineInitDirective(engineInitConfig({
      fontFamily: DIAGRAM_FONT_STACK,
    })));
    assert.equal(payload.themeVariables.fontFamily, DIAGRAM_FONT_STACK);
  });

  test('every color form the engine actually emits survives the charset', () => {
    for (const v of ['#E8F0F7', 'rgb(242, 245, 250)', 'rgba(0, 0, 0, 0.5)', '14px']) {
      assert.match(v, DIRECTIVE_VALUE_OK, `${v} must survive sanitizeDirective`);
    }
  });

  test('drops themeVariables entirely when nothing resolved', () => {
    const payload = firstPayload(engineInitDirective(engineInitConfig({ primaryColor: '', lineColor: '' })));
    assert.equal('themeVariables' in payload, false);
    assert.equal(payload.theme, 'base');
  });

  test('keeps non-string leaves (numbers, booleans, nested objects)', () => {
    const payload = firstPayload(engineInitDirective(engineInitConfig({
      fontSize: '14px', xyChart: { backgroundColor: '#fff', showTitle: false, plotReservedSpacePercent: 0 },
    })));
    assert.deepEqual(payload.themeVariables.xyChart, {
      backgroundColor: '#fff', showTitle: false, plotReservedSpacePercent: 0,
    });
    assert.equal(payload.c4.c4ShapeInRow, 3);
  });
});

describe('mermaid init-directive: withEngineInit', () => {
  test('prepends the engine directive when the author wrote none', () => {
    const out = withEngineInit('flowchart TB\n  A --> B', ENGINE);
    assert.match(out, /^%%\{init: /);
    assert.equal(firstPayload(out).themeVariables.clusterBkg, '#F2F5FA');
    assert.match(out, /\nflowchart TB\n {2}A --> B$/);
  });

  test('the engine directive goes AFTER YAML front matter, never before it', () => {
    // Mermaid requires front matter to be the first thing in the source.
    const out = withEngineInit('---\ntitle: T\n---\nflowchart TB\n  A --> B', ENGINE);
    assert.match(out, /^---\ntitle: T\n---\n%%\{init: /);
  });

  test('#1311: a color-neutral author directive keeps the engine palette', () => {
    const src = '%%{init: {"flowchart": {"curve": "linear"}}}%%\nflowchart TB\n  A --> B';
    const out = withEngineInit(src, ENGINE);
    // Engine directive FIRST, author's second: mermaid merges init directives in
    // source order with the later one winning, so the author's `curve` overrides
    // ours and every key they did not set keeps the palette.
    const engineAt = out.indexOf('%%{init: {"theme":"base"');
    const authorAt = out.indexOf('"curve": "linear"');
    // Both must be PRESENT: `indexOf` returns -1 for a missing needle, so a bare
    // `a < b` would pass when the engine directive was never emitted at all.
    assert.ok(engineAt >= 0, 'engine directive is present');
    assert.ok(authorAt >= 0, 'author directive is present');
    assert.ok(engineAt < authorAt, 'engine directive precedes the author directive');
    assert.ok(out.includes(src), 'the author source is preserved verbatim');
    assert.equal(firstPayload(out).themeVariables.clusterBkg, '#F2F5FA');
  });

  test('front matter AND an author directive: engine directive lands between them', () => {
    const out = withEngineInit('---\ntitle: T\n---\n%%{init: {"layout":"elk"}}%%\nflowchart TB', ENGINE);
    assert.match(out, /^---\ntitle: T\n---\n%%\{init: \{"theme":"base"/);
    const engineAt = out.indexOf('"theme":"base"');
    const authorAt = out.indexOf('"layout":"elk"');
    assert.ok(engineAt >= 0 && authorAt >= 0, 'both directives are present');
    assert.ok(engineAt < authorAt, 'engine directive precedes the author directive');
  });

  test('an author-pinned theme is left completely alone', () => {
    const src = "%%{init: {'theme':'forest'}}%%\nflowchart TB\n  A --> B";
    assert.equal(withEngineInit(src, ENGINE), src);
  });

  test('a non-string definition degrades to the engine directive alone', () => {
    assert.match(withEngineInit(undefined, ENGINE), /^%%\{init: /);
  });
});

/**
 * Structural guards on the two render paths.
 *
 * These are SOURCE assertions, not behavioral proof — they pin the wiring
 * decisions that make the two paths agree, which is exactly the kind of thing a
 * later edit undoes by accident without any test going red. Neither engine file
 * can be `require()`d in-process (both have side-effecting top levels; see
 * test/unit/parsing/source-parse.test.js), so they are read as text.
 *
 * The behavior itself is covered by
 * test/integration/mermaid/mermaid-init-merge.test.js (PDF path, through mmdc).
 * The live-preview path is exercised by hand against the real Playground —
 * there is no automated coverage of it here.
 */
describe('mermaid init-directive: render-path wiring', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

  test('the PDF path builds its Mermaid source through the kernel', () => {
    const src = read('lattice-emulator.js');
    assert.match(src, /require\('\.\/lib\/integrations\/mermaid\/init-directive'\)/);
    assert.match(src, /withEngineInit\(definition, engineInitConfig\(themeVars[^)]*\)\)/,
      'renderMermaidOne composes its themed source via withEngineInit');
    assert.doesNotMatch(src, /const hasInit = definition\.includes/,
      'the old all-or-nothing "has an init directive" skip is gone');
  });

  test('the look re-bake asks whether the author PINNED a theme, not whether a directive exists', () => {
    // A color-neutral directive keeps the engine palette, so it re-bakes like
    // any other diagram. Testing for the mere presence of `%%{init` here would
    // silently drop it from the re-bake and over-report "kept their own colors".
    const src = read('lattice-emulator.js');
    assert.match(src, /if \(authorPinsTheme\(def\)\) \{ authorKept\.add\(idx\); continue; \}/);
    assert.doesNotMatch(src, /\/%%\\\{\\s\*init\/i\.test\(def\)/,
      'no surviving raw `%%{init` regex test on a diagram definition');
  });

  test('the runtime keeps the palette on the GLOBAL config, not in the diagram source', () => {
    // The runtime is in-process, so mermaid's own `updateCurrentConfig` merges an
    // author `%%{init}%%` OVER siteConfig on every render — the #1311 guarantee
    // comes free, with no per-diagram injection. Only the PDF path needs the
    // kernel, because mmdc is a separate process and its config has to travel in
    // the diagram source. Injecting into runtime sources too was tried and
    // reverted: a directive's themeVariables go through mermaid's much stricter
    // `sanitizeDirective`, which blanked the hyphenated font stack and left
    // Mermaid measuring in one font while the page rendered in another.
    const src = read('lib/runtime/index.js');
    // Per SLIDE since #1332 step 3, resolved by the KERNEL since step 4, and built from
    // the SHARED non-palette config since #1347: the palette still rides the global
    // config, but that config is `engineInitConfig` plus the enumerated preview-only
    // keys, re-applied per band with the variables `renderDiagrams` resolved from that
    // slide's own reader — not once per document from slide 1.
    assert.match(src, /mermaid\.initialize\(previewInitConfig\(themeVars[^)]*\)\)/,
      'the global config carries the palette');
    assert.match(src, /const shared = engineInitConfig\(themeVars[^)]*\);/,
      'and it is composed from the shared non-palette config (#1347)');
    assert.match(src, /function openSectionReader\(scopeEl\)/,
      'and the palette is read from the SECTION handed in, not from document.querySelector');
    assert.doesNotMatch(src, /withEngineInit/,
      'the runtime does not inject the palette into diagram sources');
    assert.match(src, /const source = reorientMermaidForPortrait\(/,
      'the fence source reaches mermaid.render as authored (plus reorientation)');
  });

  test('the runtime pins Mermaid to strict — a click directive was live XSS', () => {
    // `loose` let `click X "javascript:…"` reach innerHTML as a working anchor in
    // the docs Studio's same-origin, un-sandboxed preview frame (HARD RULE #22).
    // strict is also mermaid's own default, which the PDF path never overrode.
    const src = read('lib/runtime/index.js');
    // Quoted either way — it moved into PREVIEW_ONLY_CONFIG with #1347, where it lives
    // BECAUSE it is one of Mermaid's secure keys and so cannot be shared through a
    // %%{init}%% directive at all.
    assert.match(src, /securityLevel: ['"]strict['"]/);
    assert.doesNotMatch(src, /securityLevel: ['"]loose['"]/);
    const { DIVERGENT_CONFIG } = require('../../../lib/integrations/mermaid/init-directive');
    assert.ok(DIVERGENT_CONFIG.includes('securityLevel'),
      'securityLevel must stay enumerated as divergent — a Mermaid secure key cannot ride a '
      + 'directive, so "share it" would emit a key Mermaid silently drops');
  });

  test('both paths read the cluster fill from the containment token', () => {
    // Was two source-text `assert.match`es, one per render path, because each
    // path held its own copy of the map. There is one copy now
    // (lib/core/mermaid-theme-map.js), so this reads the actual object — an
    // assertion that fails for a SEMANTIC error rather than for a reformat.
    // The subgraph box is a CONTAINMENT surface, not the deck's card fill: it
    // sits behind the categorical node fills and must not compete with them,
    // which is what the per-theme `--c-container` rung is curated for. Its EDGE
    // is scheme-aware for the same reason `--diagram-stroke` cannot be — a flat
    // saturated hex went dark-on-dark on a dark container in 12 of 14 themes.
    const { MERMAID_VAR_MAP } = require('../../../lib/core/mermaid-theme-map');
    assert.deepEqual(MERMAID_VAR_MAP.clusterBkg, { var: 'c-container' });
    assert.deepEqual(MERMAID_VAR_MAP.clusterBorder, { var: 'c-container-edge' });
  });});
