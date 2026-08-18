/**
 * The engine-owned Mermaid render worker (#1674).
 *
 * This file is the BROWSER-FREE tier: resolution, protocol shape, the dead-page
 * classifier, and the source-level properties that make the fix work at all. It runs
 * everywhere, including ci.yml's `unit` job, which sets `PUPPETEER_SKIP_DOWNLOAD=1` and
 * has no Chromium by contract.
 *
 * The tier that renders real diagrams in a real Chromium is
 * `test/integration/mermaid/render-worker-behavior.test.js`. It started here, and that
 * was the wrong shelf: the only job running this file cannot have a browser, so those
 * tests could only ever skip. Moved to the integration tree, `test:integration:nightly`
 * picks them up and actually runs them. The full-fidelity version of the same question is
 * `tools/check-diagram-labels.js` over a real exported deck.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..', '..');
const WORKER = path.join(REPO, 'lib', 'integrations', 'mermaid', 'render-worker.js');
const { resolveBundles } = require(WORKER);
const { fontFaceCss, fontFamilies } = require('../../../lib/fonts/face-css.js');

/**
 * Source with `//` and block comments removed, so a gate that matches on text cannot be
 * satisfied by a comment that MENTIONS the call it is looking for. Deliberately simple:
 * the input is one file we own, with no regex literals or strings carrying comment
 * markers, and the caller asserts the strip did not eat the file.
 */
