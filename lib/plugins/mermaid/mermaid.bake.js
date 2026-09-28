/**
 * lib/plugins/mermaid/mermaid.bake.js — Mermaid's CLI half: every ```mermaid fence drawn to a
 * static SVG before the engine renders the deck (the plugin's `bake`, `render.exec.bake:
 * "subprocess"`; engineering/decisions/2026-09-27-plugin-system.md §4.3 and §7 phase D).
 *
 * Moved here, unchanged in behavior, from `lattice-emulator.js`'s `preprocessMermaid` and the
 * worker plumbing around it. The host (lib/plugins/host-bake.js) calls `bake(source, ctx)` for a
 * deck that uses the plugin; the emulator supplies the export's services on `ctx`:
 *
 *   ctx.pkgRoot            the package root (the worker and the fonts are resolved from it)
 *   ctx.quiet              no progress output
 *   ctx.print              the print band is on (`--print`, or an image set in print mode)
 *   ctx.paletteUsesTexture the deck's palette carries the texture channel (diagram-look rule 1)
 *   ctx.orientation        the deck's orientation name, from its `size:` directive
 *   ctx.browser            `{ path, args }` — the Chromium every CLI launch uses, kept offline
 *   ctx.readToken(scope, name)   a palette token as a `{ band, hand }` scope resolves it
 *   ctx.scopeKey(scope)          the palette a scope resolves, for the kernel's memoization
 *   ctx.diagramTheme(band, hand) the Mermaid theme variables for a band (the one assembly site
 *                                stays in the emulator — test/unit/core/diagram-theme-parity)
 *   ctx.state              this export's own record; `bake` fills it (below)
 *
 * Each fence is rendered for the band of ITS OWN slide, and the walk is the shared kernel's
 * (`renderDiagrams`, lib/core/render-diagrams.js — #1332 step 4). This path supplies two
 * capabilities and no policy: read a token for a band (`ctx.readToken`), and render one diagram
 * with the palette the kernel resolved (`renderMermaidOne`).
 *
 * `ctx.state` after a bake: `defs`, `modes`, `looks`, `hand` (index-aligned with the
 * `data-mmd-idx` stamp on each `.mermaid-svg`), and `renderOne` / `renderInBand` — what the
 * image-set export's cross-scheme look re-bake calls to re-render one diagram in another band,
 * continuing this bake's SVG id sequence so no two diagrams on a page share an id.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync, execFileSync } = require('node:child_process');
const { resolveDiagramBand } = require('../../core/diagram-band');
const { resolveDiagramLook, resolveDiagramHandType } = require('../../core/diagram-look');
const { TEXT_FACES } = require('../../fonts/text-faces.js');
const { renderDiagrams } = require('../../core/render-diagrams');
const { slideClassSpans, slideClassAt, slideIndexAt } = require('../../core/slide-class-spans');
const { engineInitConfig, authorPinsTheme } = require('../../integrations/mermaid/init-directive');
const { reorientMermaidForPortrait } = require('../../integrations/mermaid/reorient');
// The one pattern that says "this is a Mermaid fence", shared with the narrator (#1).
const { matchMermaidFences } = require('../../core/mermaid-fences');

/**
 * One export's baker: the moved code, closed over that export's services and record, so two
 * exports in one process (a test, a future batch CLI) can never share an SVG id counter or a
 * re-bake table.
 */
