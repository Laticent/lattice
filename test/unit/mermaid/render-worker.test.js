/**
 * The engine-owned Mermaid render worker (#1674).
 *
 * Split deliberately into two tiers, because most of what matters here cannot be
 * asserted without a browser and the unit suite must not require one:
 *
 *   1. CONTRACT — resolution, protocol shape, and the source-level properties that make
 *      the fix work at all. Always runs.
 *   2. BEHAVIOR — a real Chromium rendering real diagrams. Skips loudly without one
 *      (`CHROME_PATH`), because a silent skip is how "verified" stops meaning anything
 *      (HARD RULE #23). The full-fidelity version of this check is
 *      `tools/check-diagram-labels.js` over a real exported deck.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..', '..');
const WORKER = path.join(REPO, 'lib', 'integrations', 'mermaid', 'render-worker.js');
const { resolveBundles } = require(WORKER);
const { fontFaceCss, fontFamilies } = require('../../../lib/fonts/face-css.js');
const { engineInitConfig } = require('../../../lib/integrations/mermaid/init-directive');

const CHROME = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || null;

function runWorker(diagrams) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmd-test-'));
  try {
    const jobFile = path.join(dir, 'job.json');
    const outFile = path.join(dir, 'out.json');
    fs.writeFileSync(jobFile, JSON.stringify({
      pkgRoot: REPO, chromePath: CHROME, backgroundColor: 'transparent', outFile, diagrams,
    }));
    try {
      execFileSync(process.execPath, [WORKER, jobFile], { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (_e) { /* a diagram-level failure exits non-zero but still writes the file */ }
    return JSON.parse(fs.readFileSync(outFile, 'utf8'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('render worker: contract', () => {
  test('resolves the same page and bundles mermaid-cli itself renders in', () => {
    // Reusing the CLI's own `dist/index.html` is what keeps this a change of FONTS and
    // CONFIG DELIVERY rather than a change of renderer: the page carries the vite bundle
    // that registers zenuml and elk layouts and preloads the KaTeX + FontAwesome faces a
    // diagram can reference. Hand-rolling a page would silently drop all of that.
    const b = resolveBundles(REPO);
    for (const p of Object.values(b)) assert.ok(fs.existsSync(p), `${p} must exist`);
    assert.match(b.indexHtml, /mermaid-cli[/\\]dist[/\\]index\.html$/);
    assert.match(b.mermaidIife, /mermaid[/\\]dist[/\\]mermaid\.js$/);
  });

  test('the font CSS it injects covers every family the engine ships', () => {
    // If a family the deck can name is missing from the injected block, Mermaid measures
    // it in a fallback face and the label clips — the exact #1674 failure.
    const css = fontFaceCss(REPO);
    assert.ok(css.length > 0, 'no @font-face rules were produced');
    for (const family of fontFamilies()) {
      assert.ok(css.includes(`font-family:'${family}'`), `${family} is not in the injected block`);
    }
    assert.ok(css.includes('src:url(data:font/woff2;base64,'), 'faces must be inlined, not linked');
    // `block`, not `swap`: the worker awaits the faces before rendering, but a swap would
    // let a fallback paint first if that await ever regressed.
    assert.ok(fontFaceCss(REPO, { display: 'block' }).includes('font-display:block'));
  });

  test('it awaits the faces before rendering — the whole point of the file', () => {
    const src = fs.readFileSync(WORKER, 'utf8');
    const addStyle = src.indexOf('addStyleTag');
    const fontsReady = src.indexOf('document.fonts.ready');
    // The CALL, not the word — the file's own docstring names `mermaid.render()` while
    // explaining why the ordering matters, and matching that would test the prose.
    const render = src.indexOf('await mermaid.render(svgId');
    assert.ok(addStyle > 0 && fontsReady > addStyle,
      'the faces must be declared before they are awaited');
    assert.ok(render > fontsReady,
      'mermaid.render must come AFTER the font wait — a declared-but-unloaded face measures '
      + 'as its fallback, which is the bug this worker exists to fix');
    assert.match(src, /document\.fonts\.load\(/,
      'declaring a face does not load it; each family/weight has to be requested');
  });

  test('it does not shell out to mmdc, and nothing else does either', () => {
    // An INVOCATION, not a mention: both files keep prose explaining what `mmdc` was and
    // why it was replaced, and that history is the most useful thing in them.
    const INVOKES_MMDC = /mmdcBin|\.bin[^\n]*mmdc|exec\w*Sync\([^\n]*mmdc/;
    const src = fs.readFileSync(WORKER, 'utf8');
    assert.equal(INVOKES_MMDC.test(src), false, 'the worker must not invoke the CLI binary');
    const emulator = fs.readFileSync(path.join(REPO, 'lattice-emulator.js'), 'utf8');
    assert.equal(INVOKES_MMDC.test(emulator), false,
      'the export path still shells out to mmdc somewhere — that page carries no Lattice '
      + 'fonts, so its labels are measured in a fallback face');
  });
});

describe('render worker: behavior', { skip: CHROME ? false : 'no CHROME_PATH — set it to run the real render' }, () => {
  const FLOW = 'flowchart TB\n  A["Raw Signals from the field"] --> B["Decision Log"]';

  test('renders, and reports per-diagram failure without losing the batch', () => {
    const cfg = engineInitConfig({ fontFamily: '"JetBrains Mono", monospace', fontSize: '14px' });
    const out = runWorker([
      { definition: FLOW, config: cfg },
      { definition: 'flowchart TB\n  BROKEN ((( syntax', config: cfg },
      { definition: FLOW, config: cfg },
    ]);
    assert.equal(out.results.length, 3, 'results must stay index-aligned with the requests');
    assert.equal(out.results[0].ok, true);
    assert.equal(out.results[1].ok, false, 'a malformed fence must report its own failure');
    assert.equal(out.results[2].ok, true, 'and must not cost the diagrams after it');
    assert.match(out.results[0].svg, /^<svg/);
  });

  test('config does not leak between diagrams in the shared page', () => {
    // The worker reuses ONE page for the batch, and `mermaid.initialize` is global. A
    // sketch deck with one `_class: boardroom` slide is exactly the case that would break
    // if `initialize` accumulated: the opted-out slide would inherit the previous
    // diagram's hand-drawn renderer. Asserted rather than assumed — the failure is
    // invisible except as one slide silently wearing the wrong finish.
    const vars = { fontFamily: '"JetBrains Mono", monospace', fontSize: '14px' };
    const out = runWorker([
      { definition: FLOW, config: engineInitConfig(vars, { look: 'handDrawn' }) },
      { definition: FLOW, config: engineInitConfig(vars) },
    ]);
    const body = (svg) => svg.split('</style>').pop();
    assert.match(body(out.results[0].svg), /class="[^"]*\brough-node\b/,
      'the handDrawn diagram must actually use the rough renderer');
    assert.equal(/class="[^"]*\brough-node\b/.test(body(out.results[1].svg)), false,
      'the classic diagram inherited handDrawn from the one before it — mermaid.initialize '
      + 'is being accumulated onto instead of replacing the site config');
  });

  test('the hand face measures WIDER than the un-injected fallback — fonts really loaded', () => {
    // The measurement at the heart of #1674, reduced to one assertion. Without the
    // injected faces Mermaid sized this label's box in a fallback face ~20% narrow, and
    // the host page then painted the real face into it, clipping mid-word. If the fonts
    // stopped loading, the box would shrink back and this goes red.
    const hand = { fontFamily: "'Shantell Sans', system-ui, sans-serif", fontSize: '14px' };
    const out = runWorker([{ definition: FLOW, config: engineInitConfig(hand) }]);
    assert.equal(out.results[0].ok, true);
    const svg = out.results[0].svg;
    assert.match(svg, /Shantell Sans/, 'the hand family must reach the rendered SVG');
    const width = Number(/viewBox="[\d.]+ [\d.]+ ([\d.]+)/.exec(svg)[1]);
    // Measured on the un-injected fallback: 213.83. With the real face loaded: 243.08.
    // The floor sits between them, well clear of either.
    assert.ok(width > 228,
      `flowchart measured ${width} user units wide — that is the un-injected fallback's `
      + 'geometry, so the @font-face block is not reaching the render page');
  });
});
