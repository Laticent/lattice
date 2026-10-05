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

import { deckClassTokens, deckPluginList, isPluginName } from './deck-plugins.mjs';
import { COMPONENT_PLUGINS, PLUGIN_GRAMMAR } from './grammar.generated.mjs';

/**
 * THE SHIPPED DEFAULT SET: every plugin in the registry (owner, 2026-10-05). A deck that lists
 * nothing renders exactly as it did before plugins were loaded explicitly. A host may narrow it
 * (`createEngine({ plugins: { defaults } })`); a plugin that is not in it loads only when a deck
 * lists it or a component the deck uses requires it.
 */
export const DEFAULT_PLUGINS = Object.freeze(PLUGIN_GRAMMAR.map((p) => p.name));

/**
 * WHAT LOADS A PLUGIN (engineering/decisions/2026-09-27-plugin-system.md §9 decision 6). Every
 * plugin is loaded EXPLICITLY, by one of three routes, and nothing else admits one:
 *
 *   default     it is in the host's default set (`DEFAULT_PLUGINS`, unless the host narrowed it)
 *   listed      the deck names it in its front-matter `plugins:` import list (deck-plugins.mjs)
 *   component   a slide class the deck uses requires it (`plugins.requires` in the component's
 *               manifest, §9 decision 5)
 *
 * plus `required`: a loaded plugin loads what it `requires`, transitively — an import of an import.
 * `optional` loads nothing. The usage probe (`usesPlugin`) is NOT a route: it decides when an
 * admitted plugin's payload or bake runs (§4.8), never whether the plugin is there.
 *
 * Then the host's own switch, `disabled` (`createEngine({ plugins: { disabled } })`, `math: false`),
 * turns a plugin off whatever admitted it, and every plugin that requires it with it
 * (`activePlugins`). A deck cannot turn on what its host switched off.
 *
 * Returns the ACTIVE plugins (grammar entries, dependency order), `off` (every known plugin that
 * is not active, sorted — what the engine keys its parser on), `unknown` (listed names no plugin
 * has, in the author's order, for a diagnostic), `unloaded` (plugins NO route loaded that the deck
 * nonetheless USES, by the usage probe — the probe never admits, but it does warn, so a host that
 * narrows its default set does not silently turn `$x$` into TeX source; empty whenever every
 * plugin is in the default set, and the probe never runs then), and with `explain`, `reasons`: per plugin, every
 * route that admitted it, which the Studio's Plugins tab shows. Without `explain` the class scan
 * is skipped once nothing is left to admit, so a render on the default set reads no class.
 *
 * @param {string} source  the deck's Markdown
 * @param {{ defaults?: Iterable<string>, disabled?: Iterable<string>, explain?: boolean,
 *   grammar?: ReadonlyArray<object>, componentPlugins?: Record<string, ReadonlyArray<string>> }} [opts]
 */
export function admitPlugins(source, { defaults, disabled = [], explain = false, grammar = PLUGIN_GRAMMAR, componentPlugins = COMPONENT_PLUGINS } = {}) {
  const known = new Set(grammar.map((g) => g.name));
  const reasons = new Map();
  const admit = (name, reason) => {
    if (!known.has(name)) return;
    if (!reasons.has(name)) reasons.set(name, []);
    const list = reasons.get(name);
    if (!list.some((r) => r.kind === reason.kind && r.component === reason.component && r.by === reason.by)) list.push(reason);
  };
  // No `defaults` = the whole default set: every plugin in `grammar` (`DEFAULT_PLUGINS` for the
  // shipped registry; a test's own grammar is all on by default too).
  for (const name of defaults ?? known) admit(name, { kind: 'default' });
  const unknown = [];
  for (const name of deckPluginList(source)) {
    if (known.has(name)) admit(name, { kind: 'listed' });
    else unknown.push(name);
  }
  if (explain || reasons.size < known.size) {
    for (const cls of deckClassTokens(source)) {
      for (const name of Object.hasOwn(componentPlugins, cls) ? componentPlugins[cls] : []) admit(name, { kind: 'component', component: cls });
    }
  }
  // A loaded plugin loads what it requires. The grammar is in dependency order — a plugin comes
  // after everything it requires — so one pass from the end closes the set transitively.
  for (let i = grammar.length - 1; i >= 0; i--) {
    const g = grammar[i];
    if (!reasons.has(g.name)) continue;
    for (const dep of g.requires) admit(dep, { kind: 'required', by: g.name });
  }
  const off = new Set(disabled);
  for (const name of known) if (!reasons.has(name)) off.add(name);
  const active = activePlugins(off, grammar);
  const activeNames = new Set(active.map((g) => g.name));
  // The probe as a WARNING, never a route: what the deck uses but nothing loaded. The host's own
  // switch is not reported here — the host chose it (`componentPluginDiagnostics` covers a class).
  const switchedOff = new Set(disabled);
  const unloaded = grammar.filter((g) => !reasons.has(g.name) && !switchedOff.has(g.name) && usesPlugin(g, source)).map((g) => g.name);
  const out = {
    active,
    unloaded,
    off: [...known].filter((n) => !activeNames.has(n)).sort(),
    unknown: unknown.map((name) => ({ name, malformed: !isPluginName(name) })),
  };
  if (explain) out.reasons = Object.fromEntries([...reasons].map(([n, r]) => [n, Object.freeze(r)]));
  return out;
}

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
  // the same reason: markdown-it opens a fence inside `> ` and inside a list item. The name ends
  // at anything but a word character or `-` — Mermaid's own fence matcher's reading
  // (lib/core/mermaid-fences.js `isMermaidInfo`), so the probe is a superset of it: ```mermaid{…}
  // counts. Between the fence and the name, ANY whitespace but a newline — `isMermaidInfo` trims
  // with `String.trim()`, so a no-break space or a form feed there (a paste, macOS Option-Space)
  // still names the fence, and a probe that allowed only space and tab skipped that deck's bake
  // while the preview drew it (HARD RULE #25 red team, phase D).
  const fence = new RegExp(`^[ \t>]*(?:\`{3,}|~{3,})[^\\S\\n]*(?:${names.join('|')})(?![\\w-])`, 'm');
  return fence.test(src);
}