function createRun(ctx) {
  const state = ctx.state;
  Object.assign(state, { defs: [], modes: [], looks: [], hand: [] });
  const QUIET = ctx.quiet;
  const PKG_ROOT = ctx.pkgRoot;
  const WANT_PRINT = ctx.print;
  const PALETTE_USES_TEXTURE = ctx.paletteUsesTexture;
  const CHROME_EXEC = ctx.browser.path;
  const OFFLINE_ARGS = ctx.browser.args;
  const readScopeToken = ctx.readToken;
  const diagramScopeKey = ctx.scopeKey;
  // The engine-owned Mermaid render page, run as a child process so this synchronous pass can
  // drive an async Puppeteer render. Resolved from the package root rather than __dirname so a
  // bundled emulator finds it the same way the fonts are found.
  const MERMAID_WORKER = path.join(PKG_ROOT, 'lib', 'integrations', 'mermaid', 'render-worker.js');

  // A human name for a Mermaid diagram's TYPE, read from the first meaningful line of
  // its source (skipping `%%{init}%%` directives, front-matter and blank lines). Used
  // only as the accessible-name floor for a diagram whose author supplied no
  // `accTitle:` — see the call site. Unknown keywords fall back to the keyword itself
  // rather than a wrong guess.
  const MERMAID_KINDS = {
    graph: 'Flowchart', flowchart: 'Flowchart', sequencediagram: 'Sequence diagram',
    classdiagram: 'Class diagram', statediagram: 'State diagram', 'statediagram-v2': 'State diagram',
    erdiagram: 'Entity relationship diagram', journey: 'User journey diagram', gantt: 'Gantt chart',
    pie: 'Pie chart', quadrantchart: 'Quadrant chart', requirementdiagram: 'Requirement diagram',
    gitgraph: 'Git graph', mindmap: 'Mind map', timeline: 'Timeline', sankey: 'Sankey diagram',
    'sankey-beta': 'Sankey diagram', xychart: 'XY chart', 'xychart-beta': 'XY chart',
    block: 'Block diagram', 'block-beta': 'Block diagram', packet: 'Packet diagram',
    architecture: 'Architecture diagram', 'architecture-beta': 'Architecture diagram',
  };
  // Escaped LOCALLY. When this code lived in lattice-emulator.js, reaching for the emulator's
  // `escapeHtml` (declared far below the pre-pass, which runs during module evaluation) threw
  // `Cannot access 'escapeHtml' before initialization`. That failure was ALSO invisible — the surrounding retry loop deleted the temp dir before this
  // point, so attempts 2 and 3 failed with a misleading "Command failed" (no input file)
  // and the real cause never surfaced.
  const escAttrLocal = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function mermaidKindLabel(definition) {
    const lines = String(definition || '').split('\n');
    let inFrontMatter = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // Mermaid YAML FRONT MATTER is a `---` fenced block, and skipping only the fence
      // lines left the loop reading `title: …` from INSIDE it — which is not a diagram
      // keyword, so every front-mattered diagram fell through to the generic "Diagram".
      // 12 of the repo's own 100 mermaid blocks use front matter, including the baseline
      // gallery's first diagram, which is the artifact §17.12 originally cited as proof
      // this worked. Track the block and skip its BODY, not just its fences.
      if (line === '---') { inFrontMatter = !inFrontMatter; continue; }
      if (inFrontMatter) continue;
      if (!line || line.startsWith('%%')) continue;
      const word = (line.split(/[\s:;{(]/)[0] || '').toLowerCase();
      if (!word) continue;
      return MERMAID_KINDS[word] || 'Diagram';
    }
    return 'Diagram';
  }

  function renderMermaidOne(definition, themeVars, extraClass, look) {
    // Mermaid / Chromium has known transient failures (browser startup races, a lost
    // page). Retry the whole worker up to 3 times before degrading to a `<pre>`.
    const MAX_ATTEMPTS = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const out = runMermaidWorker([{ definition, themeVars, look }]);
      if (out.ok && out.results[0]?.ok) {
        return finishMermaidSvg(out.results[0].svg, definition, extraClass);
      }
      lastError = out.results[0]?.error || out.error || 'unknown failure';
      // A DIAGRAM-level error is the author's syntax, not a flaky browser — retrying it
      // costs three Chromium boots to reach the same verdict. Only a WORKER-level failure
      // is worth another attempt.
      if (out.ok) break;
      if (attempt < MAX_ATTEMPTS) execSync('sleep 1');
    }
    console.warn(`  ⚠ Mermaid render failed: ${String(lastError).split('\n')[0]}`);
    return mermaidFallbackPre(definition);
  }

  /**
   * The degradation block for a diagram that could not render, with its source ESCAPED.
   *
   * It was interpolated raw on both paths, which put author markup straight into the
   * exported `.html` sidecar and into the page Puppeteer rasterizes — a fence body of
   * `</pre><img src=x onerror=…>` executed there, verified. Pre-existing (identical on
   * `origin/main`) and off the path of #1674, so by HARD RULE #18 it would be logged rather
   * than fixed — except that it is one call, the helper already existed a few lines up, and
   * #1674 makes this path materially easier to reach (a batch that used to fall back and
   * retry now degrades in place). Fixing beats logging when the fix is this small.
   *
   * `escAttrLocal`, for the reason its own comment gives.
   */
  function mermaidFallbackPre(definition) {
    return `<pre class="mermaid-fallback">${escAttrLocal(definition)}</pre>`;
  }

  /**
   * A face that is DECLARED but never LOADS is the #1674 bug wearing a disguise: the
   * diagram still renders, Mermaid just measured it in a fallback and the deck then paints
   * it in the real face. Nothing about the output looks wrong until a label overflows its
   * box. The worker reports what actually reached `status === 'loaded'`, so say something
   * the one time it does not — once per run, naming the faces, rather than per diagram.
   */
  let warnedUnloadedFaces = false;
  function warnOnUnloadedFaces(out) {
    if (warnedUnloadedFaces || !out || !Array.isArray(out.fontsLoaded)) return;
    // PER FACE, not per family. A family with its 400 present and its 700 missing would pass
    // a family-level check while mermaid measured cluster titles and bold runs against
    // synthetic bold — the same measure/paint split one weight down.
    const loaded = new Set(out.fontsLoaded);
    const missing = TEXT_FACES
      .filter((f) => !loaded.has(`${f.family}|${f.weight}|${f.style}`))
      .map((f) => `${f.family} ${f.weight}${f.style === 'italic' ? ' italic' : ''}`);
    if (!missing.length) return;
    warnedUnloadedFaces = true;
    console.warn(`  ⚠ Mermaid render page did not load: ${missing.join(', ')} — diagram labels in `
      + 'those faces were measured against a fallback and may not fit their nodes.');
  }

  /**
   * Run the engine-owned Mermaid render worker over a list of requests, synchronously.
   *
   * WHY A CHILD PROCESS AT ALL — the bake is called during the emulator's module
   * evaluation and cannot `await`, while Puppeteer is async throughout. The worker
   * keeps the caller's shape exactly as the `mmdc` shell-out had it. See
   * lib/integrations/mermaid/render-worker.js for why we stopped calling `mmdc`.
   *
   * @param {Array<{definition: string, themeVars: object, look: string|undefined}>} requests
   * @returns {{ok: boolean, error?: string, results: Array<{ok: boolean, svg?: string, error?: string}>}}
   */
  function runMermaidWorker(requests) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmd-'));
    try {
      const jobFile = path.join(tmpDir, 'job.json');
      const outFile = path.join(tmpDir, 'out.json');
      fs.writeFileSync(jobFile, JSON.stringify({
        pkgRoot: PKG_ROOT,
        chromePath: CHROME_EXEC || undefined,
        // The worker's browser draws the deck's Mermaid, labels and all, so it is kept off the
        // network the same way (lib/core/offline-chromium.js).
        chromeArgs: OFFLINE_ARGS,
        backgroundColor: 'transparent',
        outFile,
        // The engine's config, delivered the way the live preview delivers it. Nothing is
        // serialized into a `%%{init}%%` directive any more, so the author's own directive
        // is the ONLY one in the source and Mermaid merges it over ours exactly as it does
        // in the preview (#1674, HARD RULE #1).
        diagrams: requests.map((r) => ({
          definition: r.definition,
          // `omitPalette` carries the theme STAND-DOWN across the transport change. It used
          // to be implicit in `withEngineInit`, which returned the definition untouched when
          // the author pinned a theme, so no engine config reached Mermaid at all. Config
          // travels beside the source now, so the stand-down has to be stated.
          config: engineInitConfig(r.themeVars, {
            look: r.look,
            omitPalette: authorPinsTheme(r.definition),
          }),
        })),
      }));
      // A BUDGET, because there was none. The worker bounds its own CDP calls, but a child
      // that wedges before it can report leaves this synchronous call blocked forever — and
      // `mmdc` had the same gap with a fraction of the blast radius, because it booted a
      // browser per diagram. Scaled by batch size so a large deck is not cut off mid-render;
      // on expiry `execFileSync` throws, the catch below degrades, and the caller retries.
      const timeout = Math.max(120_000, 15_000 * requests.length);
      execFileSync(process.execPath, [MERMAID_WORKER, jobFile], { stdio: ['ignore', 'ignore', 'pipe'], timeout });
      const out = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      warnOnUnloadedFaces(out);
      return out;
    } catch (e) {
      // The worker writes its result file even when the browser never came up, so prefer
      // that over the process error — it carries the real reason.
      try {
        const parsed = JSON.parse(fs.readFileSync(path.join(tmpDir, 'out.json'), 'utf8'));
        if (parsed && Array.isArray(parsed.results)) { warnOnUnloadedFaces(parsed); return parsed; }
      } catch (_e) { /* fall through to the process-level error */ }
      return { ok: false, error: String(e?.message ? e.message : e).split('\n')[0], results: [] };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * Everything that happens to a rendered SVG between "Mermaid succeeded" and
   * "this is a slide fragment". EXTRACTED so the one-at-a-time path and the batched
   * path cannot drift: they are two ways of calling the worker, not two renderers, and a
   * fix applied to one of them silently missing the other is precisely the failure
   * `lib/core/render-diagrams.js` was built to stop (#1326, four defects in a row,
   * each one two implementations answering the same question differently).
   *
   * @param {string} svg          Raw worker output.
   * @param {string} definition   The diagram source, for the accessible-name fallback.
   * @param {string|null} extraClass  Extra class on the wrapper, or null.
   */
  let mermaidSvgCounter = 0;
  function finishMermaidSvg(svg, definition, extraClass) {
    // ID ISOLATION — the first thing that happens, and it must happen on EVERY path.
    // mmdc hardcodes the SVG root id to "my-svg" and prefixes every internal id
    // (markers, gradients, filters) and every emitted CSS rule with that same string.
    // When a deck embeds many Mermaid SVGs in one HTML, their `<style>` blocks all use
    // `#my-svg .node …` selectors that step on each other — the last diagram's theme
    // variables (a treeview with primaryColor="#FFFFFF", say) silently override every
    // prior diagram's node fills. Rewrite to a per-diagram suffix so the SVGs are
    // isolated. One global substitution catches the root id, every internal id
    // (my-svg-flowchart-A-0), every url(#my-svg…) reference, and every #my-svg
    // selector inside the embedded <style>.
    //
    // It lived in `renderMermaidOne` until batching arrived, and the batched path
    // did not inherit it — so all 14 diagrams of a gallery came back sharing one
    // prefix. The counter is module-level rather than a function property for exactly
    // that reason: it belongs to "a diagram was finished", not to "a diagram was
    // rendered one-at-a-time". Order is unchanged either way, so the ids a deck emits
    // are identical whether its fences were batched or not.
    svg = svg.replace(/my-svg/g, `lattice-mmd-${++mermaidSvgCounter}`);
    // Mermaid sankey (11.14) emits each node's <text> with the node name on line 1
    // and the outbound-link value on line 2, separated by a literal newline. SVG
    // ignores newlines inside <text>, but the post-mmdc pipeline runs the HTML
    // through markdown-it, which parses `\n\n` inside the inlined SVG as a paragraph
    // break and wraps the value in <p>…</p>. The resulting <text>Wages<p>750</text>
    // is invalid SVG and breaks text positioning, producing the visible
    // "750Disposable income750Savings…" run-together labels. Sankey is the only
    // diagram type that puts newlines inside <text>; gate on the sankey-specific
    // <g class="links"> marker so the substitution doesn't touch <text> elements in
    // any other diagram type.
    if (svg.includes('<g class="links"')) {
      svg = svg.replace(/(<text\b[^>]*>)([\s\S]*?)(<\/text>)/g, (_m, open, inner, close) => {
        const collapsed = inner.replace(/\s*\n\s*/g, ' ').trim();
        return `${open}${collapsed}${close}`;
      });
    }
    // ── PAST THIS POINT mmdc HAS SUCCEEDED ──────────────────────────────────────
    // Everything below is post-processing on a string we already hold, and it must
    // NOT be retried by the caller: on the one-at-a-time path the temp dir is already
    // gone, so a re-run of mmdc would fail on a missing input file and report
    // `Command failed: … mmdc …` — blaming the renderer for a bug in our own code.
    // That is exactly what happened when the accessible-name injection first landed
    // (ADR §17.13): a TDZ error here cost several minutes of misdiagnosis because the
    // retry laundered it. §17.13 stated the lesson and did not apply it; this is the
    // fix: post-processing gets its own try, so a throw here degrades to the
    // UNPROCESSED-but-valid SVG and says so, instead of masquerading as a failure.
    try {
      // ACCESSIBLE NAME. Mermaid emits its root as `role="graphics-document document"`
      // with NO name unless the author wrote `accTitle:` / `accDescr:` in the diagram
      // source — so an un-annotated diagram reaches a screen reader as an anonymous
      // graphics document. We do not author this markup (mmdc does), so the fix is
      // additive and conservative: only when the SVG carries no name of its own, label
      // it with the diagram's TYPE, read from the first meaningful line of the source.
      // That is a floor, not a description — `accTitle:`/`accDescr:` remain the right
      // way to say what a diagram MEANS, and mermaid's own `<title>`/`aria-labelledby`
      // is left untouched wherever it exists. Semantic-html ADR §17.12.
      if (!/\saria-label(?:ledby)?=/.test(svg.slice(0, svg.indexOf('>') + 1)) && !/<title\b/.test(svg)) {
        const kind = mermaidKindLabel(definition);
        svg = svg.replace(/^(\s*<svg\b)/, `$1 aria-label="${escAttrLocal(kind)}"`);
      }
    } catch (postErr) {
      // The diagram itself is fine — only our decoration failed. Ship the SVG.
      console.warn(`  ⚠ Mermaid post-processing failed (diagram still rendered): ${postErr?.message}`);
    }
    const cls = extraClass ? `mermaid-svg ${extraClass}` : 'mermaid-svg';
    // STAMP THE STAND-DOWN. When the author pins a theme in the fence, the engine emits no
    // palette AND no font keys — the diagram deliberately wears Mermaid's stock look, which
    // means its labels are deliberately NOT in the deck's face. Nothing in the output said
    // so, so `tools/check-diagram-labels.js` could not tell a diagram that opted out from
    // one the finish failed to reach: it had to fall back to a denylist of five Mermaid
    // default face names, which passes any face that is merely WRONG rather than famous.
    // One attribute makes the export self-describing and lets that gate ask the exact
    // question — "is this label in the face its own slide asked for?" — with an exemption
    // that is a fact about the diagram rather than a guess.
    const pinned = authorPinsTheme(definition) ? ' data-author-theme="1"' : '';
    return `<div class="${cls}"${pinned}>${svg}</div>`;
  }

  /**
   * Render EVERY fence in ONE browser instead of one browser each.
   *
   * THE COST THIS REMOVES. `mmdc` boots its own Chromium, and it was booting one PER
   * DIAGRAM: ~2.9s per fence, which on the 14-fence diagram gallery was 40.7s of a 44.3s
   * render — 92%, the largest single cost anywhere in the CLI
   * (engineering/decisions/2026-08-16-render-format-cost-assessment.md §2b). Batching
   * through `mmdc -i <markdown>` brought that to a measured `1.86s + 1.09s × N`.
   *
   * The worker goes further for free: it reuses ONE PAGE across the batch, so the 1.6 MB
   * Mermaid bundle is parsed once rather than once per diagram, which is where most of
   * that per-diagram second went. Numbers for the change are in the PR's `## Performance`
   * section (HARD RULE #19).
   *
   * NOT ALL-OR-NOTHING ANY MORE, and that is the other improvement. The `mmdc -i`
   * batch wrote `<out>-1.svg`, `<out>-2.svg`, … and a fence it could not parse simply
   * produced no file — which invalidated the index alignment the caller depends on, so
   * one bad fence sent the WHOLE deck back through the one-at-a-time path. The worker
   * returns an index-aligned result per diagram with its own `ok` flag, so a bad fence
   * costs only itself and the other thirteen are already rendered.
   *
   * Returns an array of finished slide fragments index-aligned with `requests`, or `null`
   * when the worker itself could not run at all (no browser, a crash before any diagram)
   * — the caller then falls back to the one-at-a-time path, which retries.
   *
   * @param {Array<{definition: string, themeVars: object, look: string|undefined, extraClass: string|null}>} requests
   */
  function renderMermaidBatch(requests) {
    if (!requests.length) return [];
    const out = runMermaidWorker(requests);
    if (!out.ok || out.results.length !== requests.length) return null;
    return out.results.map((r, i) => {
      if (r.ok) return finishMermaidSvg(r.svg, requests[i].definition, requests[i].extraClass);
      // One fence failed to parse. Degrade THIS diagram only — and say which, because the
      // batch used to be silent about it (the whole run just got slower).
      console.warn(`  ⚠ Mermaid render failed for one diagram: ${String(r.error).split('\n')[0]}`);
      return mermaidFallbackPre(requests[i].definition);
    });
  }

  // Scheme-aware render: a diagram is baked with the dark-resolved themeVars when
  // its slide is dark, else the light-resolved set. Mermaid bakes themeVariables
  // to literal hex at render time, so a light bake can't flip on a section.dark
  // slide — the documented dark-mode gap. Baking the correct scheme per slide
  // closes it natively (including Mermaid's own color-math derivations), with no
  // per-element CSS overrides and no wasted second SVG on single-scheme decks.
  // Author-supplied %%{init}%% diagrams keep their own theming.
  // LATTICE_MERMAID_SINGLE=1 forces the light bake everywhere (fallback to the
  // CSS-override path).
  function renderMermaid(definition, mode, look, hand = false) {
    return renderMermaidOne(definition, ctx.diagramTheme(mode, hand), null, look);
  }

  // Reoriented raw Mermaid definitions, index-aligned with the `data-mmd-idx` stamp on each
  // rendered `.mermaid-svg`. The image-set export's cross-scheme SVG look uses this to RE-BAKE a
  // diagram in a different scheme (mmdc bakes colors at render time, so a CSS restyle can't recolor
  // baked node text/edges — re-running renderMermaid in the look mode can). Empty for decks with no
  // diagrams; only read on a cross-scheme image-set export. PER EXPORT: it lives on this run's
  // `ctx.state`, which the host makes fresh for each bake, so nothing accumulates across decks.
  const MERMAID_REBAKE_DEFS = state.defs;
  // The scheme each diagram was BAKED in (index-aligned with MERMAID_REBAKE_DEFS), so a cross-scheme
  // image-set look re-renders a diagram only when its own bake scheme differs from the look — keyed on
  // the diagram's real bake (from the deck's `color-mode:`), NOT the palette-derived slide scheme,
  // which can disagree (a `color-mode: dark` deck rendered under a light `--image-mode`). SINGLE-SHOT
  // like MERMAID_REBAKE_DEFS above — the two are index-aligned and MUST be reset together if this
  // run-once CLI is ever reused for multiple decks in one process, or a look re-render would read a
  // stale bake mode for the wrong deck's diagram. (They are, now: all four are this run's `ctx.state`.)
  const MERMAID_REBAKE_MODES = state.modes;
  // The LOOK each diagram was baked with (index-aligned with the two arrays above),
  // so a cross-scheme image-set re-bake reproduces the slide's own node renderer.
  // Without it a `mode: sketch` deck's re-baked diagrams would come back CLASSIC
  // while every un-re-baked one stayed hand-drawn — the look version of the
  // scheme mismatch MERMAID_REBAKE_MODES exists to prevent. SINGLE-SHOT and reset
  // together with them.
  const MERMAID_REBAKE_LOOKS = state.looks;
  // Index-aligned with the above: did this diagram bake its labels in the sketch hand
  // face? A cross-scheme re-bake reads a different palette file and must resolve the
  // SAME font token, or a re-baked sketch diagram silently reverts to the clean face.
  const MERMAID_REBAKE_HAND = state.hand;

  function bakeSource(source) {
    const fmMatch = source.match(/^---\r?\n[\s\S]*?\r?\n---/);
    const fm = fmMatch ? fmMatch[0] : '';
    // Deck-wide orientation, resolved by the emulator from the `size:` directive the same way
    // its page geometry does. A portrait deck reorients LR/RL flowcharts to TB/BT
    // (lib/integrations/mermaid/reorient.js) so a wide graph flows down the tall frame instead of
    // shrinking to a thin strip; landscape is untouched.
    const orientation = ctx.orientation;

    // REAL SLIDES, from the engine's own boundaries (lib/core/slide-class-spans.js).
    // This replaced a scan of `source.slice(0, offset)` for the last `_class:`
    // directive anywhere before the fence — which never reset at a slide boundary,
    // while Marp's `_class` is a SINGLE-SLIDE directive that does not carry forward.
    // A bare slide following a `<!-- _class: dark -->` slide therefore got a
    // DARK-baked diagram on a light canvas: white node ink on a light chip (#1329).
    // The old fallback was asymmetric too — once any `_class:` had appeared earlier in
    // the deck, the deck default stopped being consulted for every later slide.
    const { spans } = slideClassSpans(source);

    // Collect the fences, then let the kernel walk. Two passes rather than rendering
    // inside `String.replace`, because the kernel owns the walk now — and because a
    // walk over real slides is what makes the band per SLIDE rather than per fence.
    // BOTH fence characters. The matcher is shared with the NARRATOR (lib/core/mermaid-fences.js)
    // because `narrateDiagram` states the invariant that it reads the same fence this renders —
    // and it used to carry its own copy of the same regex, backticks only. Widening only one of
    // them would draw a `~~~mermaid` diagram the voice could not read.
    // A fence in a PANE lays out for the pane, not the deck: a 35% side pane on a 16:9 slide is
    // a tall box, and a left-to-right flowchart kept wide there shrank to unreadable labels. The
    // engine answers each pane's orientation from the same carve and box `renderPane` uses, with
    // the source lines the pane came from (`paneOrientations`), so a fence finds its pane by its
    // own line: no slide count or marker count to get wrong.
    const paneBoxes = source.includes('pane:') ? require('../../engine').paneOrientations(source) : [];
    const orientationAt = (offset) => {
      if (!paneBoxes.length) return orientation;
      const line = source.slice(0, offset).split('\n').length - 1;
      const pane = paneBoxes.find((p) => p.lines.some(([a, b]) => line >= a && line < b));
      return pane ? pane.orientation : orientation;
    };
    const fences = [];
    for (const m of matchMermaidFences(source)) {
      const slideIndex = Math.max(0, slideIndexAt(spans, m.start));
      fences.push({
        matchStart: m.start,
        matchEnd: m.end,
        slideIndex,
        slideClass: slideClassAt(spans, m.start),
        source: reorientMermaidForPortrait(m.body.trim(), orientationAt(m.start)),
      });
    }
    if (fences.length === 0) return source;

    // One deck entry per slide THAT HAS A DIAGRAM, in document order. `scope` is the
    // resolved band — this path's scope, and its own scopeKey (the kernel's default
    // `String` is exactly right for a band string).
    const bySlide = new Map();
    for (const fence of fences) {
      let slide = bySlide.get(fence.slideIndex);
      if (!slide) {
        slide = {
          // The look rides beside the band on the slide entry: both are per-SLIDE
          // answers read from the same two inputs, so resolving them together is
          // what keeps them from drifting apart the way band and chip did.
          look: resolveDiagramLook({
            frontMatter: fm,
            slideClass: fence.slideClass,
            paletteUsesTexture: PALETTE_USES_TEXTURE,
            // The print band textures EVERY theme's categories (base.print-textures.css),
            // so the look has to see it — the palette file alone cannot answer for print.
            band: resolveDiagramBand({
              frontMatter: fm,
              slideClass: fence.slideClass,
              flagPrint: WANT_PRINT,
            }),
          }),
          // THE SCOPE IS `{ band, hand }` (#1674), not the bare band it used to be.
          // The band decides the palette; `hand` decides whether `--font-body` resolves
          // through the sketch re-point (see readScopeToken). Both are per-SLIDE answers
          // read from the same two inputs, so they are resolved together for the same
          // reason the look is — a scope that answered one per slide and the other per
          // deck would bake a diagram whose palette and type disagreed.
          scope: {
            band: resolveDiagramBand({
              frontMatter: fm,
              slideClass: fence.slideClass,
              // WANT_PRINT, not `flags.print`: `--image-mode print` sets the print
              // canvas too, and passing the narrower flag made the band depend on the
              // front-matter merge alone — so an image set exported in print mode
              // baked full-color ink while manifest.json recorded "print".
              flagPrint: WANT_PRINT,
            }),
            // NOT `look === 'handDrawn'`: a texture palette and the print band both take
            // the hand SHAPE away (redundant encoding cannot survive a hachure stroke)
            // while leaving the hand TYPE, which is what `resolveDiagramHandType` answers.
            hand: resolveDiagramHandType({ frontMatter: fm, slideClass: fence.slideClass }),
          },
          diagrams: [],
        };
        bySlide.set(fence.slideIndex, slide);
      }
      slide.diagrams.push(fence);
    }
    const deck = [...bySlide.keys()].sort((a, b) => a - b).map((k) => bySlide.get(k));

    // TWO PASSES, and the kernel is untouched by design. `renderDiagrams`
    // (lib/core/render-diagrams.js) is SHARED with the browser runtime, which renders
    // in-page and has nothing to batch; widening its synchronous `renderOne` contract
    // to serve one path is exactly the "two renderers deciding the same thing"
    // failure that kernel exists to prevent. So the kernel still drives the walk and
    // still calls back once per diagram — this path's callback just RECORDS the
    // request instead of shelling out, and the batch runs after the walk returns.
    //
    // Pass 1 keeps every index-aligned side effect (MERMAID_REBAKE_*) in exactly the
    // order it had before, because the image-set cross-scheme re-bake reads those by
    // position and a reordering would re-bake the wrong diagram.
    const requests = [];
    const rendered = renderDiagrams(deck, {
      readToken: readScopeToken,
      scopeKey: diagramScopeKey,
      renderOne: (fence, themeVars, meta) => {
        // Keep the source def AND the band it was baked in, index-aligned, so the
        // image-set look re-bake can tell whether THIS diagram needs re-rendering.
        const idx = MERMAID_REBAKE_DEFS.push(fence.source) - 1;
        // The BAND, not the whole scope: `MERMAID_REBAKE_MODES` is compared against a
        // look name (`'light'`/`'dark'`/`'print'`) to decide whether a diagram needs
        // re-baking, and the scope became an object when the hand-type answer joined it.
        MERMAID_REBAKE_MODES[idx] = meta.scope.band;
        // Whether this diagram's labels are in the hand face, so a cross-scheme re-bake
        // resolves the same font token the first bake did.
        MERMAID_REBAKE_HAND[idx] = meta.scope.hand;
        MERMAID_REBAKE_LOOKS[idx] = meta.look;
        requests.push({ definition: fence.source, themeVars, look: meta.look, extraClass: null, scope: meta.scope });
        return { fence, idx };
      },
    });

    // Pass 2: one browser for all of them, falling back to one-per-diagram if the WORKER
    // could not run at all. The fallback is narrower than it used to be and still not a
    // formality: a per-DIAGRAM failure is now degraded in place by the batch, so this
    // path is reached only when nothing rendered — where `renderMermaidOne`'s retry is
    // exactly what is wanted.
    if (!QUIET && requests.length) {
      const scopes = [...new Set(requests.map((r) => diagramScopeKey(r.scope)))].join(', ');
      process.stdout.write(`  Rendering ${requests.length} mermaid diagram${requests.length === 1 ? '' : 's'} (${scopes}) in one pass...`);
    }
    let htmls = renderMermaidBatch(requests);
    if (!htmls) {
      htmls = requests.map((r) => renderMermaidOne(r.definition, r.themeVars, r.extraClass, r.look));
    } else if (!QUIET) {
      console.log(' done');
    }
    for (const r of rendered) {
      // Stamp the def index so a cross-scheme image-set export can find + re-bake
      // this exact diagram.
      r.html = htmls[r.idx].replace(/(<div class="mermaid-svg[^"]*")/, `$1 data-mmd-idx="${r.idx}"`);
    }

    // Splice the rendered diagrams back in, by slicing. NOT because `String.replace` was
    // unsafe — a replacement FUNCTION never interprets `$1`/`$&`, only a replacement
    // string does, so the previous form had no corruption hazard and an earlier version of
    // this comment claiming otherwise was simply wrong. The reason is that the kernel owns
    // the walk now: results come back as a list, and slicing is how a list of (offset,
    // html) pairs goes back into the source without re-deriving the match.
    const byStart = new Map(rendered.map((r) => [r.fence.matchStart, r.html]));
    let out = '';
    let cursor = 0;
    for (const fence of fences) {
      out += source.slice(cursor, fence.matchStart);
      out += byStart.get(fence.matchStart) ?? source.slice(fence.matchStart, fence.matchEnd);
      cursor = fence.matchEnd;
    }
    return out + source.slice(cursor);
  }


  state.renderOne = renderMermaidOne;
  state.renderInBand = renderMermaid;
  return bakeSource;
}

/**
 * The plugin's bake: `source` with every Mermaid fence replaced by its drawn `.mermaid-svg`
 * (or, for a diagram Mermaid rejects, an escaped `.mermaid-fallback` block).
 * @param {string} source  the deck's Markdown
 * @param {object} ctx     the host's bake context (see the header)
 * @returns {string}
 */
function bake(source, ctx) {
  return createRun(ctx)(source);
}

module.exports = { bake };