function stripComments(src) {
  const out = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  assert.ok(out.length > src.length * 0.3,
    'the comment stripper ate the file — it is too naive for this source');
  return out;
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

  test('the worker makes every registration mermaid-cli\'s own prologue makes', () => {
    // THE COUPLING THIS CHANGE ACTUALLY TOOK ON. Loading the CLI's `dist/index.html` gets
    // its vite bundle — the KaTeX and FontAwesome faces, and `globalThis.elkLayouts` —
    // but the REGISTRATIONS live in the CLI's own JavaScript, inside the `$eval` in
    // `src/index.js`. A page that only loads the bundle has the code and none of the
    // wiring, and the failure is silent in both directions: a zenuml diagram degrades to
    // a `<pre>`, and `layout: elk` just renders as dagre and looks fine.
    //
    // Both of those shipped in an earlier draft of this branch. So this reads the CLI's
    // real source and fails when it names a `mermaid.register*` call the worker does not
    // make — which is what turns "we own the page" from an undocumented compatibility
    // contract into a red build on upgrade.
    const cliSrc = fs.readFileSync(
      path.join(REPO, 'node_modules', '@mermaid-js', 'mermaid-cli', 'src', 'index.js'), 'utf8');
    // CODE ONLY. This matched the raw file until a red team deleted BOTH registrations,
    // left their names in the prose above them, and watched all thirteen tests pass while
    // zenuml stopped rendering. The worker's comments are long and name every call they
    // explain, so a text gate over them certifies the documentation, not the behavior.
    const workerSrc = stripComments(fs.readFileSync(WORKER, 'utf8'));
    const cliCalls = [...cliSrc.matchAll(/mermaid\.(register\w+)\s*\(/g)].map((m) => m[1]);
    assert.ok(cliCalls.length, 'could not read any mermaid.register* call from mermaid-cli');
    // `registerIconPacks` is deliberately NOT made, and skipping it is EXACTLY what mmdc
    // did for us: the CLI registers packs named by its `--iconPacks` / `--iconPacksNames`
    // flags, both default to `[]`, and the export never passed either — so
    // `registerIconPacks([])` registered nothing. Not calling it is behaviorally
    // identical, which is why this is an exception and not a third dropped step. It also
    // should stay one: the CLI's loader FETCHES each pack from unpkg.com at render time,
    // and the engine renders offline by design. A pack would have to be vendored first.
    const NOT_OWED = new Set(['registerIconPacks']);
    const missing = [...new Set(cliCalls)]
      .filter((c) => !NOT_OWED.has(c))
      .filter((c) => !new RegExp(`mermaid\\.${c}\\s*\\(`).test(workerSrc));
    assert.deepEqual(missing, [],
      `mermaid-cli's render prologue calls these and the worker does not: ${missing.join(', ')}. `
      + 'Each one is a diagram capability the export silently loses — add the call, or add it '
      + 'to NOT_OWED with the reason.');
  });

  test('mermaid and zenuml are DECLARED dependencies, not hoisting luck', () => {
    // The worker `require.resolve`s both from Lattice's own module location. mermaid-cli
    // resolves its copies from its OWN location (`import-meta-resolve` against
    // `import.meta.url`), so it never needed them declared here — we do. Undeclared, they
    // resolve only because npm hoists: under pnpm's isolated layout or Yarn PnP,
    // `resolveBundles` throws and EVERY diagram in every deck degrades to a `<pre>`.
    // `mmdc` did not have that exposure, because a bin-link works under any layout.
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
    for (const dep of ['mermaid', '@mermaid-js/mermaid-zenuml']) {
      assert.ok(pkg.dependencies[dep],
        `${dep} is require.resolve'd by the render worker but is not a declared dependency`);
    }
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

describe('render worker: a dead page is not a diagram error', () => {
  const { isFatalPageError } = require(WORKER);

  test('transport-level failures are classified fatal, author errors are not', () => {
    // THE WORST BUG IN THE FIRST CUT OF THIS FILE. `renderOne` catches everything, so a
    // browser that died mid-batch produced N per-diagram failures inside an `ok: true`
    // payload — the caller saw a successful batch, skipped the retrying fallback, and
    // shipped a PDF with a hole in it. Measured by the adversarial trio's red team: a
    // renderer killed 4s into an 80-diagram batch lost 70 of 80 diagrams and exited 0.
    //
    // The distinction has to be made on the message, because Puppeteer surfaces both
    // through the same throw. Every string below is one the red team actually observed.
    for (const fatal of [
      "Attempted to use detached Frame '6A41'.",
      'Protocol error (Runtime.callFunctionOn): Target closed',
      'Runtime.callFunctionOn timed out. Increase the protocolTimeout.',
      'Execution context was destroyed, most likely because of a navigation.',
      'Session closed. Most likely the page has been closed.',
    ]) {
      assert.equal(isFatalPageError(fatal), true, `must be fatal: ${fatal}`);
    }
    // …and an authoring mistake must NOT be, or one typo costs three Chromium boots to
    // reach the same verdict and the batch loses its whole point.
    for (const authorError of [
      'Parse error on line 2:\n...flowchart TB\n  BROKEN (((',
      'No diagram type detected matching given configuration for text: grafh TD',
      'Maximum text size in diagram exceeded',
    ]) {
      assert.equal(isFatalPageError(authorError), false, `must NOT be fatal: ${authorError}`);
    }
  });

  test('the classifier is wired into the batch result, not just exported', () => {
    // A pure predicate nothing calls is the same bug with extra steps.
    const src = fs.readFileSync(WORKER, 'utf8');
    assert.match(src, /isFatalPageError\(result\.error\)/,
      'renderAll must consult the classifier after a per-diagram failure');
    assert.match(src, /return \{ ok: false, error: `render page died mid-batch/,
      'a fatal page error must make the whole payload ok:false, so the caller retries');
    assert.match(src, /protocolTimeout: PROTOCOL_TIMEOUT_MS/,
      'the CDP calls must be bounded — one page serves the whole deck, so an unbounded '
      + 'wedge stalls every remaining diagram behind it');
  });

  test('the caller bounds the child process too', () => {
    // The worker bounds its own CDP calls, but a child that wedges before it can report
    // leaves the caller's synchronous `execFileSync` blocked with no budget at all.
    const emulator = fs.readFileSync(path.join(REPO, 'lattice-emulator.js'), 'utf8');
    assert.match(emulator, /execFileSync\(process\.execPath, \[MERMAID_WORKER, jobFile\], \{[^}]*timeout \}/,
      'the worker spawn must carry a timeout');
  });
});
