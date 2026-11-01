/**
 * lib/plugins/host-bake.js — the plugin host's NODE half for the CLI export: every plugin that
 * declares a `bake` draws its figures into the deck's Markdown before the engine renders it.
 *
 * A bake exists because the CLI export page runs without the runtime (its overflow watcher
 * would paint into the print — engineering/decisions/2026-09-27-plugin-system.md §4.7), so a
 * plugin a runtime PASS draws in a browser (`render.exec.hydrate: "pass"`, Mermaid) must be
 * drawn here instead; the resolver refuses such a plugin without one.
 *
 * The host decides WHICH bakes run and in what order — every plugin with a bake that this deck
 * LOADS (`admitPlugins`: the default set, the deck's `plugins:` list, the plugins its slide
 * classes require; less `disabled`), in dependency order, and only for a deck that uses it
 * (`usesPlugin`: its `detect`, or one of its fence names; plugin-system §4.8 — the probe decides
 * when an admitted plugin's work runs, never whether the plugin is loaded) — and hands each a frozen `ctx`: the caller's export services (`BAKE_SERVICES`)
 * plus the plugin's `name` and a fresh `state` object the bake may fill for the caller to read
 * back. The plugin decides how.
 *
 * THE MOTION TAGGER. A bake whose figures can animate may publish `ctx.state.motionTagger`: a
 * closure-free function that writes the live runtime's motion roles on one drawn `<svg>`. The
 * player export injects every published tagger into its capture page as text and runs each on the
 * baked copies, so it names no plugin (lattice.js, the player capture).
 *
 * THE RE-BAKE HOOK. A bake whose figures bake a palette in (Mermaid's) may publish
 * `ctx.state.rebake`, and the image-set export's cross-scheme look reads only that — never a
 * plugin's name or its own record:
 *
 *   noun                 how a warning names one figure ('Mermaid diagram')
 *   keptWhy, keptFix, failedWhy   the warnings' plugin-specific words: what fixed a figure's
 *                        colors, what the author can remove, and what failed
 *   figure, indexAttr    the selector of a re-bakeable figure in the rendered page, and the
 *                        attribute carrying its index (stamped by the bake)
 *   bakedBand(idx)       the band ('light' | 'dark' | 'print') the figure was baked in
 *   render(idx, { band, palette })  the figure re-rendered for `band` from `palette`:
 *                        `{ markup, kept }` (its figure element carrying `data-look-idx`; `kept`
 *                        when author colors survive the re-render), `{ kept: true }` (nothing to
 *                        re-render — the author fixed every color), `{ failed: true }`, or null A bake runs synchronously and returns the new
 * source; `render.exec.bake: "subprocess"` says it may block on another process to get there.
 *
 * Fail-soft by default, like every renderer: a bake that throws or returns a non-string leaves the
 * source as it was — the fence then renders as the code block the engine gives it — and the host
 * warns once, naming the plugin. The CLI passes `strict`, and there a failed bake throws, naming
 * the plugin, so the export exits non-zero as it did before phase D: an export that "succeeds"
 * with source where every diagram should be is the worst outcome an export engine has, and a
 * diagram Mermaid rejects is already degraded INSIDE the bake, one diagram at a time (HARD RULE #25
 * inversion lens, phase D).
 */

const { BAKERS } = require('./bake.generated.js');

/**
 * THE EXPORT SERVICES a bake may read, and nothing else — every one generic, so the export that
 * supplies them names no plugin (phase D's browser half took `diagramTheme`, Mermaid's theme
 * assembly, out of this list and into Mermaid's bake). `bakeDeck` refuses a service not listed
 * here: a plugin that needs a new one adds a GENERIC service to this list, with its contract.
 *
 *   pkgRoot             the package root (workers and fonts resolve from it)
 *   quiet               no progress output
 *   print               the print band is on (`--print`, or an image set in print mode)
 *   paletteUsesTexture  the deck's palette carries the texture channel
 *   orientation         the deck's orientation name, from its `size:` directive
 *   paneOrientations(source)      each pane's orientation and the source lines it came from, from
 *                                 the engine's own carve, so a figure in a pane lays out for the pane
 *   browser             `{ path, args }` — the Chromium every CLI launch uses, kept offline
 *   readToken(scope, name)        a palette token as a `{ band, hand }` scope resolves it
 *   scopeKey(scope)               names the palette a scope resolves, for memoization
 *   paletteReader(palette, hand)  a token reader (name → value) over any palette, with the
 *                                 sketch hand face's re-points — for a palette the export parsed
 *                                 from another theme file (the image-set look)
 *   fileConfine                   the CLI's local-file confiner (lib/core/file-confine.js): `.roots` are the REAL folders a render
 *                                 may read from, `.allows(fileUrl)` the check; a bake that opens its own browser page applies it
 */
const BAKE_SERVICES = Object.freeze(['pkgRoot', 'quiet', 'print', 'paletteUsesTexture', 'orientation', 'paneOrientations', 'browser', 'readToken', 'scopeKey', 'paletteReader', 'fileConfine']);
const { PLUGIN_GRAMMAR } = require('./grammar.generated.mjs');

