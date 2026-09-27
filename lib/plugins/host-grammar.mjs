/**
 * lib/plugins/host-grammar.mjs — the plugin host's GRAMMAR half: it installs every plugin's
 * markdown-it rules. Plugins never install themselves.
 *
 * Two parsers call it, and they must agree about where a slide starts:
 *
 *   - the ENGINE (through lib/plugins/host.js), which installs every rule and attaches the
 *     renderers;
 *   - the BOUNDARY parser (lib/core/boundary-parser.mjs), which installs the BLOCK rules only, so
 *     a plugin block whose body looks like Markdown structure (a `$$` matrix with a lone `=`
 *     line) is opaque there too and cannot become a slide break.
 *
 * ESM and KaTeX-free for the boundary parser's sake: the docs site bundles it with Rollup, which
 * does no named-export interop on a CommonJS file under lib/, and it must not pull a renderer
 * library into a module that only wants block tokens. Everything here reads
 * `grammar.generated.mjs`, which `tools/build-plugin-registry.js` writes from the manifests.
 *
 * INSTALL ORDER. markdown-it's `ruler.after(anchor, …)` inserts DIRECTLY after the anchor, so
 * two rules installed after one anchor run in REVERSE install order; `ruler.before(anchor, …)`
 * inserts directly before it, so those keep install order. The host therefore installs `after`
 * rules walking the plugins backwards and `before` rules walking them forwards — both come out
 * in dependency order, which is the only order plugins are promised
 * (engineering/decisions/2026-09-27-plugin-system.md §4.4).
 */

import { PLUGIN_GRAMMAR } from './grammar.generated.mjs';

/**
 * The plugins that run, given the ones switched off: a disabled plugin disables every plugin
 * that `requires` it, transitively (the grammar is in dependency order, so one pass is enough);
 * a plugin that only lists it as `optional` runs without it.
 * @param {Iterable<string>} [disabled]
 * @param {ReadonlyArray<object>} [grammar] — defaults to the generated registry; tests pass their own
 */
export function activePlugins(disabled = [], grammar = PLUGIN_GRAMMAR) {
  const off = new Set(disabled);
  const out = [];
  for (const p of grammar) {
    if (off.has(p.name) || p.requires.some((d) => off.has(d))) {
      off.add(p.name);
      continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * Install the syntax rules of every active plugin on `md`.
 * @param {import('markdown-it').default} md
 * @param {{ disabled?: Iterable<string>, kinds?: Array<'inline'|'block'>, grammar?: ReadonlyArray<object> }} [opts]
 * @returns the active plugins, in dependency order
 */
export function installGrammar(md, { disabled = [], kinds = ['inline', 'block'], grammar = PLUGIN_GRAMMAR } = {}) {
  const active = activePlugins(disabled, grammar);
  for (const kind of kinds) {
    const ruler = kind === 'inline' ? md.inline.ruler : md.block.ruler;
    const entries = [];
    for (const p of active) {
      for (const [token, rule] of Object.entries(p.syntax)) {
        if (rule.kind === kind) entries.push({ token, rule });
      }
    }
    for (const { token, rule } of entries) {
      if (rule.anchor.before) ruler.before(rule.anchor.before, token, rule.run);
    }
    for (const { token, rule } of [...entries].reverse()) {
      if (rule.anchor.after) ruler.after(rule.anchor.after, token, rule.run);
    }
  }
  return active;
}

/**
 * Token types whose body renders no inline Markdown — a plugin block declared `opaque`. lint-core
 * skips them as it skips a code fence (no pill, no inline lint inside a `$$` equation). Every
 * plugin's, whether or not it is switched off, because lint reads the source, not a render.
 */
export const OPAQUE_BLOCK_TOKENS = Object.freeze(
  PLUGIN_GRAMMAR.flatMap((p) => Object.entries(p.syntax)
    .filter(([, rule]) => rule.kind === 'block' && rule.opaque)
    .map(([token]) => token)),
);
