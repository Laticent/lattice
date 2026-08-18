/**
 * Integration: the render worker in a REAL Chromium, rendering REAL diagrams.
 *
 * This tier lived in `test/unit/mermaid/render-worker.test.js` beside the contract tier,
 * and that was the wrong shelf twice over. ci.yml's `unit` job is contractually
 * render-free — it sets `PUPPETEER_SKIP_DOWNLOAD=1` so `npm ci` never fetches Chromium —
 * so these tests could only ever skip there, and nothing else ran the file. A
 * browser-backed suite parked in the unit tree is a suite with no home in CI.
 *
 * Here it is picked up by `test:integration:nightly`, which installs and caches a browser
 * on purpose, and `skipWithoutChrome` makes a missing one FAIL rather than vanish
 * (test/unit/tools/chrome-guard.test.js pins that rule).
 *
 * What stayed behind in the unit file: resolution, protocol shape, the source-level
 * properties that make the fix work, and the dead-page classifier — all pure, all fast,
 * all correct to run without a browser.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..', '..');
const WORKER = path.join(REPO, 'lib', 'integrations', 'mermaid', 'render-worker.js');
const { engineInitConfig } = require('../../../lib/integrations/mermaid/init-directive');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');

const CHROME = resolveChrome();

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

describe('render worker: behavior', { skip: skipWithoutChrome(CHROME) }, () => {
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

  test('the two registrations have their EFFECT, not just their call site', () => {
    // The drift gate above reads source text; this renders. Both are needed: text catches
    // a registration mermaid-cli ADDS that the worker never picks up, and only a render
    // catches one that is present but inert. Each assertion below was checked against a
    // worker with the registration removed — the first goes ok:false, the second collapses
    // to byte-identical dagre output.
    const cfg = engineInitConfig({ fontFamily: '"Outfit", sans-serif', fontSize: '14px' });
    const FLOW_4 = 'flowchart TB\n  A["Alpha"] --> B["Beta"]\n  A --> C["Gamma"]\n  B --> D["Delta"]\n  C --> D';
    const out = runWorker([
      { definition: 'zenuml\n  title Order\n  Broker->Router.tender()\n  Router->Broker.quote()', config: cfg },
      { definition: FLOW_4, config: cfg },
      { definition: FLOW_4, config: { ...cfg, layout: 'elk' } },
    ]);
    assert.equal(out.results[0].ok, true,
      `registerExternalDiagrams is inert — zenuml did not render: ${out.results[0].error}`);
    // ELK's silent failure mode is the dangerous one: an unregistered layout loader does
    // not error, it renders as dagre and looks perfectly fine. The only observable is that
    // the two layouts stop differing.
    assert.equal(out.results[1].ok && out.results[2].ok, true, 'both flowcharts must render');
    const body = (svg) => svg.split('</style>').pop();
    assert.notEqual(body(out.results[2].svg), body(out.results[1].svg),
      'registerLayoutLoaders is inert — `layout: elk` produced byte-identical dagre output');
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
