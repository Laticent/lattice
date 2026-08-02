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

  test('a malformed directive with a long whitespace run parses in linear time', () => {
    // The old pattern wrapped the payload group in `\s*` on both sides, so
    // whitespace was matchable by two adjacent quantifiers: with no closing
    // `}%%`, 2 000 spaces did not finish in two minutes — one bad fence could
    // hang a build. 200 000 chars must now be effectively instant.
    const hostile = `%%{init: ${' '.repeat(200000)}X`;
    const started = Date.now();
    assert.deepEqual(readAuthorInit(hostile), { present: true, config: null });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 1000, `expected linear scan, took ${elapsed}ms`);
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

  test('every colour form the engine actually emits survives the charset', () => {
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
 * These are SOURCE assertions, not behavioural proof — they pin the wiring
 * decisions that make the two paths agree, which is exactly the kind of thing a
 * later edit undoes by accident without any test going red. Neither engine file
 * can be `require()`d in-process (both have side-effecting top levels; see
 * test/unit/parsing/source-parse.test.js), so they are read as text.
 *
 * The behaviour itself is covered by
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
    assert.match(src, /withEngineInit\(definition, engineInitConfig\(themeVars\)\)/,
      'renderMermaidOne composes its themed source via withEngineInit');
    assert.doesNotMatch(src, /const hasInit = definition\.includes/,
      'the old all-or-nothing "has an init directive" skip is gone');
  });

  test('the look re-bake asks whether the author PINNED a theme, not whether a directive exists', () => {
    // A colour-neutral directive keeps the engine palette, so it re-bakes like
    // any other diagram. Testing for the mere presence of `%%{init` here would
    // silently drop it from the re-bake and over-report "kept their own colors".
    const src = read('lattice-emulator.js');
    assert.match(src, /if \(authorPinsTheme\(def\)\) \{ authorKept\.add\(idx\); continue; \}/);
    assert.doesNotMatch(src, /\/%%\\\{\\s\*init\/i\.test\(def\)/,
      'no surviving raw `%%{init` regex test on a diagram definition');
  });

  test('the runtime carries the palette in the diagram source, not in mermaid.initialize', () => {
    const src = read('lib/runtime/index.js');
    assert.match(src, /const authored = reorientMermaidForPortrait\(/,
      'the fence text is reoriented first');
    assert.match(src, /const source = withEngineInit\(authored, engineInitFor\(\)\);/,
      'and THEN given the engine directive');
    // The regression this blocks: re-adding themeVariables to initialize would
    // put the palette back into mermaid's `configFromInitialize`, which an
    // author `theme:` directive folds in as user overrides — so the preview
    // would paint e.g. `forest` in the deck's palette while the PDF path
    // rendered forest clean. One mechanism, or the two paths drift again.
    const initializeCall = /mermaid\.initialize\(\{[\s\S]*?\n {4}\}\);/.exec(src);
    assert.ok(initializeCall, 'found the mermaid.initialize call');
    assert.doesNotMatch(initializeCall[0], /^\s*themeVariables:/m,
      'mermaid.initialize must not carry themeVariables');
  });
});
