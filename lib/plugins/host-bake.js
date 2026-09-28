/**
 * lib/plugins/host-bake.js — the plugin host's NODE half for the CLI export: every plugin that
 * declares a `bake` draws its figures into the deck's Markdown before the engine renders it.
 *
 * A bake exists because the CLI export page runs without the runtime (its overflow watcher
 * would paint into the print — engineering/decisions/2026-09-27-plugin-system.md §4.7), so a
 * plugin the RUNTIME draws in a browser (`render.exec.hydrate: "runtime"`, Mermaid) must be
 * drawn here instead; the resolver refuses such a plugin without one.
 *
 * The host decides WHICH bakes run and in what order — every active plugin with a bake, in
 * dependency order, only for a deck that uses it (`usesPlugin`: its `detect`, or one of its
 * fence names) — and hands each a frozen `ctx`: the caller's export services plus the plugin's
 * `name` and a fresh `state` object the bake may fill for the caller to read back (Mermaid's
 * image-set re-bake does). The plugin decides how. A bake runs synchronously and returns the new
 * source; `render.exec.bake: "subprocess"` says it may block on another process to get there.
 *
 * Fail-soft, like every renderer: a bake that throws or returns a non-string leaves the source
 * as it was — the fence then renders as the code block the engine gives it — and the host warns
 * once, naming the plugin.
 */

const { BAKERS } = require('./bake.generated.js');
const { PLUGIN_GRAMMAR } = require('./grammar.generated.mjs');
const { activePlugins, usesPlugin } = require('./host-grammar.mjs');

/**
 * @param {string} source  the deck's Markdown
 * @param {object} services  the export's services, spread onto every bake's `ctx`
 *   (lib/plugins/mermaid/mermaid.bake.js lists the ones Mermaid reads)
 * @param {{ disabled?: Iterable<string>, bakers?: ReadonlyArray<{ name: string, load: () => { bake: Function } }>,
 *           grammar?: ReadonlyArray<object>, warn?: (msg: string) => void }} [opts]
 *   `bakers` and `grammar` default to the generated registry (tests pass synthetic ones)
 * @returns {{ source: string, contexts: Map<string, object> }}
 *   `contexts` — each bake that ran, by plugin name, with the `state` it filled
 */
function bakeDeck(source, services, { disabled = [], bakers = BAKERS, grammar = PLUGIN_GRAMMAR, warn = (m) => console.warn(m) } = {}) {
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
      warn(`  ⚠ plugin "${baker.name}": its bake failed (${String(e?.message ?? e).split('\n')[0]}); its figures export as source.`);
      continue;
    }
    if (typeof next !== 'string') {
      warn(`  ⚠ plugin "${baker.name}": its bake returned no text; its figures export as source.`);
      continue;
    }
    out = next;
    contexts.set(baker.name, ctx);
  }
  return { source: out, contexts };
}

module.exports = { bakeDeck };
