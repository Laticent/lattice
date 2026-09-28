/**
 * lib/plugins/host-grammar.mjs — the plugin host's GRAMMAR half: it installs every plugin's
 * markdown-it rules. Plugins never install themselves.
 *
 * The ENGINE calls it (through lib/plugins/host.js), which installs every rule and attaches the
 * renderers. The BOUNDARY parser (lib/core/boundary-parser.mjs) installs the same block rules
 * through `blocks.generated.mjs` instead — a straight-line copy of this order that the build
 * writes, because that parser ships in the Studio's startup JavaScript and this generic host
 * does not need to. test/unit/plugins/resolve.test.js holds the two to one sequence, so they
 * agree about where a slide starts.
 *
 * ESM and library-free: the docs site bundles lib/ with Rollup, which does no named-export
 * interop on a CommonJS file under lib/. Everything here reads `grammar.generated.mjs`, which
 * `tools/build-plugin-registry.js` writes from the manifests.
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
 * Does `src` use plugin `g`? Its own `detect(source)` for its syntax, OR one of its fences — the
 * host derives that probe from the fence names and aliases the manifest declares, so a fence-only
 * plugin needs no `detect` (engineering/decisions/2026-09-27-plugin-system.md §4.8). Errs toward
 * true, like every `detect`: a false positive costs one needless load, a miss ships unrendered
 * content.
 * @param {object} g  a grammar entry (grammar.generated.mjs)
 * @param {string} src
 */
export function usesPlugin(g, src) {
  if (!src) return false;
  if (g.detect?.(src)) return true;
  const names = Object.entries(g.fences || {}).flatMap(([name, decl]) => [name, ...decl.aliases.map((a) => a.name)]);
  if (!names.length) return false;
  // Any indentation and blockquote markers before the opener, as math's MATH_FENCE allows and for
  // the same reason: markdown-it opens a fence inside `> ` and inside a list item.
  const fence = new RegExp(`^[ \t>]*(?:\`{3,}|~{3,})[ \t]*(?:${names.join('|')})(?:[ \t]|$)`, 'm');
  return fence.test(src);
}
