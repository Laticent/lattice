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
});

describe('mermaid init-directive: engineInitDirective', () => {
  test('emits no single quotes — one would break mermaid\'s JSON.parse of the payload', () => {
    // detectDirective swaps EVERY ' for " across the text before parsing, so a
    // quoted font name inside a value invalidates the payload and mermaid drops
    // every directive in the diagram — palette included.
    const out = engineInitDirective(engineInitConfig({
      fontFamily: "'Outfit', system-ui, sans-serif",
    }));
    assert.equal(out.includes("'"), false, 'no apostrophe survives into the directive');
    assert.equal(firstPayload(out).themeVariables.fontFamily, 'Outfit, system-ui, sans-serif');
  });

  test('the emitted payload survives mermaid\'s quote-swap + JSON.parse round trip', () => {
    const out = engineInitDirective(engineInitConfig({ fontFamily: "'Outfit', sans-serif", clusterBkg: '#F2F5FA' }));
    const payload = /%%\{\s*init:\s*([\s\S]*?)\}%%/.exec(out)[1];
    assert.doesNotThrow(() => JSON.parse(payload.replace(/'/g, '"')));
  });

  test('drops empty values so Mermaid falls back to its own default, not to ""', () => {
    const payload = firstPayload(engineInitDirective(engineInitConfig({
      primaryColor: 'rgb(1, 2, 3)', lineColor: '', textColor: '   ',
    })));
    assert.deepEqual(payload.themeVariables, { primaryColor: 'rgb(1, 2, 3)' });
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
    assert.ok(out.indexOf('%%{init: {"theme":"base"') < out.indexOf('"curve": "linear"'),
      'engine directive precedes the author directive');
    assert.ok(out.includes(src), 'the author source is preserved verbatim');
    assert.equal(firstPayload(out).themeVariables.clusterBkg, '#F2F5FA');
  });

  test('front matter AND an author directive: engine directive lands between them', () => {
    const out = withEngineInit('---\ntitle: T\n---\n%%{init: {"layout":"elk"}}%%\nflowchart TB', ENGINE);
    assert.match(out, /^---\ntitle: T\n---\n%%\{init: \{"theme":"base"/);
    assert.ok(out.indexOf('"theme":"base"') < out.indexOf('"layout":"elk"'));
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
    assert.match(src, /withEngineInit\(\s*\n\s*reorientMermaidForPortrait\(/,
      'the fence source is reoriented and THEN given the engine directive');
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
