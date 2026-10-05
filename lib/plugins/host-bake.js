/**
 * lib/plugins/host-bake.js — the plugin host's NODE half for the CLI export: every plugin that
 * declares a `bake` draws its figures into the deck's Markdown before the engine renders it.
 *
 * A bake exists because the CLI export page runs without the runtime (its overflow watcher
 * would paint into the print — engineering/decisions/2026-09-27-plugin-system.md §4.7), so a
 * plugin a runtime PASS draws in a browser (`render.exec.hydrate: "pass"`, Mermaid) must be
 * drawn here instead; the resolver refuses such a plugin without one.
 *
 * The host decides WHICH bakes run and in what order — every active plugin with a bake, in
 * dependency order, only for a deck that uses it (`usesPlugin`: its `detect`, or one of its
 * fence names) — and hands each a frozen `ctx`: the caller's export services (`BAKE_SERVICES`)
 * plus the plugin's `name` and a fresh `state` object the bake may fill for the caller to read
 * back. The plugin decides how.
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
 *   browser             `{ path, args }` — the Chromium every CLI launch uses, kept offline
 *   readToken(scope, name)        a palette token as a `{ band, hand }` scope resolves it
 *   scopeKey(scope)               names the palette a scope resolves, for memoization
 *   paletteReader(palette, hand)  a token reader (name → value) over any palette, with the
 *                                 sketch hand face's re-points — for a palette the export parsed
 *                                 from another theme file (the image-set look)
 */
const BAKE_SERVICES = Object.freeze(['pkgRoot', 'quiet', 'print', 'paletteUsesTexture', 'orientation', 'browser', 'readToken', 'scopeKey', 'paletteReader']);
const { PLUGIN_GRAMMAR } = require('./grammar.generated.mjs');
const { activePlugins, usesPlugin } = require('./host-grammar.mjs');

/**
 * @param {string} source  the deck's Markdown
 * @param {object} services  the export's services, spread onto every bake's `ctx`
 *   (lib/plugins/mermaid/mermaid.bake.js lists the ones Mermaid reads)
 * @param {{ disabled?: Iterable<string>, bakers?: ReadonlyArray<{ name: string, load: () => { bake: Function } }>,
 *           grammar?: ReadonlyArray<object>, warn?: (msg: string) => void, strict?: boolean }} [opts]
 *   `bakers` and `grammar` default to the generated registry (tests pass synthetic ones)
 * @returns {{ source: string, contexts: Map<string, object> }}
 *   `contexts` — each bake that ran, by plugin name, with the `state` it filled
 */
function bakeDeck(source, services, { disabled = [], bakers = BAKERS, grammar = PLUGIN_GRAMMAR, warn = (m) => console.warn(m), strict = false } = {}) {
  const unknown = Object.keys(services).filter((k) => !BAKE_SERVICES.includes(k));
  if (unknown.length) throw new Error(`bakeDeck: ${unknown.join(', ')} ${unknown.length === 1 ? 'is not a bake service' : 'are not bake services'}; a bake reads only the generic services in BAKE_SERVICES (lib/plugins/host-bake.js)`);
  const active = new Map(activePlugins([...disabled], grammar).map((g) => [g.name, g]));
  const contexts = new Map();
  let out = source;
  for (const baker of bakers) {
    const g = active.get(baker.name);
    if (!g || !usesPlugin(g, out)) continue;
    const ctx = Object.freeze({ ...services, name: baker.name, state: {} });
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
