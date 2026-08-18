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
    const workerSrc = fs.readFileSync(WORKER, 'utf8');
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

describe('render worker: behavior', { skip: CHROME ? false : 'no CHROME_PATH — set it to run the real render' }, () => {
  const FLOW = 'flowchart TB\n  A["Raw Signals from the field"] --> B["Decision Log"]';

  test('a render that produced no SVG is a failure, not a silent hole', () => {
    // Mermaid can resolve WITHOUT inserting an `<svg>`. Found by accident: a `pie`
    // definition containing a full-width digit (`48.２`) resolves cleanly on 11.14 and
    // leaves the container empty. The worker reported `ok: true` with `svg: undefined`,
    // and the caller then threw on `undefined.replace` — one keystroke away from shipping
    // a slide with a hole in it instead. An empty render is a diagram-level failure and
    // degrades to a `<pre>` like any other.
    const out = runWorker([
      { definition: 'pie showData\n  title T\n  "A" : 48.\uFF12\n  "B" : 31.4',
        config: engineInitConfig({ fontSize: '14px' }) },
    ]);
    assert.equal(out.results[0].ok, false, 'an empty render must report failure');
    assert.match(out.results[0].error, /without producing an SVG/);
  });

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

  test('the injected faces are actually LOADED in the render page', () => {
    // THE ASSERTION THIS REPLACES DID NOT WORK, and how it failed is worth keeping. It
    // rendered a flowchart in the hand face and asserted the box came back wider than a
    // threshold calibrated from an earlier probe (213.83 un-injected vs 243.08 injected).
    // Those numbers came from a probe with different flowchart config; against the real
    // `engineInitConfig` both arms land near 257, so REMOVING THE FONT INJECTION ENTIRELY
    // left the test green. The adversarial trio's checker caught it by mutation.
    //
    // The repair is to stop inferring the fonts from geometry and ask the page. The worker
    // now reports the families that reached `status === 'loaded'`, which is the property
    // that actually matters: a declared-but-unloaded face measures as its fallback, and
    // that is #1674 exactly. No threshold, nothing to go stale.
    const out = runWorker([
      { definition: FLOW, config: engineInitConfig({ fontFamily: '"JetBrains Mono", monospace', fontSize: '14px' }) },
    ]);
    assert.ok(Array.isArray(out.fontsLoaded), 'the worker must report the faces it loaded');
    // PER FACE (`family|weight|style`), not per family: a family whose 400 loaded and
    // whose 700 did not would pass a family-level check while mermaid measured cluster
    // titles and bold runs against synthetic bold.
    const { TEXT_FACES } = require('../../../lib/fonts/text-faces.js');
    const loaded = new Set(out.fontsLoaded);
    const missing = TEXT_FACES
      .filter((f) => !loaded.has(`${f.family}|${f.weight}|${f.style}`))
      .map((f) => `${f.family} ${f.weight} ${f.style}`);
    assert.deepEqual(missing, [],
      `these engine faces were declared but not loaded when the render began: ${missing.join(', ')}. `
      + 'Mermaid measures against what is LOADED, so an unloaded face means labels sized in one '
      + 'face and painted in another — #1674, reintroduced.');
  });
});