/**
 * What the HOST adds to every bake's ctx beside the export's services (2026-11-01-plugin-contract-hollywood.md §4): the
 * engine's vocabularies a bake reads (the diagram vocabulary, and how the engine reads slides from a deck's source)
 * and the deck's text faces. Lazy, so a deck with no bake loads none of it.
 */
/**
 * THE HOST'S LOCKED PAGE for a bake that needs a real browser page (Mermaid measures its labels in the page that draws
 * them): `ctx.runPage(job, { timeout })` runs lib/plugins/host-page-worker.js as a child process, which launches the code
 * sandbox, serves the plugin's committed files on a synthetic origin, and calls the plugin's page role
 * (`<name>.page.js` `draw`). Synchronous, because a bake runs during the export's module evaluation. Returns the child's
 * `status`, `stderr` and `error`, and its result file parsed (`out`, null when it wrote none). The plugin never launches
 * or confines a browser itself (2026-11-01-plugin-contract-hollywood.md §2, the `sandbox` row).
 */
function runPageFor(plugin, pkgRoot) {
  return (job, { timeout } = {}) => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { spawnSync } = require('node:child_process');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `${plugin}-page-`));
    try {
      const jobFile = path.join(tmpDir, 'job.json');
      const outFile = path.join(tmpDir, 'out.json');
      // Resolved from the package root rather than __dirname, so a bundled emulator finds both files the way it finds the fonts.
      const module_ = path.join(pkgRoot, 'lib', 'plugins', plugin, `${plugin}.page.js`);
      const worker = path.join(pkgRoot, 'lib', 'plugins', 'host-page-worker.js');
      fs.writeFileSync(jobFile, JSON.stringify({ ...job, plugin, module: module_, pkgRoot, outFile }));
      const run = spawnSync(process.execPath, [worker, jobFile], { stdio: ['ignore', 'ignore', 'pipe'], timeout, encoding: 'utf8' });
      let out = null;
      try {
        out = JSON.parse(fs.readFileSync(outFile, 'utf8'));
      } catch (_e) {
        /* the child wrote no result: the caller reads status and stderr */
      }
      return { status: run.status, stderr: String(run.stderr ?? ''), error: run.error || null, out };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  };
}

let bakeExtras = null;
function hostBakeExtras() {
  if (!bakeExtras) {
    bakeExtras = Object.freeze({
      vocabulary: Object.freeze({ diagram: require('../core/diagram-vocabulary.js'), deck: require('../core/deck-vocabulary.js') }),
      fonts: Object.freeze({ faces: require('../fonts/text-faces.js').TEXT_FACES }),
    });
  }
  return bakeExtras;
}
const { admitPlugins, usesPlugin } = require('./host-grammar.mjs');

/**
 * @param {string} source  the deck's Markdown
 * @param {object} services  the export's services, spread onto every bake's `ctx`
 *   (lib/plugins/mermaid/mermaid.bake.js lists the ones Mermaid reads)
 * @param {{ disabled?: Iterable<string>, defaults?: Iterable<string>, bakers?: ReadonlyArray<{ name: string, load: () => { bake: Function } }>,
 *           grammar?: ReadonlyArray<object>, warn?: (msg: string) => void, strict?: boolean }} [opts]
 *   `bakers` and `grammar` default to the generated registry (tests pass synthetic ones)
 * @returns {{ source: string, contexts: Map<string, object> }}
 *   `contexts` — each bake that ran, by plugin name, with the `state` it filled
 */
function bakeDeck(source, services, { disabled = [], defaults, bakers = BAKERS, grammar = PLUGIN_GRAMMAR, warn = (m) => console.warn(m), strict = false } = {}) {
  const unknown = Object.keys(services).filter((k) => !BAKE_SERVICES.includes(k));
  if (unknown.length) throw new Error(`bakeDeck: ${unknown.join(', ')} ${unknown.length === 1 ? 'is not a bake service' : 'are not bake services'}; a bake reads only the generic services in BAKE_SERVICES (lib/plugins/host-bake.js)`);
  const admission = admitPlugins(source, { disabled: [...disabled], ...(defaults === undefined ? {} : { defaults }), grammar });
  const active = new Map(admission.active.map((g) => [g.name, g]));
  const contexts = new Map();
  let out = source;
  for (const baker of bakers) {
    const g = active.get(baker.name);
    if (!g || !usesPlugin(g, out)) continue;
    const ctx = Object.freeze({ ...services, ...hostBakeExtras(), runPage: runPageFor(baker.name, services.pkgRoot), name: baker.name, state: {} });
    let next;
    try {
      next = baker.load().bake(out, ctx);
    } catch (e) {
      if (strict) throw new Error(`plugin "${baker.name}": its bake failed: ${e?.message ?? e}`, { cause: e });
      warn(`  ⚠ plugin "${baker.name}": its bake failed (${String(e?.message ?? e).split('\n')[0]}); its figures export as source.`);
      continue;
    }
    if (typeof next !== 'string') {
      if (strict) throw new Error(`plugin "${baker.name}": its bake returned no text`);
      warn(`  ⚠ plugin "${baker.name}": its bake returned no text; its figures export as source.`);
      continue;
    }
    out = next;
    contexts.set(baker.name, ctx);
  }
  return { source: out, contexts };
}

module.exports = { bakeDeck, BAKE_SERVICES };
